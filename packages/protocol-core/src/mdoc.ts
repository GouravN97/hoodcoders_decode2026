// ISO/IEC 18013-5 mDoc (`mso_mdoc`): CBOR/COSE parsing and verification, and the holder side of an
// OpenID4VP presentation (DeviceResponse with an ISO 18013-7 Annex B session transcript).
//
//   IssuerSigned   { nameSpaces: { ns: [#6.24(IssuerSignedItem)] }, issuerAuth: COSE_Sign1(MSO) }
//   MSO            { version, digestAlgorithm, docType, valueDigests, deviceKeyInfo, validityInfo }
//   DeviceResponse { version, documents: [{ docType, issuerSigned, deviceSigned }], status }
//
// Inji Certify 0.14.0's mock mDoc plugin returns `{ docType, issuerSigned }` rather than a bare
// IssuerSigned; both are accepted and the wrapper is reported. Works in Node and browsers.
import { Encoder, Tag } from 'cbor-x';
import { base64url, importJWK, importX509, type CryptoKey, type JWK } from 'jose';
import type { StageResult, StageStatus } from './sdjwt';

/** Maps stay Maps (COSE labels are integers), byte strings stay byte strings, no cbor-x extensions. */
const cbor = new Encoder({ mapsAsObjects: false, useRecords: false, tagUint8Array: false, variableMapSize: true });
export const encodeCbor = (value: unknown): Uint8Array => new Uint8Array(cbor.encode(value));
export const decodeCbor = (bytes: Uint8Array): unknown => cbor.decode(bytes);

/** #6.24(bstr .cbor value): embedded CBOR, as IssuerSignedItemBytes and MobileSecurityObjectBytes are. */
export const tag24 = (value: unknown) => new Tag(encodeCbor(value), 24);

type CborMap = Map<unknown, unknown>;
/** WebCrypto takes ArrayBuffer-backed views only. */
const ab = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);
const isMap = (v: unknown): v is CborMap => v instanceof Map;
const get = (m: unknown, key: unknown): unknown => (isMap(m) ? m.get(key) : undefined);
const bytes = (v: unknown): Uint8Array | undefined => (v instanceof Uint8Array ? v : undefined);

/** The CBOR inside a #6.24 tag (or a bare byte string some encoders send instead). */
function unwrapTag24(v: unknown): unknown {
  if (v instanceof Tag && v.tag === 24 && v.value instanceof Uint8Array) return decodeCbor(v.value);
  if (v instanceof Uint8Array) return decodeCbor(v);
  return v;
}

const COSE_ALG_ES256 = -7;
const COSE_HEADER_ALG = 1;
const COSE_HEADER_X5CHAIN = 33;

export interface CoseSign1 {
  protectedBytes: Uint8Array;
  protectedHeader: CborMap;
  unprotectedHeader: CborMap;
  /** null when detached (DeviceSignature). */
  payload: Uint8Array | null;
  signature: Uint8Array;
  /** Certificates (DER) from the x5chain header, leaf first. */
  x5chain: Uint8Array[];
  alg: number | undefined;
}

export function parseCoseSign1(v: unknown): CoseSign1 {
  const arr = v instanceof Tag && v.tag === 18 ? v.value : v;
  if (!Array.isArray(arr) || arr.length !== 4) throw new Error('Not a COSE_Sign1 structure');
  const [protectedBytes, unprotected, payload, signature] = arr as [unknown, unknown, unknown, unknown];
  if (!(protectedBytes instanceof Uint8Array) || !(signature instanceof Uint8Array))
    throw new Error('COSE_Sign1 has no protected header or signature bytes');
  const protectedHeader = protectedBytes.length ? (decodeCbor(protectedBytes) as CborMap) : new Map();
  const unprotectedHeader = isMap(unprotected) ? unprotected : new Map();
  const x5 = get(unprotectedHeader, COSE_HEADER_X5CHAIN) ?? get(protectedHeader, COSE_HEADER_X5CHAIN);
  const x5chain = Array.isArray(x5) ? x5.filter((c): c is Uint8Array => c instanceof Uint8Array) : x5 instanceof Uint8Array ? [x5] : [];
  const alg = get(protectedHeader, COSE_HEADER_ALG);
  return {
    protectedBytes,
    protectedHeader,
    unprotectedHeader,
    payload: payload instanceof Uint8Array ? payload : null,
    signature,
    x5chain,
    alg: typeof alg === 'number' ? alg : undefined,
  };
}

