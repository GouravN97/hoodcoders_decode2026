// SD-JWT VC (IETF draft; `vc+sd-jwt` and `dc+sd-jwt`) parsing and verification. Issuer keys come
// from the JWS header (x5c, jwk) or a DID in `kid`/`iss`; holder keys from `cnf.jwk` or a DID in
// `cnf.kid` (Inji Certify binds did:jwk holders that way). Works in Node and browsers.
import {
  base64url,
  compactVerify,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  importX509,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from 'jose';
import { resolveDidKey, type Fetch } from './did';

export interface Disclosure {
  encoded: string;
  salt: string;
  /** Claim name; absent for array-element disclosures. */
  name?: string;
  value: unknown;
}

export interface ParsedSdJwt {
  issuerJwt: string;
  header: Record<string, unknown>;
  payload: JWTPayload & Record<string, unknown>;
  disclosures: Disclosure[];
  /** The key-binding JWT, when the token is a presentation. */
  kbJwt?: string;
  /** `<issuer-jwt>~<disclosures>~`, the part the key-binding JWT's sd_hash covers. */
  presented: string;
}

const text = new TextDecoder();
const utf8 = new TextEncoder();

export async function sha256b64url(input: string): Promise<string> {
  return base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(input))));
}

/** `<issuer-jwt>~<disclosure>~…~[<kb-jwt>]`. Throws on anything that is not an SD-JWT. */
export function parseSdJwt(compact: string): ParsedSdJwt {
  const parts = compact.trim().split('~');
  if (parts.length < 2) throw new Error('Not an SD-JWT: no "~" separator');
  const issuerJwt = parts[0]!;
  const last = parts.at(-1)!;
  const kbJwt = last !== '' ? last : undefined;
  const disclosureParts = parts.slice(1, -1).filter(Boolean);
  const disclosures = disclosureParts.map((encoded) => {
    const arr = JSON.parse(text.decode(base64url.decode(encoded))) as unknown[];
    if (!Array.isArray(arr) || typeof arr[0] !== 'string') throw new Error('Malformed disclosure');
    return arr.length === 3
      ? { encoded, salt: arr[0], name: String(arr[1]), value: arr[2] }
      : { encoded, salt: arr[0], value: arr[1] };
  });
  return {
    issuerJwt,
    header: decodeProtectedHeader(issuerJwt) as Record<string, unknown>,
    payload: decodeJwt(issuerJwt) as ParsedSdJwt['payload'],
    disclosures,
    ...(kbJwt ? { kbJwt } : {}),
    presented: `${[issuerJwt, ...disclosureParts].join('~')}~`,
  };
}

/** Every digest the issuer committed to: `_sd` arrays at any depth and `{"...": digest}` array items. */
export function committedDigests(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) {
      if (v && typeof v === 'object' && !Array.isArray(v) && typeof (v as Record<string, unknown>)['...'] === 'string')
        out.add((v as Record<string, string>)['...']!);
      committedDigests(v, out);
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '_sd' && Array.isArray(v)) v.forEach((d) => typeof d === 'string' && out.add(d));
      else committedDigests(v, out);
    }
  }
  return out;
}

/** The issuer payload with every disclosed top-level claim filled in (what a verifier matches on). */
export function disclosedClaims(sd: ParsedSdJwt): Record<string, unknown> {
  const claims: Record<string, unknown> = { ...sd.payload };
  for (const d of sd.disclosures) if (d.name !== undefined) claims[d.name] = d.value;
  return claims;
}

const pem = (der: string) => `-----BEGIN CERTIFICATE-----\n${der.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`;

export interface IssuerKey {
  key: CryptoKey | Uint8Array;
  /** Where the key came from, for the verification report. */
  source: string;
}

