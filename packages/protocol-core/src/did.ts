// DID resolution for the methods the playground meets: did:jwk (holder keys from Inji Wallet and the
// mock wallet) and did:web (Inji Verify, the mock verifier, Certify). Works in Node and browsers.
import { base64url, type JWK } from 'jose';

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

export function base58Decode(s: string): Uint8Array {
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

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

const ED25519_MULTICODEC = [0xed, 0x01];

/** `z…` multibase (base58btc) Ed25519 public key → OKP JWK. */
export function ed25519MultibaseToJwk(multibase: string): JWK {
  if (!multibase.startsWith('z')) throw new Error('publicKeyMultibase is not base58btc');
  const bytes = base58Decode(multibase.slice(1));
  if (bytes[0] !== ED25519_MULTICODEC[0] || bytes[1] !== ED25519_MULTICODEC[1])
    throw new Error('publicKeyMultibase is not an Ed25519 key');
  return { kty: 'OKP', crv: 'Ed25519', x: base64url.encode(bytes.slice(2)) };
}

/** OKP Ed25519 JWK → `z…` multibase, for a DID document's publicKeyMultibase. */
export function ed25519JwkToMultibase(jwk: JWK): string {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) throw new Error('not an Ed25519 JWK');
  return `z${base58Encode(Uint8Array.from([...ED25519_MULTICODEC, ...base64url.decode(jwk.x)]))}`;
}

/** The public JWK inside a did:jwk (fragment ignored). */
export function didJwkToJwk(did: string): JWK {
  const encoded = did.replace(/^did:jwk:/, '').split('#')[0]!;
  return JSON.parse(new TextDecoder().decode(base64url.decode(encoded))) as JWK;
}

interface VerificationMethod {
  id: string;
  publicKeyJwk?: JWK;
  publicKeyMultibase?: string;
}

export type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * The public key a DID URL names: did:jwk directly, did:web by fetching its document and taking
 * the verification method the fragment names (or the first one).
 */
export async function resolveDidKey(didUrl: string, fetchFn: Fetch = (u) => fetch(u)): Promise<JWK> {
  if (didUrl.startsWith('did:jwk:')) return didJwkToJwk(didUrl);
  if (!didUrl.startsWith('did:web:')) throw new Error(`Unsupported DID method in ${didUrl}`);
  const res = await fetchFn(didWebUrl(didUrl));
  if (!res.ok) throw new Error(`${didWebUrl(didUrl)} answered HTTP ${res.status}`);
  const doc = (await res.json()) as { verificationMethod?: VerificationMethod[] };
  const methods = doc.verificationMethod ?? [];
  const fragment = didUrl.includes('#') ? didUrl.slice(didUrl.indexOf('#')) : undefined;
  const method =
    methods.find((m) => m.id === didUrl || (fragment && m.id.endsWith(fragment))) ?? methods[0];
  if (!method) throw new Error('DID document has no verification method');
  if (method.publicKeyJwk) return method.publicKeyJwk;
  if (method.publicKeyMultibase) return ed25519MultibaseToJwk(method.publicKeyMultibase);
  throw new Error(`Verification method ${method.id} has no usable public key`);
}