/** Sig_structure for COSE_Sign1: ["Signature1", protected, external_aad, payload]. */
const sigStructure = (protectedBytes: Uint8Array, payload: Uint8Array) =>
  encodeCbor(['Signature1', protectedBytes, new Uint8Array(), payload]);

/** Verifies an ES256 COSE_Sign1; `detachedPayload` is used when the structure's payload is null. */
export async function verifyCoseSign1(sign1: CoseSign1, key: CryptoKey, detachedPayload?: Uint8Array): Promise<boolean> {
  if (sign1.alg !== COSE_ALG_ES256) throw new Error(`Unsupported COSE alg ${String(sign1.alg)} (only ES256, -7)`);
  const payload = sign1.payload ?? detachedPayload;
  if (!payload) throw new Error('COSE_Sign1 has a detached payload and none was supplied');
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, ab(sign1.signature), ab(sigStructure(sign1.protectedBytes, payload)));
}

export async function signCoseSign1(key: CryptoKey, payload: Uint8Array, detached: boolean): Promise<unknown[]> {
  const protectedBytes = encodeCbor(new Map([[COSE_HEADER_ALG, COSE_ALG_ES256]]));
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, ab(sigStructure(protectedBytes, payload))),
  );
  return [protectedBytes, new Map(), detached ? null : payload, signature];
}

const pem = (der: Uint8Array) => {
  let b64 = '';
  const chunk = 0x8000;
  for (let i = 0; i < der.length; i += chunk) b64 += String.fromCharCode(...der.subarray(i, i + chunk));
  return `-----BEGIN CERTIFICATE-----\n${btoa(b64).match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`;
};

/** PEM certificate(s) → DER, for trust lists. */
export function pemToDer(text: string): Uint8Array[] {
  return [...text.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/g)].map((m) =>
    Uint8Array.from(atob(m[1]!.replace(/\s+/g, '')), (c) => c.charCodeAt(0)),
  );
}

export const sha256 = async (data: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', ab(data)));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** COSE_Key (EC2, P-256) → JWK. */
export function coseKeyToJwk(key: unknown): JWK {
  const kty = get(key, 1);
  const crv = get(key, -1);
  const x = bytes(get(key, -2));
  const y = bytes(get(key, -3));
  if (kty !== 2 || crv !== 1 || !x || !y) throw new Error('Device key is not an EC2 P-256 COSE_Key');
  return { kty: 'EC', crv: 'P-256', x: base64url.encode(x), y: base64url.encode(y) };
}

export function jwkToCoseKey(jwk: JWK): CborMap {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) throw new Error('Only P-256 keys');
  return new Map<number, unknown>([
    [1, 2],
    [-1, 1],
    [-2, base64url.decode(jwk.x)],
    [-3, base64url.decode(jwk.y)],
  ]);
}

// ── Parsing ─────────────────────────────────────────────────────────────────

export interface MdocElement {
  namespace: string;
  digestID: number;
  elementIdentifier: string;
  elementValue: unknown;
  /** IssuerSignedItemBytes exactly as presented: what the MSO's digest covers. */
  itemBytes: Uint8Array;
  /** The #6.24 item as it sits in the nameSpaces array, for re-encoding. */
  tagged: Tag;
}

export interface MobileSecurityObject {
  version?: string;
  digestAlgorithm?: string;
  docType?: string;
  valueDigests: Record<string, Map<number, Uint8Array>>;
  deviceKey?: unknown;
  validityInfo: { signed?: Date; validFrom?: Date; validUntil?: Date; expectedUpdate?: Date };
  /** Whether each validityInfo date was a CBOR tdate (#6.0) as ISO 18013-5 requires. */
  taggedDates: boolean;
}

