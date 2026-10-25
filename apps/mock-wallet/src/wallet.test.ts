import { createHash, createPublicKey, verify } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { nonceOfVpToken, type HeldCredential } from '@playground/shared';
import {
  base64url,
  decodeJwt,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  SignJWT,
} from 'jose';
import jsonld from 'jsonld';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHolderKey, type HolderKey } from './keys.ts';
import { signPresentation } from './ldp.ts';
import {
  didWebUrl,
  matches,
  readPath,
  requestedType,
  respond,
  tamperCredential,
} from './oid4vp.ts';
import { presentSdJwt, sdHash, sdJwtClaims, splitSdJwt } from './sdjwt.ts';

let holder: HolderKey;
beforeAll(async () => {
  holder = await createHolderKey();
});

const disclosure = (name: string, value: unknown) =>
  base64url.encode(JSON.stringify(['salt-' + name, name, value]));

async function issueSdJwt(claims: Record<string, string>) {
  const issuer = await generateKeyPair('ES256');
  const disclosures = Object.entries(claims).map(([k, v]) => disclosure(k, v));
  const digests = disclosures.map((d) => base64url.encode(createHash('sha256').update(d).digest()));
  const jwt = await new SignJWT({ vct: 'FarmerCredentialSdJwt', _sd: digests, _sd_alg: 'sha-256' })
    .setProtectedHeader({ alg: 'ES256', typ: 'vc+sd-jwt' })
    .sign(issuer.privateKey);
  return `${jwt}~${disclosures.join('~')}~`;
}

const held = (format: HeldCredential['format'], raw: string): HeldCredential => ({
  id: 'c1',
  format,
  credentialConfigurationId: 'x',
  issuer: 'https://certify.test',
  raw,
  receivedAt: '',
  holderDid: 'did:jwk:x',
});

describe('holder key', () => {
  it('is a did:jwk of a P-256 public key', () => {
    const jwk = JSON.parse(
      new TextDecoder().decode(base64url.decode(holder.did.slice('did:jwk:'.length))),
    );
    expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(jwk.d).toBeUndefined();
    expect(holder.kid).toBe(`${holder.did}#0`);
  });
});

describe('SD-JWT presentation', () => {
  it('binds a key-binding JWT to nonce, audience and the presented disclosures', async () => {
    const raw = await issueSdJwt({
      fullName: 'Ramesh Kumar',
      farmerID: 'FRM-1',
      landArea: '2.5 acres',
    });
    expect(sdJwtClaims(raw)).toMatchObject({
      vct: 'FarmerCredentialSdJwt',
      fullName: 'Ramesh Kumar',
    });

    const vp = await presentSdJwt({
      raw,
      holder,
      nonce: 'n-1',
      audience: 'did:web:verify.test',
      disclose: ['fullName'],
    });
    const parts = vp.split('~');
    const kb = parts.at(-1)!;
    const presented = `${parts.slice(0, -1).join('~')}~`;
    expect(splitSdJwt(presented).disclosures.map((d) => d.name)).toEqual(['fullName']);

    const { payload, protectedHeader } = await jwtVerify(
      kb,
      await importJWK(holder.publicJwk, 'ES256'),
      { audience: 'did:web:verify.test' },
    );
    expect(protectedHeader.typ).toBe('kb+jwt');
    expect(payload).toMatchObject({ nonce: 'n-1', sd_hash: sdHash(presented) });
  });
});

