// OpenID4VP holder (Presentation Exchange, response_mode direct_post): parse the authorization
// request, fetch and check the request object, pick a matching credential, build the vp_token and
// post it to response_uri.
import { randomUUID } from 'node:crypto';
import {
  ProtocolStep,
  type HeldCredential,
  type MockWalletTamper,
  type RespondRequest,
  type RespondResponse,
} from '@playground/shared';
import { base64url, decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { call, form, parseJson, USER_AGENT, WalletError } from './http.ts';
import type { HolderKey } from './keys.ts';
import { signPresentation } from './ldp.ts';
import { forgeDisclosure, presentSdJwt, sdJwtClaims, splitSdJwt } from './sdjwt.ts';

interface Field {
  path: string[];
  filter?: { type?: string; pattern?: string; const?: unknown; contains?: { const?: unknown } };
  optional?: boolean;
}
interface InputDescriptor {
  id: string;
  format?: Record<string, unknown>;
  constraints?: { fields?: Field[]; limit_disclosure?: 'required' | 'preferred' };
}
export interface PresentationDefinition {
  id: string;
  input_descriptors: InputDescriptor[];
}

export interface AuthorizationRequest {
  client_id: string;
  response_uri: string;
  response_mode?: string;
  nonce: string;
  state?: string;
  presentation_definition: PresentationDefinition;
}

const SD_JWT_FORMATS = ['vc+sd-jwt', 'dc+sd-jwt'];

// ---------- request ----------

/** did:web:host%3Aport:path → https://host:port/path/did.json (or /.well-known/did.json without a path). */
export function didWebUrl(did: string): string {
  const [host = '', ...path] = did
    .replace(/^did:web:/, '')
    .split(/[#?]/)[0]!
    .split(':');
  const origin = `https://${decodeURIComponent(host)}`;
  return path.length
    ? `${origin}/${path.map(decodeURIComponent).join('/')}/did.json`
    : `${origin}/.well-known/did.json`;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error('not base58');
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** Checks a request object signed by a did:web verifier (Ed25519, publicKeyMultibase). Problems become warnings. */
async function checkRequestObject(
  jwt: string,
  clientId: string,
  warnings: string[],
): Promise<void> {
  if (!clientId.startsWith('did:web:')) {
    warnings.push(`Request object signature not checked: client_id ${clientId} is not did:web`);
    return;
  }
  const { kid, alg } = decodeProtectedHeader(jwt);
  if (kid && !kid.startsWith(`${clientId}#`)) {
    warnings.push(`Request object kid ${kid} is not a key of client_id ${clientId}`);
  }
  try {
    const res = await fetch(didWebUrl(clientId), {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = (await res.json()) as {
      verificationMethod?: Array<{
        id: string;
        publicKeyMultibase?: string;
        publicKeyJwk?: object;
      }>;
    };
    const methods = doc.verificationMethod ?? [];
    const method = methods.find((m) => m.id === kid) ?? methods[0];
    if (!method) throw new Error('DID document has no verification method');
    let jwk: object | undefined = method.publicKeyJwk;
    if (!jwk && method.publicKeyMultibase?.startsWith('z')) {
      const bytes = base58Decode(method.publicKeyMultibase.slice(1));
      if (bytes[0] !== 0xed || bytes[1] !== 0x01)
        throw new Error('publicKeyMultibase is not an Ed25519 key');
      jwk = { kty: 'OKP', crv: 'Ed25519', x: base64url.encode(bytes.slice(2)) };
    }
    if (!jwk) throw new Error('verification method has no usable public key');
    await jwtVerify(jwt, await importJWK(jwk as never, alg ?? 'EdDSA'));
  } catch (e) {
    warnings.push(
      `Request object signature not verified via ${didWebUrl(clientId)}: ${(e as Error).message}`,
    );
  }
}

export async function resolveAuthorizationRequest(
  uri: string,
  warnings: string[],
): Promise<AuthorizationRequest> {
  let params: URLSearchParams;
  try {
    params = new URL(uri).searchParams;
  } catch {
    throw new WalletError(ProtocolStep.VP_AUTH_REQUEST, 'Authorization request is not a URI', 400);
  }
  const requestUri = params.get('request_uri');
  if (requestUri) {
    const step = ProtocolStep.VP_REQUEST_OBJECT;
    const res = await call(step, requestUri, {
      headers: { accept: 'application/oauth-authz-req+jwt, application/json' },
    });
    const text = res.text.trim();
    let request: AuthorizationRequest;
    if (text.startsWith('{')) {
      request = parseJson<AuthorizationRequest>(step, res);
    } else {
      try {
        request = decodeJwt(text) as unknown as AuthorizationRequest;
      } catch {
        throw new WalletError(
          step,
          'request_uri did not return a JWT or JSON',
          502,
          res.status,
          text,
        );
      }
      await checkRequestObject(text, request.client_id ?? params.get('client_id') ?? '', warnings);
    }
    const outer = params.get('client_id');
    if (outer && request.client_id && outer !== request.client_id) {
      warnings.push(
        `client_id in the QR (${outer}) differs from the request object (${request.client_id})`,
      );
    }
    return request;
  }
  const pd = params.get('presentation_definition');
  return {
    client_id: params.get('client_id') ?? '',
    response_uri: params.get('response_uri') ?? '',
    response_mode: params.get('response_mode') ?? undefined,
    nonce: params.get('nonce') ?? '',
    state: params.get('state') ?? undefined,
    presentation_definition: pd ? (JSON.parse(pd) as PresentationDefinition) : (undefined as never),
  };
}

// ---------- matching ----------

/** Minimal JSONPath: `$.a.b` and `$['a']['b']`. */
export function readPath(obj: unknown, path: string): unknown {
  const keys = path
    .replace(/^\$/, '')
    .split(/\.|\[['"]?|['"]?\]/)
    .filter(Boolean);
  return keys.reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

function filterMatches(value: unknown, filter: Field['filter']): boolean {
  if (value === undefined) return false;
  if (!filter) return true;
  const values = Array.isArray(value) ? value : [value];
  if (filter.const !== undefined && !values.includes(filter.const)) return false;
  if (filter.contains?.const !== undefined && !values.includes(filter.contains.const)) return false;
  if (filter.pattern !== undefined) {
    const re = new RegExp(filter.pattern);
    if (!values.some((v) => re.test(typeof v === 'string' ? v : JSON.stringify(v)))) return false;
  }
  return true;
}

export function claimsOf(c: HeldCredential): Record<string, unknown> {
  return SD_JWT_FORMATS.includes(c.format)
    ? sdJwtClaims(c.raw)
    : (JSON.parse(c.raw) as Record<string, unknown>);
}

export function matches(c: HeldCredential, d: InputDescriptor): boolean {
  const formats = d.format ? Object.keys(d.format) : undefined;
  if (formats && !formats.some((f) => f === c.format || (f === 'ldp_vp' && c.format === 'ldp_vc')))
    return false;
  const claims = claimsOf(c);
  return (d.constraints?.fields ?? []).every(
    (f) => f.optional || f.path.some((p) => filterMatches(readPath(claims, p), f.filter)),
  );
}

/** Claim names a `limit_disclosure: required` descriptor asks for (top-level SD-JWT claims). */
function requestedClaims(d: InputDescriptor): string[] | undefined {
  if (d.constraints?.limit_disclosure !== 'required') return undefined;
  return (d.constraints.fields ?? []).flatMap((f) =>
    f.path.map((p) => p.replace(/^\$\.?/, '').split(/[.[]/)[0]!),
  );
}

// ---------- tampering ----------

const flipChar = (s: string, alphabet: string) => {
  const i = Math.floor(s.length / 2);
  const c = s[i]!;
  const next = alphabet[(alphabet.indexOf(c) + 1) % alphabet.length]!;
  return `${s.slice(0, i)}${next}${s.slice(i + 1)}`;
};
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function tamperCredential(c: HeldCredential, tamper: MockWalletTamper): string {
  if (SD_JWT_FORMATS.includes(c.format)) {
    const { issuerJwt, disclosures } = splitSdJwt(c.raw);
    if (tamper === 'T-SIG-FLIP') {
      const [h, p, s = ''] = issuerJwt.split('.');
      return [`${h}.${p}.${flipChar(s, B64URL)}`, ...disclosures.map((d) => d.encoded), ''].join(
        '~',
      );
    }
    const target = disclosures.find((d) => d.name !== undefined && typeof d.value === 'string');
    if (!target) throw new WalletError('tamper', 'No string claim to edit', 409);
    return [
      issuerJwt,
      ...disclosures.map((d) =>
        d === target ? forgeDisclosure(d.name!, `${String(d.value)} (edited)`) : d.encoded,
      ),
      '',
    ].join('~');
  }
  const vc = JSON.parse(c.raw) as {
    proof?: { proofValue?: string; jws?: string };
    credentialSubject?: Record<string, unknown>;
  };
  if (tamper === 'T-SIG-FLIP') {
    if (vc.proof?.proofValue) vc.proof.proofValue = flipChar(vc.proof.proofValue, B58);
    else if (vc.proof?.jws) vc.proof.jws = flipChar(vc.proof.jws, B64URL);
    else throw new WalletError('tamper', 'Credential has no proof to break', 409);
  } else {
    const subject = vc.credentialSubject ?? {};
    const key = Object.keys(subject).find((k) => k !== 'id' && typeof subject[k] === 'string');
    if (!key) throw new WalletError('tamper', 'No string claim to edit', 409);
    subject[key] = `${String(subject[key])} (edited)`;
  }
  return JSON.stringify(vc);
}

// ---------- respond ----------

export async function respond(
  req: RespondRequest,
  holder: HolderKey,
  credentials: HeldCredential[],
): Promise<RespondResponse> {
  const warnings: string[] = [];
  const request = await resolveAuthorizationRequest(req.authorizationRequestUri, warnings);
  const step = ProtocolStep.VP_RESPONSE;
  if (!request.response_uri)
    throw new WalletError(ProtocolStep.VP_REQUEST_OBJECT, 'Request has no response_uri', 400);
  if (request.response_mode && request.response_mode !== 'direct_post') {
    throw new WalletError(
      ProtocolStep.VP_REQUEST_OBJECT,
      `Unsupported response_mode ${request.response_mode}`,
      400,
    );
  }
  const descriptor = request.presentation_definition?.input_descriptors?.[0];
  if (!descriptor)
    throw new WalletError(
      ProtocolStep.VP_REQUEST_OBJECT,
      'Request has no presentation_definition input descriptor',
      400,
    );

  const candidates = req.credentialId
    ? credentials.filter((c) => c.id === req.credentialId)
    : credentials;
  const credential = [...candidates].reverse().find((c) => matches(c, descriptor));
  const state: Record<string, string> = request.state ? { state: request.state } : {};
  if (!credential) {
    // Tell the verifier, as a wallet would after the user found nothing to share.
    const res = await call(
      step,
      request.response_uri,
      form({ error: 'access_denied', error_description: 'No matching credential', ...state }),
    ).catch((e: unknown) => e);
    throw new WalletError(
      'oid4vp.match',
      `No held credential matches input descriptor ${descriptor.id}${res instanceof Error ? '' : ' (error sent to the verifier)'}`,
      409,
    );
  }

  const raw = req.tamper ? tamperCredential(credential, req.tamper) : credential.raw;
  const isSdJwt = SD_JWT_FORMATS.includes(credential.format);
  let vpToken: string;
  try {
    vpToken = isSdJwt
      ? await presentSdJwt({
          raw,
          holder,
          nonce: request.nonce,
          audience: request.client_id,
          disclose: requestedClaims(descriptor),
        })
      : JSON.stringify(
          await signPresentation({
            credential: JSON.parse(raw) as object,
            holder,
            challenge: request.nonce,
            domain: request.client_id,
          }),
        );
  } catch (e) {
    throw new WalletError(step, `Could not build the vp_token: ${(e as Error).message}`, 500);
  }

  const submission = {
    id: randomUUID(),
    definition_id: request.presentation_definition.id,
    descriptor_map: [
      isSdJwt
        ? { id: descriptor.id, format: credential.format, path: '$' }
        : {
            id: descriptor.id,
            format: 'ldp_vp',
            path: '$',
            path_nested: { id: descriptor.id, format: 'ldp_vc', path: '$.verifiableCredential[0]' },
          },
    ],
  };
  const res = await call(
    step,
    request.response_uri,
    form({ vp_token: vpToken, presentation_submission: JSON.stringify(submission), ...state }),
  );
  return {
    credentialId: credential.id,
    responseUri: request.response_uri,
    status: res.status,
    ...(res.text ? { body: res.text } : {}),
    ...(req.tamper ? { tamper: req.tamper } : {}),
    warnings,
  };
}