export interface ParsedMdoc {
  docType: string;
  /** What the outer structure was: IssuerSigned alone, Certify's {docType, issuerSigned}, or a DeviceResponse document. */
  shape: 'IssuerSigned' | 'wrapped' | 'Document';
  issuerAuth: CoseSign1;
  /** issuerAuth as received, for re-encoding into a DeviceResponse. */
  issuerAuthRaw: unknown;
  elements: MdocElement[];
  mso: MobileSecurityObject;
  /** DeviceSigned, when the mDoc came from a DeviceResponse. */
  deviceSigned?: { nameSpacesBytes: Uint8Array; deviceSignature?: CoseSign1 };
}

const toDate = (v: unknown): Date | undefined => {
  if (v instanceof Date) return v;
  if (v instanceof Tag && (v.tag === 0 || v.tag === 1)) return new Date(v.tag === 0 ? String(v.value) : Number(v.value) * 1000);
  if (typeof v === 'string') return new Date(v);
  return undefined;
};

function parseMso(issuerAuth: CoseSign1): MobileSecurityObject {
  if (!issuerAuth.payload) throw new Error('issuerAuth has no MSO payload');
  const mso = unwrapTag24(decodeCbor(issuerAuth.payload));
  if (!isMap(mso)) throw new Error('MSO is not a CBOR map');
  const valueDigests: MobileSecurityObject['valueDigests'] = {};
  const vd = get(mso, 'valueDigests');
  if (isMap(vd))
    for (const [ns, digests] of vd)
      if (isMap(digests))
        valueDigests[String(ns)] = new Map([...digests].filter(([, d]) => d instanceof Uint8Array).map(([id, d]) => [Number(id), d as Uint8Array]));
  const vi = get(mso, 'validityInfo');
  const raw = ['signed', 'validFrom', 'validUntil', 'expectedUpdate'].map((k) => get(vi, k)).filter((v) => v !== undefined);
  const dates = Object.fromEntries(
    (['signed', 'validFrom', 'validUntil', 'expectedUpdate'] as const).map((k) => [k, toDate(get(vi, k))]).filter(([, d]) => d),
  ) as MobileSecurityObject['validityInfo'];
  return {
    ...(typeof get(mso, 'version') === 'string' ? { version: get(mso, 'version') as string } : {}),
    ...(typeof get(mso, 'digestAlgorithm') === 'string' ? { digestAlgorithm: get(mso, 'digestAlgorithm') as string } : {}),
    ...(typeof get(mso, 'docType') === 'string' ? { docType: get(mso, 'docType') as string } : {}),
    valueDigests,
    ...(get(get(mso, 'deviceKeyInfo'), 'deviceKey') !== undefined ? { deviceKey: get(get(mso, 'deviceKeyInfo'), 'deviceKey') } : {}),
    validityInfo: dates,
    // cbor-x turns #6.0 / #6.1 into Date; anything else (a plain string) is untagged.
    taggedDates: raw.every((v) => v instanceof Date || (v instanceof Tag && (v.tag === 0 || v.tag === 1))),
  };
}

function parseIssuerSigned(issuerSigned: unknown, docType: string | undefined, shape: ParsedMdoc['shape']): ParsedMdoc {
  const issuerAuthRaw = get(issuerSigned, 'issuerAuth');
  const issuerAuth = parseCoseSign1(issuerAuthRaw);
  const mso = parseMso(issuerAuth);
  const elements: MdocElement[] = [];
  const nameSpaces = get(issuerSigned, 'nameSpaces');
  if (isMap(nameSpaces)) {
    for (const [ns, items] of nameSpaces) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!(item instanceof Tag) || item.tag !== 24 || !(item.value instanceof Uint8Array)) continue;
        const decoded = decodeCbor(item.value);
        elements.push({
          namespace: String(ns),
          digestID: Number(get(decoded, 'digestID')),
          elementIdentifier: String(get(decoded, 'elementIdentifier')),
          elementValue: get(decoded, 'elementValue'),
          itemBytes: encodeCbor(item),
          tagged: item,
        });
      }
    }
  }
  return { docType: docType ?? mso.docType ?? '', shape, issuerAuth, issuerAuthRaw, elements, mso };
}

