// Client-side payload decoders for the protocol inspector. Pure and synchronous (SD-JWT
// digest checks live in ./sdjwt.ts and are async), so they can move to protocol-core later.
import { parseDeviceResponse, parseMdoc, type ParsedMdoc } from '@playground/protocol-core';
import { base64url, decodeJwt, decodeProtectedHeader } from 'jose';

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

export interface Disclosure {
  encoded: string;
  salt: string;
  /** Claim name; absent for array-element disclosures. */
  name?: string;
  value: unknown;
}

export interface Embedded {
  /** JSON path or parameter name where the encoded value was found, e.g. `credential` or `vp_token`. */
  path: string;
  decoded: Decoded;
}

export type Decoded =
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'jwt'; jwt: DecodedJwt }
  | { kind: 'sd-jwt'; issuerJwt: DecodedJwt; disclosures: Disclosure[]; kbJwt?: DecodedJwt }
  | { kind: 'json'; value: unknown; isLdpVc: boolean; embedded: Embedded[] }
  | { kind: 'form'; fields: Record<string, string>; embedded: Embedded[] }
  | { kind: 'uri'; scheme: string; params: Record<string, string>; embedded: Embedded[] }
  /** ISO mDoc: a credential (IssuerSigned, or Certify's {docType, issuerSigned}) or a DeviceResponse vp_token. */
  | { kind: 'mdoc'; container: 'credential' | 'DeviceResponse'; documents: ParsedMdoc[] };

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const SD_JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*~/;
const CUSTOM_URI_RE = /^([a-z][a-z0-9+.-]*):\/\/[^\s]*\?/i;
const FORM_RE = /^[\w.%-]+=[^&\s]*(&[\w.%-]+=[^&\s]*)*$/;
/** Long base64url with no dots (Certify pads it with "="): a CBOR candidate (mDoc), confirmed only if it parses as one. */
const CBOR_B64_RE = /^[A-Za-z0-9_-]{120,}={0,2}$/;

const textDecoder = new TextDecoder();

export function decodeJwtParts(token: string): DecodedJwt | null {
  if (!JWT_RE.test(token)) return null;
  try {
    return {
      header: decodeProtectedHeader(token) as Record<string, unknown>,
      payload: decodeJwt(token) as Record<string, unknown>,
      signature: token.split('.')[2] ?? '',
    };
  } catch {
    return null;
  }
}

export function decodeDisclosure(encoded: string): Disclosure | null {
  try {
    const arr: unknown = JSON.parse(textDecoder.decode(base64url.decode(encoded)));
    if (!Array.isArray(arr) || typeof arr[0] !== 'string') return null;
    return arr.length === 3
      ? { encoded, salt: arr[0], name: String(arr[1]), value: arr[2] }
      : { encoded, salt: arr[0], value: arr[1] };
  } catch {
    return null;
  }
}

/** SD-JWT: `<issuer-jwt>~<disclosure>~...~[<kb-jwt>]`. */
export function decodeSdJwt(raw: string): Extract<Decoded, { kind: 'sd-jwt' }> | null {
  if (!SD_JWT_RE.test(raw)) return null;
  const parts = raw.split('~');
  const issuerJwt = decodeJwtParts(parts[0] ?? '');
  if (!issuerJwt) return null;
  const last = parts.at(-1) ?? '';
  const kbJwt = parts.length > 1 && last !== '' ? decodeJwtParts(last) : null;
  const disclosureParts = parts.slice(1, kbJwt ? -1 : undefined).filter(Boolean);
  const disclosures = disclosureParts
    .map(decodeDisclosure)
    .filter((d): d is Disclosure => d !== null);
  return { kind: 'sd-jwt', issuerJwt, disclosures, ...(kbJwt ? { kbJwt } : {}) };
}

/** An mDoc credential or DeviceResponse, or null when the text is not one. */
export function decodeMdoc(raw: string): Extract<Decoded, { kind: 'mdoc' }> | null {
  if (!CBOR_B64_RE.test(raw)) return null;
  try {
    return { kind: 'mdoc', container: 'DeviceResponse', documents: parseDeviceResponse(raw).documents };
  } catch {
    try {
      return { kind: 'mdoc', container: 'credential', documents: [parseMdoc(raw)] };
    } catch {
      return null;
    }
  }
}

