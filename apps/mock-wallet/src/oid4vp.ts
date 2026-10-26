// OpenID4VP holder (response_mode direct_post): parse the authorization request, fetch and check
// the request object, pick a matching credential, build the vp_token and post it to response_uri.
// Two dialects: draft 23 with Presentation Exchange (Inji Verify 0.18, the mock verifier) and 1.0
// with DCQL (Inji Verify 1.0): a `dcql_query` instead of a `presentation_definition`, a vp_token
// keyed by credential query id, and no presentation_submission.
import { randomUUID } from 'node:crypto';
import {
  describeTamper,
  nonceOfVpToken,
  ProtocolStep,
  type HeldCredential,
  type RespondRequest,
  type RespondResponse,
  type TamperEvidence,
} from '@playground/shared';
import {
  buildDeviceResponse,
  didWebUrl,
  ed25519MultibaseToJwk,
  formatAllowed,
  mdocClaims,
  requestedElements,
  tamperMdoc,
  unmetFields,
  type InputDescriptor,
  type PresentationDefinition,
} from '@playground/protocol-core';
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { call, form, parseJson, routed, USER_AGENT, WalletError } from './http.ts';
import type { HolderKey } from './keys.ts';
import { signPresentation } from './ldp.ts';
import { forgeDisclosure, presentSdJwt, sdJwtClaims, splitSdJwt } from './sdjwt.ts';

/** A DCQL credential query (OpenID4VP 1.0 §6), the parts this wallet reads. */
export interface DcqlCredentialQuery {
  id: string;
  format: string;
  meta?: { vct_values?: string[]; type_values?: string[][]; doctype_value?: string };
  claims?: Array<{ id?: string; path: Array<string | number | null>; values?: unknown[] }>;
  require_cryptographic_holder_binding?: boolean;
}

export interface AuthorizationRequest {
  client_id: string;
  response_uri: string;
  response_mode?: string;
  nonce: string;
  state?: string;
  presentation_definition?: PresentationDefinition;
  dcql_query?: { credentials: DcqlCredentialQuery[] };
}

/** OpenID4VP 1.0 client identifier prefix for a DID: `decentralized_identifier:did:web:…`. */
export const didOfClientId = (clientId: string) => clientId.replace(/^decentralized_identifier:/, '');

const SD_JWT_FORMATS = ['vc+sd-jwt', 'dc+sd-jwt'];

// Shared with the mock verifier (packages/protocol-core); re-exported for this app's tests.
export { didWebUrl, readPath } from '@playground/protocol-core';
export type { InputDescriptor, PresentationDefinition };

// ---------- request ----------