/** An mDoc credential (base64url or bytes): bare IssuerSigned, Certify's {docType, issuerSigned}, or a Document. */
export function parseMdoc(input: string | Uint8Array): ParsedMdoc {
  const top = decodeCbor(typeof input === 'string' ? base64url.decode(input.trim()) : input);
  if (!isMap(top)) throw new Error('Not an mDoc: not a CBOR map');
  if (top.has('issuerAuth')) return parseIssuerSigned(top, undefined, 'IssuerSigned');
  const issuerSigned = get(top, 'issuerSigned');
  if (!isMap(issuerSigned)) throw new Error('Not an mDoc: no issuerSigned or issuerAuth');
  const docType = typeof get(top, 'docType') === 'string' ? (get(top, 'docType') as string) : undefined;
  const deviceSignedRaw = get(top, 'deviceSigned');
  const parsed = parseIssuerSigned(issuerSigned, docType, deviceSignedRaw ? 'Document' : 'wrapped');
  if (isMap(deviceSignedRaw)) {
    const ns = get(deviceSignedRaw, 'nameSpaces');
    const sig = get(get(deviceSignedRaw, 'deviceAuth'), 'deviceSignature');
    parsed.deviceSigned = {
      nameSpacesBytes: ns instanceof Tag && ns.value instanceof Uint8Array ? encodeCbor(ns) : encodeCbor(tag24(new Map())),
      ...(sig ? { deviceSignature: parseCoseSign1(sig) } : {}),
    };
  }
  return parsed;
}

/** A DeviceResponse vp_token (base64url): its documents. */
export function parseDeviceResponse(vpToken: string): { version?: string; status?: number; documents: ParsedMdoc[] } {
  const top = decodeCbor(base64url.decode(vpToken.trim()));
  if (!isMap(top)) throw new Error('vp_token is not a CBOR DeviceResponse');
  const docs = get(top, 'documents');
  if (!Array.isArray(docs) || docs.length === 0) throw new Error('DeviceResponse has no documents');
  return {
    ...(typeof get(top, 'version') === 'string' ? { version: get(top, 'version') as string } : {}),
    ...(typeof get(top, 'status') === 'number' ? { status: get(top, 'status') as number } : {}),
    documents: docs.map((d) => {
      const p = parseMdoc(encodeCbor(d));
      return { ...p, shape: 'Document' as const };
    }),
  };
}

/** Element digest → whether the MSO commits to it. */
export async function checkDigests(m: ParsedMdoc): Promise<Array<MdocElement & { digestOk: boolean }>> {
  return Promise.all(
    m.elements.map(async (e) => {
      const expected = m.mso.valueDigests[e.namespace]?.get(e.digestID);
      return { ...e, digestOk: Boolean(expected && equal(await sha256(e.itemBytes), expected)) };
    }),
  );
}

/** What differs from ISO 18013-5 / OpenID4VCI `mso_mdoc`, as observed in this credential. */
export function mdocObservations(m: ParsedMdoc): string[] {
  const out: string[] = [];
  if (m.shape === 'wrapped')
    out.push('The credential is {docType, issuerSigned}; OpenID4VCI mso_mdoc and ISO 18013-5 expect the IssuerSigned structure itself');
  if (!m.mso.taggedDates) out.push('validityInfo dates are not CBOR tdate (#6.0) values');
  if (m.mso.validityInfo.signed === undefined) out.push('validityInfo has no "signed" date');
  if (m.docType.startsWith('org.iso.18013.5.1.mDL')) {
    const dp = m.elements.find((e) => e.elementIdentifier === 'driving_privileges');
    if (dp && !Array.isArray(dp.elementValue))
      out.push(`driving_privileges is a ${typeof dp.elementValue}, not the array of maps ISO 18013-5 defines`);
  }
  return out;
}