describe('JSON-LD presentation (JsonWebSignature2020, as vc-verifier checks it)', () => {
  it('signs SHA-256(proof options) || SHA-256(presentation) with the holder key', async () => {
    const credential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential'],
      issuer: 'did:web:certify.test',
      issuanceDate: '2026-01-01T00:00:00Z',
      credentialSubject: { id: holder.did },
    };
    const vp = await signPresentation({
      credential,
      holder,
      challenge: 'nonce-1',
      domain: 'did:web:verify.test',
    });
    const { proof, ...unsigned } = vp as { proof: Record<string, string> } & Record<
      string,
      unknown
    >;
    expect(proof).toMatchObject({
      type: 'JsonWebSignature2020',
      challenge: 'nonce-1',
      domain: 'did:web:verify.test',
      verificationMethod: holder.kid,
    });
    expect(vp.holder).toBe(holder.did);

    // Recompute the signing input independently and verify the detached JWS.
    const { jws, ...options } = proof;
    const loader = async (url: string) => {
      const file = url.endsWith('credentials/v1') ? 'credentials-v1.json' : 'jws-2020-v1.json';
      const { readFileSync } = await import('node:fs');
      return {
        contextUrl: undefined,
        documentUrl: url,
        document: JSON.parse(readFileSync(new URL(`./contexts/${file}`, import.meta.url), 'utf8')),
      };
    };
    const canon = async (doc: object) =>
      createHash('sha256')
        .update(
          await jsonld.canonize(doc, {
            algorithm: 'URDNA2015',
            format: 'application/n-quads',
            documentLoader: loader,
            safe: false,
          } as jsonld.Options.Normalize),
        )
        .digest();
    const input = Buffer.concat([
      await canon({ '@context': unsigned['@context'], ...options }),
      await canon(unsigned),
    ]);
    const [header, , signature] = jws!.split('.');
    expect(JSON.parse(new TextDecoder().decode(base64url.decode(header!)))).toEqual({
      alg: 'ES256',
      b64: false,
      crit: ['b64'],
    });
    const key = createPublicKey({ key: holder.publicJwk as never, format: 'jwk' });
    const ok = verify(
      'sha256',
      Buffer.concat([Buffer.from(`${header}.`), input]),
      { key, dsaEncoding: 'ieee-p1363' },
      base64url.decode(signature!),
    );
    expect(ok).toBe(true);
  });
});

describe('request matching', () => {
  const sdDescriptor = {
    id: 'farmer',
    format: { 'vc+sd-jwt': {} },
    constraints: {
      fields: [{ path: ['$.vct'], filter: { type: 'string', pattern: 'FarmerCredentialSdJwt' } }],
    },
  };
  const ldpDescriptor = {
    id: 'farmer',
    format: { ldp_vc: { proof_type: ['Ed25519Signature2020'] } },
    constraints: {
      fields: [{ path: ['$.type'], filter: { type: 'object', pattern: 'FarmerCredential' } }],
    },
  };
  const vc = JSON.stringify({
    type: ['VerifiableCredential', 'FarmerCredential'],
    proof: { proofValue: 'z3abc' },
    credentialSubject: { id: 'x', fullName: 'A' },
  });

  it('matches by format and field filters', async () => {
    const sd = held('vc+sd-jwt', await issueSdJwt({ fullName: 'A' }));
    expect(matches(sd, sdDescriptor)).toBe(true);
    expect(matches(sd, ldpDescriptor)).toBe(false);
    expect(matches(held('ldp_vc', vc), ldpDescriptor)).toBe(true);
    // The MOSIP ID request Inji Verify used to send by default does not match a Farmer credential.
    expect(
      matches(held('ldp_vc', vc), {
        ...ldpDescriptor,
        constraints: {
          fields: [
            { path: ['$.type'], filter: { type: 'object', pattern: 'MOSIPVerifiableCredential' } },
          ],
        },
      }),
    ).toBe(false);
  });

  it('reads simple JSONPath', () => {
    expect(readPath({ a: { b: 1 } }, '$.a.b')).toBe(1);
    expect(readPath({ a: { b: 1 } }, "$['a']['b']")).toBe(1);
  });
});

describe('tampering', () => {
  it('breaks the SD-JWT issuer signature or a disclosure', async () => {
    const raw = await issueSdJwt({ fullName: 'A' });
    const flipped = tamperCredential(held('vc+sd-jwt', raw), 'T-SIG-FLIP');
    expect(flipped.split('.')[2]).not.toBe(raw.split('.')[2]);
    expect(decodeJwt(flipped.split('~')[0]!)).toEqual(decodeJwt(raw.split('~')[0]!));
    const edited = tamperCredential(held('vc+sd-jwt', raw), 'T-CLAIM-EDIT');
    expect(sdJwtClaims(edited).fullName).toBe('A (edited)');
  });

  it('breaks the JSON-LD proof or a claim', () => {
    const vc = JSON.stringify({
      proof: { proofValue: 'z3abcdef' },
      credentialSubject: { id: 'x', fullName: 'A' },
    });
    expect(
      JSON.parse(tamperCredential(held('ldp_vc', vc), 'T-SIG-FLIP')).proof.proofValue,
    ).not.toBe('z3abcdef');
    expect(
      JSON.parse(tamperCredential(held('ldp_vc', vc), 'T-CLAIM-EDIT')).credentialSubject.fullName,
    ).toBe('A (edited)');
  });
});