/** Checks a request object signed by a did:web verifier (Ed25519, publicKeyMultibase). Problems become warnings. */
async function checkRequestObject(
  jwt: string,
  clientId: string,
  warnings: string[],
): Promise<void> {
  const did = didOfClientId(clientId);
  if (!did.startsWith('did:web:')) {
    warnings.push(`Request object signature not checked: client_id ${clientId} is not did:web`);
    return;
  }
  const { kid, alg } = decodeProtectedHeader(jwt);
  if (kid && !kid.startsWith(`${did}#`)) {
    warnings.push(`Request object kid ${kid} is not a key of client_id ${clientId}`);
  }
  try {
    const res = await fetch(routed(didWebUrl(did)), {
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
    const jwk: object | undefined =
      method.publicKeyJwk ??
      (method.publicKeyMultibase ? ed25519MultibaseToJwk(method.publicKeyMultibase) : undefined);
    if (!jwk) throw new Error('verification method has no usable public key');
    await jwtVerify(jwt, await importJWK(jwk as never, alg ?? 'EdDSA'));
  } catch (e) {
    warnings.push(
      `Request object signature not verified via ${didWebUrl(did)}: ${(e as Error).message}`,
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
  const dcql = params.get('dcql_query');
  return {
    client_id: params.get('client_id') ?? '',
    response_uri: params.get('response_uri') ?? '',
    response_mode: params.get('response_mode') ?? undefined,
    nonce: params.get('nonce') ?? '',
    state: params.get('state') ?? undefined,
    ...(pd ? { presentation_definition: JSON.parse(pd) as PresentationDefinition } : {}),
    ...(dcql ? { dcql_query: JSON.parse(dcql) as AuthorizationRequest['dcql_query'] } : {}),
  };
}

// ---------- matching ----------

export function claimsOf(c: HeldCredential): Record<string, unknown> {
  if (c.format === 'mso_mdoc') return mdocClaims(c.raw);
  return SD_JWT_FORMATS.includes(c.format)
    ? sdJwtClaims(c.raw)
    : (JSON.parse(c.raw) as Record<string, unknown>);
}

export function matches(c: HeldCredential, d: InputDescriptor): boolean {
  const claims = claimsOf(c);
  // ISO 18013-7: an mso_mdoc input descriptor's id is the docType it asks for.
  if (c.format === 'mso_mdoc' && claims.docType !== d.id) return false;
  return formatAllowed(d, c.format) && unmetFields(claims, d).length === 0;
}

/** DCQL type match: exact, or a compact type against an expanded IRI's fragment (as Inji Verify 1.0 does). */
const typeMatches = (held: string, wanted: string) =>
  held === wanted || wanted.endsWith(`#${held}`) || held.endsWith(`#${wanted}`);

const typesOf = (claims: Record<string, unknown>) =>
  (Array.isArray(claims.type) ? claims.type : [claims.type]).filter((t): t is string => typeof t === 'string');

/** Whether a held credential satisfies a DCQL credential query: format, vct / type values, claim paths. */
export function dcqlMatches(c: HeldCredential, q: DcqlCredentialQuery): boolean {
  const sameFormat = q.format === c.format || (SD_JWT_FORMATS.includes(q.format) && SD_JWT_FORMATS.includes(c.format));
  if (!sameFormat) return false;
  const claims = claimsOf(c);
  if (q.meta?.vct_values && !q.meta.vct_values.includes(String(claims.vct))) return false;
  if (q.meta?.type_values) {
    const held = typesOf(claims);
    if (!q.meta.type_values.some((option) => option.every((t) => held.some((h) => typeMatches(h, t))))) return false;
  }
  const subject = c.format === 'ldp_vc' ? ((claims.credentialSubject ?? {}) as Record<string, unknown>) : claims;
  return (q.claims ?? []).every((cl) => {
    const first = cl.path[0];
    return typeof first === 'string' && first in subject;
  });
}

/** Claim names a DCQL query asks for (top-level SD-JWT claims); all of them when it names none. */
const dcqlRequestedClaims = (q: DcqlCredentialQuery) =>
  q.claims?.length ? q.claims.map((cl) => String(cl.path[0])) : undefined;

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
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** The tampers that rewrite the credential itself. */
export type CredentialTamper = 'T-SIG-FLIP' | 'T-CLAIM-EDIT';

export function tamperCredential(c: HeldCredential, tamper: CredentialTamper, disclosed?: Record<string, string[]>): string {
  if (c.format === 'mso_mdoc') return tamperMdoc(c.raw, tamper === 'T-SIG-FLIP' ? 'signature' : 'claim', disclosed).raw;
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

/**
 * direct_post to the verifier. A tampered presentation that the verifier refuses with a 4xx is an
 * answer, not a wallet failure: it is returned with its status so the run can record the rejection.
 */
async function submit(uri: string, fields: Record<string, string>, tampered: boolean) {
  try {
    return await call(ProtocolStep.VP_RESPONSE, uri, form(fields));
  } catch (e) {
    const status = e instanceof WalletError ? e.upstreamStatus : undefined;
    if (!tampered || status === undefined || status < 400 || status >= 500) throw e;
    return { status, contentType: '', text: (e as WalletError).upstreamBody ?? '' };
  }
}

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
  const dcqlQuery = request.dcql_query?.credentials?.[0];
  const descriptor = request.presentation_definition?.input_descriptors?.[0];
  if (!descriptor && !dcqlQuery)
    throw new WalletError(
      ProtocolStep.VP_REQUEST_OBJECT,
      'Request has neither a presentation_definition input descriptor nor a dcql_query',
      400,
    );
  const queryName = dcqlQuery ? `DCQL credential query ${dcqlQuery.id}` : `input descriptor ${descriptor!.id}`;
  const satisfies = (c: HeldCredential) => (dcqlQuery ? dcqlMatches(c, dcqlQuery) : matches(c, descriptor!));

  const candidates = req.credentialId
    ? credentials.filter((c) => c.id === req.credentialId)
    : credentials;
  // T-WRONG-TYPE presents the credential although it does not match what was asked for.
  const credential =
    req.tamper === 'T-WRONG-TYPE'
      ? candidates.at(-1)
      : [...candidates].reverse().find(satisfies);
  const state: Record<string, string> = request.state ? { state: request.state } : {};
  if (req.tamper === 'T-NONCE-REPLAY' && !req.replay) {
    throw new WalletError('tamper', 'T-NONCE-REPLAY needs an earlier vp_token or nonce to replay', 400);
  }

  // T-NONCE-REPLAY resubmit: the earlier vp_token goes to the new request unchanged.
  if (req.replay?.variant === 'resubmit-vp') {
    const replayedNonce = nonceOfVpToken(req.replay.vpToken);
    const tamperEvidence: TamperEvidence = {
      target: 'vp_token',
      summary: 'Resubmitted a vp_token captured in an earlier run to this new request',
      changes: [
        {
          path: 'nonce',
          before: `${request.nonce} (asked for by this request)`,
          after: `${replayedNonce ?? 'none found'} (inside the replayed vp_token)`,
        },
      ],
      after: req.replay.vpToken,
    };
    const res = await submit(
      request.response_uri,
      {
        vp_token: req.replay.vpToken,
        ...(req.replay.presentationSubmission
          ? { presentation_submission: req.replay.presentationSubmission }
          : {}),
        ...state,
      },
      true,
    );
    return {
      credentialId: credential?.id ?? 'replayed-vp-token',
      responseUri: request.response_uri,
      status: res.status,
      ...(res.text ? { body: res.text } : {}),
      tamper: 'T-NONCE-REPLAY',
      tamperEvidence,
      warnings,
    };
  }

  if (!credential) {
    // Tell the verifier, as a wallet would after the user found nothing to share.
    const res = await call(
      step,
      request.response_uri,
      form({ error: 'access_denied', error_description: 'No matching credential', ...state }),
    ).catch((e: unknown) => e);
    throw new WalletError(
      'oid4vp.match',
      `No held credential matches ${queryName}${res instanceof Error ? '' : ' (error sent to the verifier)'}`,
      409,
    );
  }

  // mDoc elements the presentation discloses (all when the request does not limit disclosure).
  if (dcqlQuery && credential.format === 'mso_mdoc')
    throw new WalletError(step, 'mso_mdoc over DCQL is not implemented in this wallet', 501);
  const mdocDisclosed =
    credential.format === 'mso_mdoc' && descriptor?.constraints?.limit_disclosure === 'required'
      ? requestedElements(descriptor.constraints.fields ?? [])
      : undefined;
  let raw = credential.raw;
  let tamperEvidence: TamperEvidence | undefined;
  if (req.tamper === 'T-SIG-FLIP' || req.tamper === 'T-CLAIM-EDIT') {
    raw = tamperCredential(credential, req.tamper, mdocDisclosed);
    tamperEvidence = {
      target: 'credential',
      summary:
        req.tamper === 'T-SIG-FLIP'
          ? "Changed one character of the issuer's signature"
          : 'Changed one claim value after issuance',
      changes:
        credential.format === 'mso_mdoc'
          ? [mdocTamperChange(credential.raw, req.tamper, mdocDisclosed)]
          : describeTamper(credential.raw, raw, credential.format),
      before: credential.raw,
      after: raw,
    };
  } else if (req.tamper === 'T-WRONG-TYPE') {
    tamperEvidence = {
      target: 'presentation',
      summary: 'Presented a credential that does not satisfy the request',
      changes: [
        {
          path: 'credential type',
          before: `${(dcqlQuery ? dcqlRequestedType(dcqlQuery) : requestedType(descriptor!)) ?? 'see the request'} (asked for)`,
          after: `${presentedType(credential) ?? credential.credentialConfigurationId} (presented)`,
        },
      ],
    };
  }
  // T-NONCE-REPLAY stale nonce: a fresh presentation, signed over an earlier request's nonce.
  const nonce = req.replay?.variant === 'stale-nonce' ? req.replay.nonce : request.nonce;
  if (req.replay?.variant === 'stale-nonce') {
    tamperEvidence = {
      target: 'vp_token',
      summary: "Signed a fresh presentation over an earlier run's nonce",
      changes: [{ path: 'nonce', before: request.nonce, after: req.replay.nonce }],
    };
  }

  const isSdJwt = SD_JWT_FORMATS.includes(credential.format);
  const isMdoc = credential.format === 'mso_mdoc';
  let vpToken: string;
  try {
    vpToken = isMdoc
      ? await buildDeviceResponse({
          credential: raw,
          deviceKey: holder.privateKey,
          handover: { clientId: request.client_id, responseUri: request.response_uri, nonce },
          ...(mdocDisclosed ? { disclose: mdocDisclosed } : {}),
        })
      : isSdJwt
      ? await presentSdJwt({
          raw,
          holder,
          nonce,
          audience: request.client_id,
          disclose: dcqlQuery ? dcqlRequestedClaims(dcqlQuery) : requestedClaims(descriptor!),
        })
      : JSON.stringify(
          await signPresentation({
            credential: JSON.parse(raw) as object,
            holder,
            challenge: nonce,
            domain: request.client_id,
          }),
        );
  } catch (e) {
    throw new WalletError(step, `Could not build the vp_token: ${(e as Error).message}`, 500);
  }

  let fields: Record<string, string>;
  if (dcqlQuery) {
    // OpenID4VP 1.0: one array of presentations per credential query id, no presentation_submission.
    fields = {
      vp_token: JSON.stringify({ [dcqlQuery.id]: [isSdJwt ? vpToken : (JSON.parse(vpToken) as object)] }),
      ...state,
    };
  } else {
    const submission = {
      id: randomUUID(),
      definition_id: request.presentation_definition!.id,
      descriptor_map: [
        isSdJwt || isMdoc
          ? { id: descriptor!.id, format: credential.format, path: '$' }
          : {
              id: descriptor!.id,
              format: 'ldp_vp',
              path: '$',
              path_nested: { id: descriptor!.id, format: 'ldp_vc', path: '$.verifiableCredential[0]' },
            },
      ],
    };
    fields = { vp_token: vpToken, presentation_submission: JSON.stringify(submission), ...state };
  }
  const res = await submit(request.response_uri, fields, Boolean(req.tamper));
  return {
    credentialId: credential.id,
    responseUri: request.response_uri,
    status: res.status,
    ...(res.text ? { body: res.text } : {}),
    ...(req.tamper ? { tamper: req.tamper } : {}),
    ...(tamperEvidence ? { tamperEvidence } : {}),
    warnings,
  };
}

/** What an mDoc tamper changed, for the inspector. */
function mdocTamperChange(raw: string, tamper: CredentialTamper, disclosed?: Record<string, string[]>) {
  const t = tamperMdoc(raw, tamper === 'T-SIG-FLIP' ? 'signature' : 'claim', disclosed);
  return { path: t.path, ...(t.before ? { before: t.before } : {}), ...(t.after ? { after: t.after } : {}) };
}

/** The type an input descriptor filters on (`$.vct` or `$.type`, or an mDoc docType as its id). */
export function requestedType(d: InputDescriptor): string | undefined {
  if (d.format && 'mso_mdoc' in d.format) return d.id;
  for (const f of d.constraints?.fields ?? []) {
    if (!f.path.some((p) => /\.(vct|type)\b/.test(p))) continue;
    const v = f.filter?.const ?? f.filter?.contains?.const ?? f.filter?.pattern;
    if (v !== undefined) return String(v);
  }
  return undefined;
}

/** The type a DCQL credential query asks for (`vct_values` or the last of the first `type_values`). */
export function dcqlRequestedType(q: DcqlCredentialQuery): string | undefined {
  return q.meta?.vct_values?.[0] ?? q.meta?.type_values?.[0]?.at(-1) ?? q.meta?.doctype_value;
}

/** `vct` of an SD-JWT, or the most specific `type` of a JSON-LD credential. */
export function presentedType(c: HeldCredential): string | undefined {
  const claims = claimsOf(c);
  if (typeof claims.docType === 'string') return claims.docType;
  if (typeof claims.vct === 'string') return claims.vct;
  const types = Array.isArray(claims.type) ? claims.type : [claims.type];
  return types.filter((t): t is string => typeof t === 'string' && t !== 'VerifiableCredential').at(-1);
}