/** A plain-JSON view of an element value (dates, byte strings and maps made printable). */
export function printable(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Tag) return { [`#6.${v.tag}`]: printable(v.value) };
  if (v instanceof Uint8Array) return `<${v.length} bytes>`;
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), printable(x)]));
  if (Array.isArray(v)) return v.map(printable);
  return v;
}

// ── OpenID4VP (ISO 18013-7 Annex B) ─────────────────────────────────────────

export interface Oid4vpHandoverInput {
  clientId: string;
  responseUri: string;
  nonce: string;
  /**
   * Which handover the session transcript uses:
   * - `iso18013-7` (default): ISO 18013-7 Annex B, what OpenID4VP draft 23 wallets (and Inji) use.
   * - `oid4vp-1.0`: OpenID4VP 1.0 Appendix B.2.6.1, `OpenID4VPHandover`, what 1.0 wallets such as
   *   Paradym use with a DCQL request.
   */
  profile?: 'iso18013-7' | 'oid4vp-1.0';
  /**
   * Annex B carries the wallet's nonce in the JWE `apu` header. With plain `direct_post` there is no
   * JWE, so the playground uses the empty string on both sides. (`iso18013-7` only.)
   */
  mdocGeneratedNonce?: string;
  /**
   * SHA-256 JWK thumbprint of the verifier's response-encryption key, or null when the response is
   * not encrypted (plain `direct_post`). (`oid4vp-1.0` only.)
   */
  jwkThumbprint?: Uint8Array | null;
}

/**
 * The OpenID4VP session transcript the device signature covers.
 * - ISO 18013-7 Annex B: [null, null, [SHA-256([client_id, mdocNonce]), SHA-256([response_uri, mdocNonce]), nonce]].
 * - OpenID4VP 1.0: [null, null, ["OpenID4VPHandover", SHA-256(cbor([client_id, nonce, jwkThumbprint, response_uri]))]],
 *   where client_id keeps its prefix (`decentralized_identifier:did:web:…`).
 */
export async function oid4vpSessionTranscript(i: Oid4vpHandoverInput): Promise<unknown[]> {
  if (i.profile === 'oid4vp-1.0') {
    const info = encodeCbor([i.clientId, i.nonce, i.jwkThumbprint ?? null, i.responseUri]);
    return [null, null, ['OpenID4VPHandover', await sha256(info)]];
  }
  const mdocNonce = i.mdocGeneratedNonce ?? '';
  return [
    null,
    null,
    [await sha256(encodeCbor([i.clientId, mdocNonce])), await sha256(encodeCbor([i.responseUri, mdocNonce])), i.nonce],
  ];
}

/** DeviceAuthenticationBytes: #6.24(["DeviceAuthentication", SessionTranscript, docType, DeviceNameSpacesBytes]). */
function deviceAuthenticationBytes(sessionTranscript: unknown[], docType: string, nameSpacesBytes: Uint8Array): Uint8Array {
  return encodeCbor(tag24(['DeviceAuthentication', sessionTranscript, docType, decodeCbor(nameSpacesBytes)]));
}

/**
 * Wallet side: a DeviceResponse presenting `credential` (any shape parseMdoc reads), disclosing only
 * the requested elements (all when `disclose` is absent), signed with the device key over the
 * OpenID4VP session transcript. Returns the base64url vp_token.
 */
export async function buildDeviceResponse(opts: {
  credential: string;
  deviceKey: CryptoKey;
  handover: Oid4vpHandoverInput;
  disclose?: Record<string, string[]>;
}): Promise<string> {
  const m = parseMdoc(opts.credential);
  const nameSpaces = new Map<string, Tag[]>();
  for (const e of m.elements) {
    if (opts.disclose && !opts.disclose[e.namespace]?.includes(e.elementIdentifier)) continue;
    nameSpaces.set(e.namespace, [...(nameSpaces.get(e.namespace) ?? []), e.tagged]);
  }
  const deviceNameSpaces = tag24(new Map());
  const nameSpacesBytes = encodeCbor(deviceNameSpaces);
  const transcript = await oid4vpSessionTranscript(opts.handover);
  const deviceSignature = await signCoseSign1(opts.deviceKey, deviceAuthenticationBytes(transcript, m.docType, nameSpacesBytes), true);
  const document = new Map<string, unknown>([
    ['docType', m.docType],
    ['issuerSigned', new Map<string, unknown>([['nameSpaces', nameSpaces], ['issuerAuth', m.issuerAuthRaw]])],
    ['deviceSigned', new Map<string, unknown>([['nameSpaces', deviceNameSpaces], ['deviceAuth', new Map([['deviceSignature', deviceSignature]])]])],
  ]);
  const response = new Map<string, unknown>([['version', '1.0'], ['documents', [document]], ['status', 0]]);
  return base64url.encode(encodeCbor(response));
}

