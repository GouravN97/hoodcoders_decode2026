// Holder key: one P-256 key per wallet process, identified as did:jwk. Inji Certify's Farmer
// configurations accept ES256 proofs and did:jwk binding, and Inji Verify (vc-verifier 1.8) checks
// VP holder proofs signed with the same key, so one key serves issuance and presentation.
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { base64url, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';

export interface HolderKey {
  did: string;
  /** `did#0`, the key's verification method. */
  kid: string;
  publicJwk: JWK;
  privateKey: CryptoKey;
  /** Same private key as a Node KeyObject, for detached-payload JWS (JsonWebSignature2020). */
  privateKeyObject: KeyObject;
}

export async function createHolderKey(): Promise<HolderKey> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const { kty, crv, x, y } = await exportJWK(publicKey);
  const publicJwk: JWK = { crv, kty, x, y };
  const did = `did:jwk:${base64url.encode(JSON.stringify(publicJwk))}`;
  const privateKeyObject = createPrivateKey({ key: await exportJWK(privateKey), format: 'jwk' });
  return { did, kid: `${did}#0`, publicJwk, privateKey, privateKeyObject };
}

/** ES256 over `data`, as raw r||s (the JWS encoding). */
export function signEs256(key: HolderKey, data: Uint8Array): Uint8Array {
  return sign('sha256', data, { key: key.privateKeyObject, dsaEncoding: 'ieee-p1363' });
}
