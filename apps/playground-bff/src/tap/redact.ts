// Masks secrets in the stored copy of an exchange (plan §4.3 Redactor). Traffic is forwarded
// unchanged; only what the inspector and the API show is masked. TAP_REVEAL_SECRETS=true turns
// masking off for local debugging.
import type { HttpMessage } from '@playground/shared';

export const SECRET_HEADERS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'dpop',
];
export const SECRET_FIELDS = [
  'access_token',
  'refresh_token',
  'pre-authorized_code',
  'tx_code',
  'code',
  'client_secret',
  'id_token',
];

const revealSecrets = () => process.env.TAP_REVEAL_SECRETS === 'true';

/** Keeps the first and last four characters, as the plan specifies. */
export function mask(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : '••••';
}

function maskHeader(name: string, value: string): string {
  const scheme =
    name === 'authorization' || name === 'proxy-authorization'
      ? value.match(/^(\w+)\s+(.+)$/)
      : null;
  return scheme ? `${scheme[1]} ${mask(scheme[2]!)}` : mask(value);
}

/** String values of secret fields anywhere in a JSON document. */
function secretValues(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => secretValues(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELDS.includes(k) && typeof v === 'string' && v) out.push(v);
      else secretValues(v, out);
    }
  }
  return out;
}

export function redactBody(
  body: string | undefined,
  contentType: string | undefined,
): string | undefined {
  if (!body) return body;
  const trimmed = body.trim();
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    let changed = false;
    for (const f of SECRET_FIELDS) {
      const v = params.get(f);
      if (v) {
        params.set(f, mask(v));
        changed = true;
      }
    }
    return changed ? params.toString() : body;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let secrets: string[];
    try {
      secrets = secretValues(JSON.parse(trimmed));
    } catch {
      return body;
    }
    // Replace in place so the stored body keeps its original formatting.
    return secrets.reduce((b, s) => b.split(JSON.stringify(s).slice(1, -1)).join(mask(s)), body);
  }
  return body;
}

/** Masks secret query parameters, e.g. an authorization `code` on a redirect. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const f of SECRET_FIELDS) {
      const v = u.searchParams.get(f);
      if (v) u.searchParams.set(f, mask(v));
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function redactMessage(msg: HttpMessage): HttpMessage {
  if (revealSecrets()) return msg;
  const headers = Object.fromEntries(
    Object.entries(msg.headers).map(([k, v]) => [
      k,
      SECRET_HEADERS.includes(k.toLowerCase()) ? maskHeader(k.toLowerCase(), v) : v,
    ]),
  );
  const body = redactBody(msg.body, msg.contentType);
  return { ...msg, headers, ...(body !== undefined ? { body } : {}) };
}

export const redactExchangeUrl = (url: string) => (revealSecrets() ? url : redactUrl(url));
