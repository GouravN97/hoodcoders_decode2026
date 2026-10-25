import { base64url, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../../mocks/fixtures';
import { decodeBody, decodeUrlQuery } from './index';
import { matchDisclosures } from './sdjwt';

describe('decodeBody', () => {
  it('splits a JWT into header, payload and signature', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const jwt = await new SignJWT({ nonce: 'n-1' }).setProtectedHeader({ alg: 'ES256', typ: 'openid4vci-proof+jwt' }).sign(privateKey);
    const d = decodeBody(jwt);
    expect(d.kind).toBe('jwt');
    if (d.kind !== 'jwt') return;
    expect(d.jwt.header).toMatchObject({ alg: 'ES256', typ: 'openid4vci-proof+jwt' });
    expect(d.jwt.payload).toEqual({ nonce: 'n-1' });
    expect(d.jwt.signature).toBe(jwt.split('.')[2]);
  });

  it('decodes an SD-JWT VC and matches every disclosure digest', async () => {
    const fx = await buildFixtures({ runId: 'r1', format: 'vc+sd-jwt', credentialConfigurationId: 'FarmerCredentialSdJwt', scenario: 'valid' });
    const d = decodeBody(fx.credentialRaw);
    expect(d.kind).toBe('sd-jwt');
    if (d.kind !== 'sd-jwt') return;
    expect(d.issuerJwt.header.typ).toBe('vc+sd-jwt');
    expect(d.kbJwt).toBeUndefined();
    expect(d.disclosures.map((x) => x.name)).toContain('farmerID');
    const matches = await matchDisclosures(d.issuerJwt.payload, d.disclosures);
    expect(matches.every((m) => m.matched)).toBe(true);
  });

  it('flags a disclosure whose digest the issuer never signed', async () => {
    const fx = await buildFixtures({ runId: 'r1', format: 'vc+sd-jwt', credentialConfigurationId: 'FarmerCredentialSdJwt', scenario: 'valid' });
    const forged = base64url.encode(JSON.stringify(['salt', 'landArea', '900 acres']));
    const d = decodeBody(fx.credentialRaw.replace(/~$/, `~${forged}~`));
    if (d.kind !== 'sd-jwt') throw new Error('expected sd-jwt');
    const matches = await matchDisclosures(d.issuerJwt.payload, d.disclosures);
    expect(matches.find((m) => m.disclosure.encoded === forged)?.matched).toBe(false);
  });

  it('finds the key-binding JWT in a presented SD-JWT', async () => {
    const fx = await buildFixtures({ runId: 'r1', format: 'vc+sd-jwt', credentialConfigurationId: 'FarmerCredentialSdJwt', scenario: 'valid' });
    const d = decodeBody(fx.vpToken);
    if (d.kind !== 'sd-jwt') throw new Error('expected sd-jwt');
    expect(d.kbJwt?.header.typ).toBe('kb+jwt');
    expect(d.disclosures).toHaveLength(4);
  });

  it('decodes a credential offer URI and its nested offer URI', async () => {
    const fx = await buildFixtures({ runId: 'r1', format: 'ldp_vc', credentialConfigurationId: 'FarmerCredential', scenario: 'valid' });
    const d = decodeBody(fx.offerUri);
    expect(d.kind).toBe('uri');
    if (d.kind !== 'uri') return;
    expect(d.scheme).toBe('openid-credential-offer');
    expect(d.params.credential_offer_uri).toMatch(/credential-offer-data/);
  });

  it('decodes a direct_post form and the vp_token and submission inside it', async () => {
    const fx = await buildFixtures({ runId: 'r1', format: 'ldp_vc', credentialConfigurationId: 'FarmerCredential', scenario: 'valid' });
    const d = decodeBody(fx.vpSubmissionBody, 'application/x-www-form-urlencoded');
    expect(d.kind).toBe('form');
    if (d.kind !== 'form') return;
    expect(Object.keys(d.fields)).toEqual(['vp_token', 'presentation_submission', 'state']);
    const vp = d.embedded.find((e) => e.path === 'vp_token')?.decoded;
    expect(vp?.kind).toBe('json');
    expect(vp?.kind === 'json' && vp.isLdpVc).toBe(true);
  });

  it('recognises a JSON-LD VC and decodes JWTs embedded in JSON', async () => {
    const fx = await buildFixtures({ runId: 'r1', format: 'ldp_vc', credentialConfigurationId: 'FarmerCredential', scenario: 'valid' });
    const vc = decodeBody(fx.credentialRaw);
    expect(vc.kind === 'json' && vc.isLdpVc).toBe(true);
    const token = decodeBody(JSON.stringify(fx.tokenResponse));
    expect(token.kind === 'json' && token.embedded.map((e) => e.path)).toEqual(['access_token']);
  });

  it('decodes an mDoc credential response (padded base64url, as Certify sends it) and a DeviceResponse vp_token', async () => {
    const fx = await buildFixtures({ runId: crypto.randomUUID(), format: 'mso_mdoc', credentialConfigurationId: 'MockMDL', scenario: 'valid', verifierId: 'mock-verifier' });
    const padded = fx.credentialRaw + '='.repeat((4 - (fx.credentialRaw.length % 4)) % 4);
    const d = decodeBody(JSON.stringify({ credential: padded }));
    expect(d.kind === 'json' && d.embedded[0]?.decoded).toMatchObject({ kind: 'mdoc', container: 'credential', documents: [{ docType: 'org.iso.18013.5.1.mDL', shape: 'wrapped' }] });
    const form = decodeBody(fx.vpSubmissionBody, 'application/x-www-form-urlencoded');
    expect(form.kind === 'form' && form.embedded.find((e) => e.path === 'vp_token')?.decoded).toMatchObject({ kind: 'mdoc', container: 'DeviceResponse' });
    // Inji Wallet sends vp_token as a JSON-encoded string.
    const quoted = decodeBody(new URLSearchParams({ vp_token: JSON.stringify('eyJhbGciOiJFUzI1NiJ9.e30.c2ln~') }).toString(), 'application/x-www-form-urlencoded');
    expect(quoted.kind === 'form' && quoted.embedded.find((e) => e.path === 'vp_token')?.decoded.kind).toBe('sd-jwt');
    // A short opaque token is not mistaken for CBOR.
    expect(decodeBody('SFLo3Ai2sajuJudySCahMKItuzIPN7I0').kind).toBe('text');
  });

  it('handles empty, plain text and URL queries', () => {
    expect(decodeBody(undefined).kind).toBe('empty');
    expect(decodeBody('   ').kind).toBe('empty');
    expect(decodeBody('hello world').kind).toBe('text');
    expect(decodeUrlQuery('https://x.test/authorize?client_id=abc&state=1')?.fields).toEqual({ client_id: 'abc', state: '1' });
    expect(decodeUrlQuery('https://x.test/path')).toBeNull();
  });
});