// ── Verification ────────────────────────────────────────────────────────────

const stage = (id: string, label: string, status: StageStatus, message: string): StageResult => ({ id, label, status, message });

export interface MdocVerifyOptions {
  now?: Date;
  /** DER certificates trusted as mDoc issuers; empty means no trust list is configured. */
  trustedCertificates?: Uint8Array[];
  /** Required for a presentation; omit for a credential-only check. */
  handover?: Oid4vpHandoverInput;
}

/**
 * Verifies one mDoc stage by stage: format, issuer signature (COSE_Sign1 with the x5chain leaf),
 * issuer trust (the leaf against the trust list), element digests, holder binding (the device
 * signature over the session transcript) and validity. Never throws.
 */
export async function verifyMdoc(m: ParsedMdoc, opts: MdocVerifyOptions = {}): Promise<StageResult[]> {
  const now = opts.now ?? new Date();
  const results: StageResult[] = [];
  const observations = mdocObservations(m);
  results.push(
    m.mso.docType && m.mso.docType !== m.docType
      ? stage('format', 'mDoc format', 'fail', `MSO docType ${m.mso.docType} differs from the document's ${m.docType}`)
      : stage('format', 'mDoc format', observations.length ? 'warn' : 'pass', observations.length ? observations.join('; ') : `${m.docType}, ${m.elements.length} elements`),
  );

  const leaf = m.issuerAuth.x5chain[0];
  let signatureOk = false;
  try {
    if (!leaf) throw new Error('issuerAuth has no x5chain certificate');
    const key = (await importX509(pem(leaf), 'ES256')) as CryptoKey;
    signatureOk = await verifyCoseSign1(m.issuerAuth, key);
    results.push(
      signatureOk
        ? stage('issuer-signature', 'Issuer signature', 'pass', `ES256 COSE_Sign1 verified with the x5chain certificate (${m.issuerAuth.x5chain.length} in chain)`)
        : stage('issuer-signature', 'Issuer signature', 'fail', 'COSE_Sign1 signature verification failed'),
    );
  } catch (e) {
    results.push(stage('issuer-signature', 'Issuer signature', 'fail', (e as Error).message));
  }

  const trusted = opts.trustedCertificates ?? [];
  results.push(
    !signatureOk
      ? stage('issuer-trust', 'Issuer trust', 'skip', 'Not checked: the signature did not verify')
      : trusted.length === 0
        ? stage('issuer-trust', 'Issuer trust', 'warn', 'No trusted mDoc issuer certificates configured; the x5chain certificate is accepted as presented')
        : trusted.some((t) => equal(t, leaf!))
          ? stage('issuer-trust', 'Issuer trust', 'pass', `Issuer certificate (SHA-256 ${hex(await sha256(leaf!)).slice(0, 16)}…) is trusted`)
          : stage('issuer-trust', 'Issuer trust', 'warn', `Issuer certificate (SHA-256 ${hex(await sha256(leaf!)).slice(0, 16)}…) is not on the trust list`),
  );

  const checked = await checkDigests(m);
  const bad = checked.filter((e) => !e.digestOk);
  results.push(
    m.mso.digestAlgorithm && m.mso.digestAlgorithm !== 'SHA-256'
      ? stage('digests', 'Element digests', 'fail', `Unsupported digestAlgorithm ${m.mso.digestAlgorithm}`)
      : bad.length > 0
        ? stage('digests', 'Element digests', 'fail', `Not committed to by the issuer: ${bad.map((e) => e.elementIdentifier).join(', ')}`)
        : stage('digests', 'Element digests', 'pass', `${checked.length} elements match the MSO's value digests`),
  );

  if (!opts.handover) {
    results.push(stage('holder-binding', 'Holder binding', 'skip', 'Credential-only check: no presentation to bind'));
  } else if (!m.deviceSigned?.deviceSignature) {
    results.push(stage('holder-binding', 'Holder binding', 'fail', 'No deviceSignature: the presentation is not bound to this request'));
  } else {
    try {
      const deviceKey = (await importJWK(coseKeyToJwk(m.mso.deviceKey), 'ES256')) as CryptoKey;
      const transcript = await oid4vpSessionTranscript(opts.handover);
      const ok = await verifyCoseSign1(
        m.deviceSigned.deviceSignature,
        deviceKey,
        deviceAuthenticationBytes(transcript, m.docType, m.deviceSigned.nameSpacesBytes),
      );
      results.push(
        ok
          ? stage('holder-binding', 'Holder binding', 'pass', "Device signature by the MSO's device key over this request's session transcript (client_id, response_uri, nonce)")
          : stage('holder-binding', 'Holder binding', 'fail', "Device signature does not verify over this request's session transcript (wrong nonce, client_id or response_uri, or another key)"),
      );
    } catch (e) {
      results.push(stage('holder-binding', 'Holder binding', 'fail', (e as Error).message));
    }
  }

  const { validFrom, validUntil } = m.mso.validityInfo;
  results.push(
    validUntil && validUntil < now
      ? stage('validity', 'Validity period', 'fail', `Expired at ${validUntil.toISOString()}`)
      : validFrom && validFrom.getTime() > now.getTime() + 60_000
        ? stage('validity', 'Validity period', 'fail', `Not valid before ${validFrom.toISOString()}`)
        : stage('validity', 'Validity period', 'pass', validUntil ? `Valid until ${validUntil.toISOString()}` : 'No validUntil in the MSO'),
  );
  return results;
}

