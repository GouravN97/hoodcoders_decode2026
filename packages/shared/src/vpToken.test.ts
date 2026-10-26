import { describe, expect, it } from 'vitest';
import { credentialFromVpToken } from './secondOpinion';
import { nonceOfVpToken } from './tamper';
import { dcqlQueryIds, firstPresentation } from './vpToken';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sdJwt = `${b64({ alg: 'ES256' })}.${b64({ vct: 'X' })}.sig~WyJzIiwibiIsInYiXQ~${b64({ alg: 'ES256' })}.${b64({ nonce: 'n-1' })}.kb`;

describe('DCQL vp_token', () => {
  it('unwraps the first presentation of an OpenID4VP 1.0 vp_token', () => {
    const dcql = JSON.stringify({ farmer: [sdJwt] });
    expect(dcqlQueryIds(dcql)).toEqual(['farmer']);
    expect(firstPresentation(dcql)).toBe(sdJwt);
    expect(nonceOfVpToken(dcql)).toBe('n-1');
    expect(credentialFromVpToken(dcql)).toBe(sdJwt.replace(/~[^~]*$/, '~'));
  });

  it('reads an ldp_vp inside a DCQL vp_token', () => {
    const vp = { type: ['VerifiablePresentation'], verifiableCredential: [{ id: 'vc-1' }], proof: { challenge: 'c-1' } };
    const dcql = JSON.stringify({ farmer: [vp] });
    expect(nonceOfVpToken(dcql)).toBe('c-1');
    expect(credentialFromVpToken(dcql)).toBe('{"id":"vc-1"}');
  });

  it('leaves draft 23 vp_tokens alone', () => {
    const vp = JSON.stringify({ type: ['VerifiablePresentation'], proof: { challenge: 'c' } });
    expect(dcqlQueryIds(vp)).toBeUndefined();
    expect(firstPresentation(vp)).toBe(vp);
    expect(firstPresentation(sdJwt)).toBe(sdJwt);
  });
});
