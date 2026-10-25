import { readFileSync } from 'node:fs';
import { base64url, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { didJwkToJwk, ed25519JwkToMultibase, ed25519MultibaseToJwk } from './did';
import { readPath, unmetFields } from './pe';
import { committedDigests, disclosedClaims, parseSdJwt, sha256b64url, verifySdJwt } from './sdjwt';

// A vc+sd-jwt issued by Inji Certify 0.14.0 in the playground stack (mock Farmer data only): x5c
// issuer key, holder bound by cnf.kid = did:jwk.
const CERTIFY_CREDENTIAL = readFileSync(new URL('./fixtures/certify-0.14.0-farmer.sd-jwt', import.meta.url), 'utf8').trim();

const disclosure = (name: string, value: unknown) =>
  base64url.encode(JSON.stringify([base64url.encode(crypto.getRandomValues(new Uint8Array(9))), name, value]));

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;
interface Keys {
  issuer: KeyPair;
  issuerJwk: JWK;
  holder: KeyPair;
  holderJwk: JWK;
}
let k: Keys;
beforeAll(async () => {
  const issuer = await generateKeyPair('ES256', { extractable: true });
  const holder = await generateKeyPair('ES256', { extractable: true });
  k = { issuer, issuerJwk: await exportJWK(issuer.publicKey), holder, holderJwk: await exportJWK(holder.publicKey) };
});

async function issue(opts: { typ?: string; exp?: number; claims?: Record<string, unknown>; cnf?: 'jwk' | 'did' } = {}) {
  const disclosures = Object.entries(opts.claims ?? { fullName: 'Ramesh Kumar', farmerID: 'F-1' }).map(([n, v]) => disclosure(n, v));
  const did = `did:jwk:${base64url.encode(JSON.stringify(k.holderJwk))}`;
  let jwt = new SignJWT({
    vct: 'FarmerCredentialSdJwt',
    _sd: await Promise.all(disclosures.map(sha256b64url)),
    _sd_alg: 'sha-256',
    cnf: opts.cnf === 'did' ? { kid: `${did}#0` } : { jwk: k.holderJwk },
  })
    .setProtectedHeader({ alg: 'ES256', typ: opts.typ ?? 'vc+sd-jwt', jwk: k.issuerJwk })
    .setIssuer('https://certify.test')
    .setIssuedAt();
  if (opts.exp) jwt = jwt.setExpirationTime(opts.exp);
  return `${await jwt.sign(k.issuer.privateKey)}~${disclosures.join('~')}~`;
}

async function present(credential: string, nonce: string, aud: string, overrides: { sdHash?: string; key?: CryptoKey } = {}) {
  const kb = await new SignJWT({ nonce, sd_hash: overrides.sdHash ?? (await sha256b64url(credential)) })
    .setProtectedHeader({ alg: 'ES256', typ: 'kb+jwt' })
    .setAudience(aud)
    .setIssuedAt()
    .sign(overrides.key ?? k.holder.privateKey);
  return `${credential}${kb}`;
}

const status = (results: Awaited<ReturnType<typeof verifySdJwt>>) =>
  Object.fromEntries(results.map((r) => [r.id, r.status]));

describe('verifySdJwt', () => {
  it('passes a valid presentation bound to the request', async () => {
    const vp = await present(await issue(), 'n-1', 'did:web:v.test');
    expect(status(await verifySdJwt(vp, { nonce: 'n-1', audience: 'did:web:v.test', trustedIssuers: ['https://certify.test'] }))).toEqual({
      format: 'pass',
      'issuer-signature': 'pass',
      'issuer-trust': 'pass',
      disclosures: 'pass',
      'holder-binding': 'pass',
      validity: 'pass',
    });
  });

  it('accepts dc+sd-jwt and a did:jwk holder in cnf.kid', async () => {
    const vp = await present(await issue({ typ: 'dc+sd-jwt', cnf: 'did' }), 'n', 'aud');
    const s = status(await verifySdJwt(vp, { nonce: 'n', audience: 'aud' }));
    expect(s.format).toBe('pass');
    expect(s['holder-binding']).toBe('pass');
  });

  it('fails a flipped issuer signature', async () => {
    const cred = await issue();
    const [jwt, ...rest] = cred.split('~');
    const [h, p, sig = ''] = jwt!.split('.');
    const flipped = `${h}.${p}.${sig[5] === 'A' ? `${sig.slice(0, 5)}B${sig.slice(6)}` : `${sig.slice(0, 5)}A${sig.slice(6)}`}`;
    const vp = await present([flipped, ...rest].join('~'), 'n', 'aud');
    expect(status(await verifySdJwt(vp, { nonce: 'n', audience: 'aud' }))['issuer-signature']).toBe('fail');
  });

  it('fails an edited disclosure', async () => {
    const cred = await issue();
    const parts = cred.split('~');
    parts[1] = disclosure('fullName', 'Someone else');
    const vp = await present(parts.join('~'), 'n', 'aud');
    const r = await verifySdJwt(vp, { nonce: 'n', audience: 'aud' });
    expect(r.find((s) => s.id === 'disclosures')).toMatchObject({ status: 'fail', message: expect.stringContaining('fullName') });
  });

  it('fails a wrong nonce or audience, a broken sd_hash, a missing or foreign key binding', async () => {
    const cred = await issue();
    const holderBinding = async (vp: string) => (await verifySdJwt(vp, { nonce: 'n', audience: 'aud' })).find((s) => s.id === 'holder-binding')!;
    expect((await holderBinding(await present(cred, 'old', 'aud'))).message).toContain('nonce is "old"');
    expect((await holderBinding(await present(cred, 'n', 'other'))).message).toContain('aud is "other"');
    expect((await holderBinding(await present(cred, 'n', 'aud', { sdHash: 'x' }))).message).toContain('sd_hash');
    expect((await holderBinding(cred)).message).toContain('No key-binding JWT');
    const stranger = await generateKeyPair('ES256');
    expect((await holderBinding(await present(cred, 'n', 'aud', { key: stranger.privateKey }))).status).toBe('fail');
  });

  it('reports an expired credential under validity only', async () => {
    const vp = await present(await issue({ exp: Math.floor(Date.now() / 1000) - 60 }), 'n', 'aud');
    const s = status(await verifySdJwt(vp, { nonce: 'n', audience: 'aud' }));
    expect(s.validity).toBe('fail');
    expect(s['issuer-signature']).toBe('pass');
  });

  it('warns when the issuer is not on the trust list', async () => {
    const r = await verifySdJwt(await issue(), { trustedIssuers: ['https://other.test'] });
    expect(r.find((s) => s.id === 'issuer-trust')?.status).toBe('warn');
    expect(r.find((s) => s.id === 'holder-binding')?.status).toBe('skip');
  });

  it('verifies a credential issued by Inji Certify 0.14.0 (x5c issuer key, did:jwk holder)', async () => {
    const r = await verifySdJwt(CERTIFY_CREDENTIAL);
    expect(r.find((s) => s.id === 'issuer-signature')).toMatchObject({ status: 'pass', message: expect.stringContaining('x5c certificate') });
    expect(r.find((s) => s.id === 'disclosures')?.status).toBe('pass');
    const sd = parseSdJwt(CERTIFY_CREDENTIAL);
    expect(disclosedClaims(sd).vct).toBe('FarmerCredentialSdJwt');
    expect(committedDigests(sd.payload).size).toBeGreaterThanOrEqual(sd.disclosures.length);
  });
});

describe('DID and PE helpers', () => {
  it('round-trips an Ed25519 key through multibase', async () => {
    const { publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const jwk = await exportJWK(publicKey);
    expect(ed25519MultibaseToJwk(ed25519JwkToMultibase(jwk))).toEqual({ kty: 'OKP', crv: 'Ed25519', x: jwk.x });
  });

  it('decodes a did:jwk, ignoring the fragment', () => {
    const did = `did:jwk:${base64url.encode(JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' }))}#0`;
    expect(didJwkToJwk(did)).toMatchObject({ kty: 'EC', x: 'a' });
  });

  it('reports the descriptor fields a credential does not meet', () => {
    expect(readPath({ a: { b: 1 } }, "$['a']['b']")).toBe(1);
    const d = { id: 'd', constraints: { fields: [{ path: ['$.vct'], filter: { type: 'string', pattern: 'Wanted' } }] } };
    expect(unmetFields({ vct: 'FarmerCredentialSdJwt' }, d)).toHaveLength(1);
    expect(unmetFields({ vct: 'Wanted' }, d)).toHaveLength(0);
  });
});
