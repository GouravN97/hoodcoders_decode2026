// BFF-side payload decoders — JWT, SD-JWT, JSON-LD VC.
// Ported from apps/playground-ui/src/lib/decode/index.ts to run in Node.
// Pure and synchronous; no external dependencies (uses Buffer for base64url).

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

export type Decoded =
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'jwt'; jwt: DecodedJwt }
  | { kind: 'sd-jwt'; issuerJwt: DecodedJwt; disclosures: Disclosure[]; kbJwt?: DecodedJwt }
  | { kind: 'json'; value: unknown; isLdpVc: boolean }
  | { kind: 'form'; fields: Record<string, string> };

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const SD_JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*~/;

/** Decode a base64url string to a UTF-8 string (Node Buffer). */
function b64urlDecode(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function decodeJwtParts(token: string): DecodedJwt | null {
  if (!JWT_RE.test(token)) return null;
  try {
    const [h, p, sig] = token.split('.');
    return {
      header: JSON.parse(b64urlDecode(h!)) as Record<string, unknown>,
      payload: JSON.parse(b64urlDecode(p!)) as Record<string, unknown>,
      signature: sig ?? '',
    };
  } catch {
    return null;
  }
}

export function decodeDisclosure(encoded: string): Disclosure | null {
  try {
    const arr: unknown = JSON.parse(b64urlDecode(encoded));
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

/** Returns true if the parsed JSON looks like a JSON-LD VC or VP. */
export function isLdpVc(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  const types = Array.isArray(o['type']) ? o['type'] : [o['type']];
  return (
    '@context' in o &&
    'proof' in o &&
    types.some((t) => t === 'VerifiableCredential' || t === 'VerifiablePresentation')
  );
}

/** Decode a raw HTTP body string into a structured Decoded value. */
export function decodeBody(body: string | undefined, contentType?: string): Decoded {
  const raw = body?.trim() ?? '';
  if (raw === '') return { kind: 'empty' };

  // Form-encoded (token endpoint)
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const fields: Record<string, string> = {};
    new URLSearchParams(raw).forEach((v, k) => { fields[k] = v; });
    return { kind: 'form', fields };
  }

  // JSON / JSON-LD
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const value: unknown = JSON.parse(raw);
      return { kind: 'json', value, isLdpVc: isLdpVc(value) };
    } catch {
      // fall through
    }
  }

  // SD-JWT
  const sd = decodeSdJwt(raw);
  if (sd) return sd;

  // Plain JWT
  const jwt = decodeJwtParts(raw);
  if (jwt) return { kind: 'jwt', jwt };

  return { kind: 'text', value: raw };
}

/** Decode both the request and response bodies of an exchange. */
export function decodeExchange(
  requestBody: string | undefined,
  requestContentType: string | undefined,
  responseBody: string | undefined,
  responseContentType: string | undefined,
): { request: Decoded; response: Decoded } {
  return {
    request: decodeBody(requestBody, requestContentType),
    response: decodeBody(responseBody, responseContentType),
  };
}
