// SD-JWT helpers for the holder side: split, read disclosed claims, select disclosures and add a
// key-binding JWT bound to the verifier's nonce and client_id.
import { createHash } from 'node:crypto';
import { base64url, decodeJwt, SignJWT } from 'jose';
import type { HolderKey } from './keys.ts';

export interface SdJwtParts {
  issuerJwt: string;
  disclosures: Array<{ encoded: string; name?: string; value: unknown }>;
}

export function splitSdJwt(raw: string): SdJwtParts {
  const [issuerJwt = '', ...rest] = raw.split('~');
  const disclosures = rest.filter(Boolean).flatMap((encoded) => {
    try {
      const arr = JSON.parse(new TextDecoder().decode(base64url.decode(encoded))) as unknown[];
      return arr.length === 3
        ? [{ encoded, name: String(arr[1]), value: arr[2] }]
        : [{ encoded, value: arr[1] }];
    } catch {
      return [];
    }
  });
  return { issuerJwt, disclosures };
}

/** Issuer JWT payload with every disclosed top-level claim filled in, for request matching. */
export function sdJwtClaims(raw: string): Record<string, unknown> {
  const { issuerJwt, disclosures } = splitSdJwt(raw);
  const claims: Record<string, unknown> = { ...decodeJwt(issuerJwt) };
  for (const d of disclosures) if (d.name !== undefined) claims[d.name] = d.value;
  return claims;
}

export const sdHash = (presented: string) =>
  base64url.encode(createHash('sha256').update(presented, 'ascii').digest());

/** `<issuer-jwt>~<selected disclosures>~<kb-jwt>`; `disclose` undefined keeps every disclosure. */
export async function presentSdJwt(opts: {
  raw: string;
  holder: HolderKey;
  nonce: string;
  audience: string;
  disclose?: string[];
}): Promise<string> {
  const { issuerJwt, disclosures } = splitSdJwt(opts.raw);
  const kept = opts.disclose
    ? disclosures.filter((d) => d.name === undefined || opts.disclose!.includes(d.name))
    : disclosures;
  const presented = `${[issuerJwt, ...kept.map((d) => d.encoded)].join('~')}~`;
  const kb = await new SignJWT({ nonce: opts.nonce, sd_hash: sdHash(presented) })
    .setProtectedHeader({ alg: 'ES256', typ: 'kb+jwt' })
    .setAudience(opts.audience)
    .setIssuedAt()
    .sign(opts.holder.privateKey);
  return `${presented}${kb}`;
}

/** A new disclosure for an existing claim name; its digest is not in the issuer JWT, so it breaks verification. */
export function forgeDisclosure(name: string, value: unknown): string {
  return base64url.encode(
    JSON.stringify([base64url.encode(crypto.getRandomValues(new Uint8Array(12))), name, value]),
  );
}
