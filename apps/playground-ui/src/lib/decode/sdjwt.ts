import { base64url } from 'jose';
import type { Disclosure } from './index';

/** All digests the issuer JWT commits to: `_sd` arrays and `{ "...": digest }` array entries. */
export function collectSdDigests(payload: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (item && typeof item === 'object' && !Array.isArray(item) && '...' in item) {
        const d = (item as Record<string, unknown>)['...'];
        if (typeof d === 'string') out.add(d);
      } else collectSdDigests(item, out);
    }
  } else if (payload && typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload)) {
      if (k === '_sd' && Array.isArray(v)) v.forEach((d) => typeof d === 'string' && out.add(d));
      else collectSdDigests(v, out);
    }
  }
  return out;
}

const ALG: Record<string, string> = { 'sha-256': 'SHA-256', 'sha-384': 'SHA-384', 'sha-512': 'SHA-512' };

export async function disclosureDigest(encoded: string, sdAlg = 'sha-256'): Promise<string> {
  const algorithm = ALG[sdAlg.toLowerCase()] ?? 'SHA-256';
  const hash = await crypto.subtle.digest(algorithm, new TextEncoder().encode(encoded));
  return base64url.encode(new Uint8Array(hash));
}

export interface DisclosureMatch {
  disclosure: Disclosure;
  digest: string;
  /** True when the issuer JWT contains this disclosure's digest. */
  matched: boolean;
}

/** Recomputes each disclosure's digest and checks it against the issuer-signed payload. */
export async function matchDisclosures(
  issuerPayload: Record<string, unknown>,
  disclosures: Disclosure[],
): Promise<DisclosureMatch[]> {
  const sdAlg = typeof issuerPayload._sd_alg === 'string' ? issuerPayload._sd_alg : 'sha-256';
  const digests = collectSdDigests(issuerPayload);
  return Promise.all(
    disclosures.map(async (disclosure) => {
      const digest = await disclosureDigest(disclosure.encoded, sdAlg);
      return { disclosure, digest, matched: digests.has(digest) };
    }),
  );
}