/** Strings worth decoding further when found inside JSON, forms or URIs. */
function decodeNested(value: string): Decoded | null {
  let v = value.trim();
  // A JSON-encoded string (Inji Wallet's vp_token): decode what is inside the quotes.
  if (v.startsWith('"')) {
    try {
      const inner: unknown = JSON.parse(v);
      if (typeof inner === 'string') v = inner.trim();
    } catch {
      /* not JSON */
    }
  }
  const mdoc = decodeMdoc(v);
  if (mdoc) return mdoc;
  if (SD_JWT_RE.test(v)) return decodeSdJwt(v);
  if (JWT_RE.test(v)) {
    const jwt = decodeJwtParts(v);
    return jwt ? { kind: 'jwt', jwt } : null;
  }
  if (v.startsWith('{') || v.startsWith('[')) {
    const d = decodeJson(v);
    return d;
  }
  if (CUSTOM_URI_RE.test(v)) return decodeUri(v);
  return null;
}

function collectEmbedded(value: unknown, path: string, out: Embedded[], depth = 0): void {
  if (depth > 6) return;
  if (typeof value === 'string') {
    const d = decodeNested(value);
    if (d) out.push({ path, decoded: d });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectEmbedded(v, `${path}[${i}]`, out, depth + 1));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      collectEmbedded(v, path ? `${path}.${k}` : k, out, depth + 1);
    }
  }
}

export function isLdpVc(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  const types = Array.isArray(o.type) ? o.type : [o.type];
  return '@context' in o && 'proof' in o && types.some((t) => t === 'VerifiableCredential' || t === 'VerifiablePresentation');
}

function decodeJson(raw: string): Extract<Decoded, { kind: 'json' }> | null {
  try {
    const value: unknown = JSON.parse(raw);
    const embedded: Embedded[] = [];
    collectEmbedded(value, '', embedded);
    return { kind: 'json', value, isLdpVc: isLdpVc(value), embedded };
  } catch {
    return null;
  }
}

function paramsEmbedded(params: Record<string, string>): Embedded[] {
  const out: Embedded[] = [];
  for (const [k, v] of Object.entries(params)) {
    const d = decodeNested(v);
    if (d) out.push({ path: k, decoded: d });
  }
  return out;
}

function searchParamsToRecord(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => (out[k] = v));
  return out;
}

export function decodeUri(raw: string): Extract<Decoded, { kind: 'uri' }> | null {
  const m = CUSTOM_URI_RE.exec(raw.trim());
  if (!m) return null;
  const query = raw.slice(raw.indexOf('?') + 1);
  const params = searchParamsToRecord(new URLSearchParams(query));
  return { kind: 'uri', scheme: m[1]!.toLowerCase(), params, embedded: paramsEmbedded(params) };
}

export function decodeForm(raw: string): Extract<Decoded, { kind: 'form' }> {
  const fields = searchParamsToRecord(new URLSearchParams(raw.trim()));
  return { kind: 'form', fields, embedded: paramsEmbedded(fields) };
}

/** Decodes a captured HTTP body (or an out-of-band QR/link payload). */
export function decodeBody(body: string | undefined, contentType?: string): Decoded {
  const raw = body?.trim() ?? '';
  if (raw === '') return { kind: 'empty' };
  if (contentType?.includes('application/x-www-form-urlencoded')) return decodeForm(raw);
  if (raw.startsWith('{') || raw.startsWith('[')) {
    const json = decodeJson(raw);
    if (json) return json;
  }
  const sd = decodeSdJwt(raw);
  if (sd) return sd;
  const jwt = decodeJwtParts(raw);
  if (jwt) return { kind: 'jwt', jwt };
  const uri = decodeUri(raw);
  if (uri) return uri;
  const mdoc = decodeMdoc(raw);
  if (mdoc) return mdoc;
  if (FORM_RE.test(raw)) return decodeForm(raw);
  return { kind: 'text', value: raw };
}

/** Query parameters of a request URL, decoded (GET authorize / request_uri calls). */
export function decodeUrlQuery(url: string): Extract<Decoded, { kind: 'form' }> | null {
  const i = url.indexOf('?');
  if (i === -1) return null;
  return decodeForm(url.slice(i + 1));
}

/** Short label for a decoded value, used in tabs and list badges. */
export function decodedKindLabel(d: Decoded): string {
  switch (d.kind) {
    case 'empty':
      return 'Empty';
    case 'text':
      return 'Text';
    case 'jwt':
      return 'JWT';
    case 'sd-jwt':
      return 'SD-JWT';
    case 'json':
      return d.isLdpVc ? 'JSON-LD VC' : 'JSON';
    case 'form':
      return 'Form';
    case 'uri':
      return `${d.scheme}:// URI`;
    case 'mdoc':
      return d.container === 'DeviceResponse' ? 'mDoc DeviceResponse' : 'mDoc';
  }
}
