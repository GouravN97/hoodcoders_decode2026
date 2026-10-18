// Masks secrets in captured traffic before it is shown (Task 5: "masking of secrets such as
// access tokens by default"). The BFF's Redactor masks the stored copy; this is the UI's
// second line of defence and the basis of the "Reveal secrets" toggle.

export const SECRET_FIELDS = [
  'access_token',
  'refresh_token',
  'pre-authorized_code',
  'tx_code',
  'client_secret',
  'code_verifier',
] as const;

const SECRET_HEADERS = ['authorization', 'cookie', 'set-cookie', 'dpop', 'x-api-key'];

/** Keeps the first and last four characters, like the tap's Redactor. */
export function mask(value: string): string {
  if (value.length <= 8) return '•'.repeat(Math.max(value.length, 4));
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

const patterns = SECRET_FIELDS.flatMap((field) => {
  const f = escapeRe(field);
  const enc = escapeRe(encodeURIComponent(field));
  return [
    // JSON: "field": "value"
    new RegExp(`("${f}"\\s*:\\s*")([^"]+)(")`, 'g'),
    // form / query: field=value
    new RegExp(`((?:^|[?&])${f}=)([^&\\s"]+)()`, 'g'),
    // percent-encoded JSON inside a URI: %22field%22%3A%22value%22
    new RegExp(`(%22${enc}%22%3A%22)(.+?)(%22)`, 'gi'),
  ];
});

export function redactText(text: string | undefined): string | undefined {
  if (!text) return text;
  let out = text;
  for (const re of patterns) out = out.replace(re, (_m, pre: string, v: string, post: string) => `${pre}${mask(v)}${post}`);
  return out;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!SECRET_HEADERS.includes(k.toLowerCase())) out[k] = v;
    else {
      const m = /^(Bearer|DPoP|Basic)\s+(.+)$/i.exec(v);
      out[k] = m ? `${m[1]} ${mask(m[2]!)}` : mask(v);
    }
  }
  return out;
}