describe('did:web', () => {
  it('resolves to the DID document URL', () => {
    expect(didWebUrl('did:web:verify.localhost%3A8443:v1:verify')).toBe(
      'https://verify.localhost:8443/v1/verify/did.json',
    );
    expect(didWebUrl('did:web:certify.test#key-0')).toBe(
      'https://certify.test/.well-known/did.json',
    );
  });
});

describe('throwaway issuer keys are not the holder key', () => {
  it('exports different public keys', async () => {
    const other = await exportJWK((await generateKeyPair('ES256')).publicKey);
    expect(other.x).not.toBe(holder.publicJwk.x);
  });
});

describe('respond with a tamper', () => {
  // A by-value request to a local stand-in verifier that records what the wallet posts.
  const posted: URLSearchParams[] = [];
  let server: Server;
  let responseUri = '';
  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        posted.push(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    responseUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/post`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const request = (vct: string, nonce = 'fresh-nonce') =>
    `openid4vp://authorize?${new URLSearchParams({
      client_id: 'did:web:verify.test',
      response_mode: 'direct_post',
      response_uri: responseUri,
      nonce,
      state: 'st-1',
      presentation_definition: JSON.stringify({
        id: 'pd',
        input_descriptors: [
          {
            id: 'farmer',
            format: { 'vc+sd-jwt': {} },
            constraints: { fields: [{ path: ['$.vct'], filter: { type: 'string', const: vct } }] },
          },
        ],
      }),
    })}`;

  it('reports what T-CLAIM-EDIT changed', async () => {
    const raw = await issueSdJwt({ fullName: 'A' });
    const res = await respond(
      { authorizationRequestUri: request('FarmerCredentialSdJwt'), tamper: 'T-CLAIM-EDIT' },
      holder,
      [held('vc+sd-jwt', raw)],
    );
    expect(res.tamperEvidence).toMatchObject({
      target: 'credential',
      changes: [{ path: 'disclosure fullName', before: 'A', after: 'A (edited)' }],
    });
  });

  it('T-WRONG-TYPE presents a credential the request did not ask for', async () => {
    const raw = await issueSdJwt({ fullName: 'A' });
    const res = await respond(
      { authorizationRequestUri: request('PlaygroundWrongTypeCredential'), tamper: 'T-WRONG-TYPE' },
      holder,
      [held('vc+sd-jwt', raw)],
    );
    expect(res.status).toBe(200);
    expect(posted.at(-1)?.get('vp_token')).toContain(raw.split('~')[0]);
    expect(res.tamperEvidence?.changes[0]).toMatchObject({
      before: 'PlaygroundWrongTypeCredential (asked for)',
      after: 'FarmerCredentialSdJwt (presented)',
    });
  });

  it('T-NONCE-REPLAY resubmits the earlier vp_token unchanged', async () => {
    const old = 'h.p.s~d~kb';
    const res = await respond(
      {
        authorizationRequestUri: request('FarmerCredentialSdJwt'),
        tamper: 'T-NONCE-REPLAY',
        replay: { variant: 'resubmit-vp', vpToken: old, presentationSubmission: '{"id":"old"}' },
      },
      holder,
      [],
    );
    expect(posted.at(-1)?.get('vp_token')).toBe(old);
    expect(posted.at(-1)?.get('state')).toBe('st-1');
    expect(res.tamperEvidence?.target).toBe('vp_token');
  });

  it('T-NONCE-REPLAY with a stale nonce signs a fresh presentation over the old nonce', async () => {
    const raw = await issueSdJwt({ fullName: 'A' });
    await respond(
      {
        authorizationRequestUri: request('FarmerCredentialSdJwt', 'new-nonce'),
        tamper: 'T-NONCE-REPLAY',
        replay: { variant: 'stale-nonce', nonce: 'old-nonce' },
      },
      holder,
      [held('vc+sd-jwt', raw)],
    );
    expect(nonceOfVpToken(posted.at(-1)!.get('vp_token')!)).toBe('old-nonce');
  });

  it('refuses a replay without anything to replay', async () => {
    await expect(
      respond({ authorizationRequestUri: request('x'), tamper: 'T-NONCE-REPLAY' }, holder, []),
    ).rejects.toThrow(/needs an earlier vp_token/);
  });

  it('reads the requested type from an input descriptor', () => {
    expect(
      requestedType({
        id: 'd',
        constraints: { fields: [{ path: ['$.type'], filter: { pattern: 'FarmerCredential' } }] },
      }),
    ).toBe('FarmerCredential');
  });
});
