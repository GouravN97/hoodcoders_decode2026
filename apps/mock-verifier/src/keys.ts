// The verifier's signing key: Ed25519, published in its did:web document as an
// Ed25519VerificationKey2020 multibase key, the same shape Inji Verify publishes and Inji Wallet
// already resolves. A new key per process; the DID document always shows the current one.
import { ed25519JwkToMultibase } from '@playground/protocol-core';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';

export interface VerifierKey {
  kid: string;
  privateKey: CryptoKey;
  didDocument: object;
}

export async function createVerifierKey(clientId: string): Promise<VerifierKey> {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const kid = `${clientId}#key-0`;
  return {
    kid,
    privateKey,
    didDocument: {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: clientId,
      verificationMethod: [
        {
          '@context': 'https://w3id.org/security/suites/ed25519-2020/v1',
          id: kid,
          type: 'Ed25519VerificationKey2020',
          controller: clientId,
          publicKeyMultibase: ed25519JwkToMultibase(await exportJWK(publicKey)),
        },
      ],
      authentication: [kid],
      assertionMethod: [kid],
    },
  };
}

/** A signed request object (JAR), typ oauth-authz-req+jwt. */
export const signRequestObject = (key: VerifierKey, claims: Record<string, unknown>) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'oauth-authz-req+jwt', kid: key.kid })
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .sign(key.privateKey);