// ── Issuing (tests and the UI's in-browser mocks) ───────────────────────────

/**
 * An ISO 18013-5 mDoc signed with `issuerKey` (ES256), its certificate in x5chain, bound to
 * `deviceJwk`. `wrapped` produces Certify 0.14.0's `{docType, issuerSigned}` shape. Returns base64url.
 */
export async function createMdoc(opts: {
  docType: string;
  nameSpaces: Record<string, Record<string, unknown>>;
  issuerKey: CryptoKey;
  issuerCertificate: Uint8Array;
  deviceJwk: JWK;
  validFrom: Date;
  validUntil: Date;
  signed?: Date;
  wrapped?: boolean;
}): Promise<string> {
  const tdate = (d: Date) => new Tag(d.toISOString().replace(/\.\d{3}Z$/, 'Z'), 0);
  const nameSpaces = new Map<string, Tag[]>();
  const valueDigests = new Map<string, Map<number, Uint8Array>>();
  let digestID = 0;
  for (const [ns, elements] of Object.entries(opts.nameSpaces)) {
    const items: Tag[] = [];
    const digests = new Map<number, Uint8Array>();
    for (const [elementIdentifier, elementValue] of Object.entries(elements)) {
      const item = tag24(
        new Map<string, unknown>([
          ['digestID', digestID],
          ['random', crypto.getRandomValues(new Uint8Array(16))],
          ['elementIdentifier', elementIdentifier],
          ['elementValue', elementValue],
        ]),
      );
      digests.set(digestID++, await sha256(encodeCbor(item)));
      items.push(item);
    }
    nameSpaces.set(ns, items);
    valueDigests.set(ns, digests);
  }
  const mso = new Map<string, unknown>([
    ['version', '1.0'],
    ['digestAlgorithm', 'SHA-256'],
    ['docType', opts.docType],
    ['valueDigests', valueDigests],
    ['deviceKeyInfo', new Map([['deviceKey', jwkToCoseKey(opts.deviceJwk)]])],
    [
      'validityInfo',
      new Map([
        ['signed', tdate(opts.signed ?? opts.validFrom)],
        ['validFrom', tdate(opts.validFrom)],
        ['validUntil', tdate(opts.validUntil)],
      ]),
    ],
  ]);
  const issuerAuth = await signCoseSign1(opts.issuerKey, encodeCbor(tag24(mso)), false);
  (issuerAuth[1] as Map<number, unknown>).set(COSE_HEADER_X5CHAIN, opts.issuerCertificate);
  const issuerSigned = new Map<string, unknown>([['nameSpaces', nameSpaces], ['issuerAuth', issuerAuth]]);
  const top = opts.wrapped ? new Map<string, unknown>([['docType', opts.docType], ['issuerSigned', issuerSigned]]) : issuerSigned;
  return base64url.encode(encodeCbor(top));
}