/** The issuer's verification key: x5c leaf, embedded jwk, or a DID in `kid` or `iss`. */
export async function issuerKey(sd: ParsedSdJwt, fetchFn?: Fetch): Promise<IssuerKey> {
  const alg = String(sd.header.alg ?? '');
  if (!alg || alg === 'none') throw new Error('Issuer JWT has no signature algorithm');
  const x5c = sd.header.x5c;
  if (Array.isArray(x5c) && typeof x5c[0] === 'string') {
    return { key: await importX509(pem(x5c[0]), alg), source: `x5c certificate (${x5c.length} in chain)` };
  }
  if (sd.header.jwk && typeof sd.header.jwk === 'object') {
    return { key: await importJWK(sd.header.jwk as JWK, alg), source: 'jwk header' };
  }
  const kid = typeof sd.header.kid === 'string' ? sd.header.kid : undefined;
  const didUrl = kid?.startsWith('did:') ? kid : typeof sd.payload.iss === 'string' && sd.payload.iss.startsWith('did:') ? sd.payload.iss : undefined;
  if (didUrl) return { key: await importJWK(await resolveDidKey(didUrl, fetchFn), alg), source: didUrl };
  throw new Error('No issuer key: the header has no x5c or jwk, and neither kid nor iss is a DID');
}

/** The holder key the credential is bound to: `cnf.jwk`, or a DID in `cnf.kid`. */
export async function holderJwk(sd: ParsedSdJwt, fetchFn?: Fetch): Promise<{ jwk: JWK; source: string }> {
  const cnf = sd.payload.cnf as { jwk?: JWK; kid?: string } | undefined;
  if (cnf?.jwk) return { jwk: cnf.jwk, source: 'cnf.jwk' };
  if (cnf?.kid?.startsWith('did:')) return { jwk: await resolveDidKey(cnf.kid, fetchFn), source: `cnf.kid ${cnf.kid.slice(0, 40)}…` };
  throw new Error('The credential names no holder key (cnf.jwk or cnf.kid)');
}

export type StageStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface StageResult {
  id: string;
  label: string;
  status: StageStatus;
  message: string;
}

export interface VerifyOptions {
  /** Required for a presentation: the request's nonce and client_id. Omit both for a credential-only check. */
  nonce?: string;
  audience?: string;
  now?: Date;
  fetch?: Fetch;
  /** `iss` values trusted as issuers; empty means no trust list is configured. */
  trustedIssuers?: string[];
  /** Seconds a key-binding JWT's iat may be away from now. */
  maxKbAgeSeconds?: number;
}

const stage = (id: string, label: string, status: StageStatus, message: string): StageResult => ({ id, label, status, message });

/**
 * Verifies an SD-JWT VC (credential or presentation) stage by stage. A stage that cannot run because
 * an earlier one failed is `skip`. Never throws on bad input; problems are stage failures.
 */
