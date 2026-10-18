import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../mocks/fixtures';
import { humanizeClaim, summarizeCredential } from './credential';

describe('summarizeCredential', () => {
  it('reads an ldp_vc', async () => {
    const fx = await buildFixtures({ runId: 'r', format: 'ldp_vc', credentialConfigurationId: 'FarmerCredential', scenario: 'valid' });
    const s = summarizeCredential(fx.credentialRaw);
    expect(s).toMatchObject({ kind: 'ldp_vc', type: 'FarmerCredential', issuer: 'did:web:certify.playground.local', proofType: 'Ed25519Signature2020' });
    expect(s.claims.find((c) => c.name === 'fullName')?.value).toBe('Ramesh Kumar');
  });

  it('reads an expired SD-JWT VC', async () => {
    const fx = await buildFixtures({ runId: 'r', format: 'vc+sd-jwt', credentialConfigurationId: 'FarmerCredentialSdJwt', scenario: 'expired' });
    const s = summarizeCredential(fx.credentialRaw);
    expect(s.kind).toBe('sd-jwt');
    expect(s.proofType).toBe('ES256');
    expect(new Date(s.validUntil!).getTime()).toBeLessThan(Date.now());
  });

  it('humanizes claim names', () => {
    expect(humanizeClaim('farmerID')).toBe('Farmer ID');
    expect(humanizeClaim('primaryCropType')).toBe('Primary crop type');
    expect(humanizeClaim('date_of_birth')).toBe('Date of birth');
  });
});