// ── Presentation Exchange view and tampering ────────────────────────────────

/**
 * Claims as Presentation Exchange sees an mDoc: `$['<namespace>']['<element>']` paths, plus
 * `docType`. By the ISO 18013-7 convention the input descriptor's id is the docType asked for.
 */
export function mdocClaims(credential: string): Record<string, unknown> {
  const m = parseMdoc(credential);
  const claims: Record<string, Record<string, unknown>> = {};
  for (const e of m.elements) (claims[e.namespace] ??= {})[e.elementIdentifier] = printable(e.elementValue);
  return { docType: m.docType, ...claims };
}

/** The elements a descriptor's `$['ns']['element']` fields ask for, by namespace. */
export function requestedElements(fields: Array<{ path: string[] }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const f of fields)
    for (const p of f.path) {
      const m = p.match(/^\$\[['"]([^'"]+)['"]\]\[['"]([^'"]+)['"]\]$/);
      if (m) (out[m[1]!] ??= []).push(m[2]!);
    }
  return out;
}

/**
 * A deliberately broken copy of an mDoc, in the same outer shape: `signature` flips one byte of the
 * issuer's COSE signature; `claim` changes a string element's value after issuance, so its digest no
 * longer matches the MSO. Pass `disclosed` (the elements the presentation will show) so the edited
 * element is one the verifier sees. Returns the new base64url credential and what changed.
 */
export function tamperMdoc(
  credential: string,
  kind: 'signature' | 'claim',
  disclosed?: Record<string, string[]>,
): { raw: string; path: string; before?: string; after?: string } {
  const top = decodeCbor(base64url.decode(credential.trim())) as CborMap;
  const issuerSigned = (top.has('issuerAuth') ? top : get(top, 'issuerSigned')) as CborMap;
  if (kind === 'signature') {
    const auth = get(issuerSigned, 'issuerAuth') as unknown[];
    const sig = (auth[3] as Uint8Array).slice();
    sig[Math.floor(sig.length / 2)] = sig[Math.floor(sig.length / 2)]! ^ 0x01;
    auth[3] = sig;
    return { raw: base64url.encode(encodeCbor(top)), path: 'issuerAuth signature' };
  }
  for (const [ns, items] of get(issuerSigned, 'nameSpaces') as CborMap) {
    const list = items as Tag[];
    const i = list.findIndex((t) => {
      const item = decodeCbor(t.value as Uint8Array);
      const shown = !disclosed || disclosed[String(ns)]?.includes(String(get(item, 'elementIdentifier')));
      return shown && typeof get(item, 'elementValue') === 'string';
    });
    if (i === -1) continue;
    const item = decodeCbor(list[i]!.value as Uint8Array) as CborMap;
    const before = String(item.get('elementValue'));
    item.set('elementValue', `${before} (edited)`);
    list[i] = tag24(item);
    return {
      raw: base64url.encode(encodeCbor(top)),
      path: `${String(ns)} ${String(item.get('elementIdentifier'))}`,
      before,
      after: `${before} (edited)`,
    };
  }
  throw new Error('No string element to edit');
}