export async function verifySdJwt(compact: string, opts: VerifyOptions = {}): Promise<StageResult[]> {
  const now = opts.now ?? new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const results: StageResult[] = [];
  let sd: ParsedSdJwt;
  try {
    sd = parseSdJwt(compact);
  } catch (e) {
    return [stage('format', 'SD-JWT format', 'fail', (e as Error).message)];
  }
  const typ = String(sd.header.typ ?? '');
  results.push(
    ['vc+sd-jwt', 'dc+sd-jwt'].includes(typ)
      ? stage('format', 'SD-JWT format', 'pass', `typ ${typ}, ${sd.disclosures.length} disclosures`)
      : stage('format', 'SD-JWT format', 'warn', `Unexpected typ "${typ || 'none'}"; expected vc+sd-jwt or dc+sd-jwt`),
  );

  let signatureOk = false;
  try {
    const key = await issuerKey(sd, opts.fetch);
    await compactVerify(sd.issuerJwt, key.key);
    signatureOk = true;
    results.push(stage('issuer-signature', 'Issuer signature', 'pass', `${String(sd.header.alg)} signature verified with the ${key.source}`));
  } catch (e) {
    results.push(stage('issuer-signature', 'Issuer signature', 'fail', (e as Error).message));
  }

  const iss = typeof sd.payload.iss === 'string' ? sd.payload.iss : undefined;
  const trusted = opts.trustedIssuers ?? [];
  results.push(
    !signatureOk
      ? stage('issuer-trust', 'Issuer trust', 'skip', 'Not checked: the signature did not verify')
      : trusted.length === 0
        ? stage('issuer-trust', 'Issuer trust', 'warn', `No trust list configured; issuer ${iss ?? '(no iss)'} accepted as presented`)
        : iss && trusted.includes(iss)
          ? stage('issuer-trust', 'Issuer trust', 'pass', `${iss} is on the trust list`)
          : stage('issuer-trust', 'Issuer trust', 'warn', `${iss ?? '(no iss)'} is not on the trust list`),
  );

  const committed = committedDigests(sd.payload);
  const missing: string[] = [];
  for (const d of sd.disclosures) if (!committed.has(await sha256b64url(d.encoded))) missing.push(d.name ?? '[array item]');
  const alg = sd.payload._sd_alg ?? 'sha-256';
  results.push(
    alg !== 'sha-256'
      ? stage('disclosures', 'Disclosures', 'fail', `Unsupported _sd_alg ${String(alg)}`)
      : missing.length > 0
        ? stage('disclosures', 'Disclosures', 'fail', `Not committed to by the issuer: ${missing.join(', ')}`)
        : stage('disclosures', 'Disclosures', 'pass', `${sd.disclosures.length} disclosures match digests in the issuer JWT`),
  );

  const presentation = opts.nonce !== undefined || opts.audience !== undefined;
  if (!presentation) {
    results.push(stage('holder-binding', 'Holder binding', 'skip', 'Credential-only check: no presentation to bind'));
  } else if (!sd.kbJwt) {
    results.push(stage('holder-binding', 'Holder binding', 'fail', 'No key-binding JWT: the presentation is not bound to this request'));
  } else {
    try {
      const { jwk, source } = await holderJwk(sd, opts.fetch);
      const kbHeader = decodeProtectedHeader(sd.kbJwt);
      if (kbHeader.typ !== 'kb+jwt') throw new Error(`Key-binding JWT typ is "${kbHeader.typ ?? 'none'}", expected kb+jwt`);
      await compactVerify(sd.kbJwt, await importJWK(jwk, kbHeader.alg ?? 'ES256'));
      const kb = decodeJwt(sd.kbJwt);
      const problems: string[] = [];
      if (kb.nonce !== opts.nonce) problems.push(`nonce is ${JSON.stringify(kb.nonce)}, the request asked for ${JSON.stringify(opts.nonce)}`);
      const aud = Array.isArray(kb.aud) ? kb.aud : [kb.aud];
      if (!aud.includes(opts.audience)) problems.push(`aud is ${JSON.stringify(kb.aud)}, expected ${JSON.stringify(opts.audience)}`);
      if (kb.sd_hash !== (await sha256b64url(sd.presented))) problems.push('sd_hash does not match the presented SD-JWT');
      const maxAge = opts.maxKbAgeSeconds ?? 600;
      if (typeof kb.iat !== 'number' || Math.abs(nowSec - kb.iat) > maxAge) problems.push(`iat ${String(kb.iat)} is more than ${maxAge} s from now`);
      results.push(
        problems.length > 0
          ? stage('holder-binding', 'Holder binding', 'fail', problems.join('; '))
          : stage('holder-binding', 'Holder binding', 'pass', `Key-binding JWT signed by the holder key (${source}), bound to this request's nonce and client_id`),
      );
    } catch (e) {
      results.push(stage('holder-binding', 'Holder binding', 'fail', (e as Error).message));
    }
  }

  const { exp, nbf } = sd.payload;
  results.push(
    typeof exp === 'number' && exp < nowSec
      ? stage('validity', 'Validity period', 'fail', `Expired at ${new Date(exp * 1000).toISOString()}`)
      : typeof nbf === 'number' && nbf > nowSec + 60
        ? stage('validity', 'Validity period', 'fail', `Not valid before ${new Date(nbf * 1000).toISOString()}`)
        : stage('validity', 'Validity period', 'pass', typeof exp === 'number' ? `Valid until ${new Date(exp * 1000).toISOString()}` : 'No expiry (exp) in the credential'),
  );
  return results;
}
