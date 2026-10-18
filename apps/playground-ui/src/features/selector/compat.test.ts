import { describe, expect, it } from 'vitest';
import { mockCatalog } from '../../mocks/catalog';
import { buildRunConfig, commonFormats, disabledReason, supportedFlows } from './compat';

const get = (id: string) => mockCatalog.find((c) => c.id === id)!;

describe('selector rules', () => {
  it('loads every catalog YAML file', () => {
    expect(mockCatalog.map((c) => c.id).sort()).toEqual(['inji-certify', 'inji-verify', 'inji-wallet-mobile', 'inji-web', 'mock-wallet']);
  });

  it('intersects formats across the three roles, limited to the mandatory two', () => {
    expect(commonFormats([get('inji-certify'), get('inji-wallet-mobile'), get('inji-verify')])).toEqual(['ldp_vc', 'vc+sd-jwt']);
    expect(commonFormats([get('inji-certify'), undefined, undefined])).toEqual(['ldp_vc', 'vc+sd-jwt']);
  });

  it('disables cards that are offline or share no format', () => {
    const offline = { ...get('inji-verify'), health: 'down' as const };
    expect(disabledReason(offline, [])).toMatch(/not responding/);
    const mdocOnly = { ...get('inji-verify'), capabilities: { ...get('inji-verify').capabilities, formats: ['mso_mdoc' as const] } };
    expect(disabledReason(mdocOnly, [])).toMatch(/none of the formats/);
    const ldpOnly = { ...get('inji-verify'), capabilities: { ...get('inji-verify').capabilities, formats: ['ldp_vc' as const] } };
    const sdOnlyWallet = { ...get('mock-wallet'), capabilities: { ...get('mock-wallet').capabilities, formats: ['vc+sd-jwt' as const] } };
    expect(disabledReason(ldpOnly, [sdOnlyWallet])).toMatch(/Shares no credential format with Mock wallet/);
    expect(disabledReason(get('inji-verify'), [get('inji-certify')])).toBeUndefined();
  });

  it('offers only flows both wallet and verifier support', () => {
    expect(supportedFlows(get('mock-wallet'), get('inji-verify'))).toEqual(['cross-device-qr']);
    expect(supportedFlows(get('inji-wallet-mobile'), get('inji-verify'))).toEqual(['cross-device-qr', 'same-device-deeplink']);
  });

  it('builds a RunConfig only when the selection is complete', () => {
    const sel = { format: 'vc+sd-jwt' as const, credentialConfigurationId: 'X', presentationFlow: 'cross-device-qr' as const, expectedOutcome: 'VALID' as const };
    const cc = { id: 'X', format: 'vc+sd-jwt' as const, displayName: 'x', proofSuites: ['ES256' as const] };
    expect(buildRunConfig(sel, get('inji-certify'), undefined, get('inji-verify'), cc)).toBeNull();
    expect(buildRunConfig(sel, get('inji-certify'), get('inji-web'), get('inji-verify'), cc, 'expired')).toMatchObject({
      issuerId: 'inji-certify',
      walletId: 'inji-web',
      grantType: 'authorization_code',
      proofSuite: 'ES256',
      labels: { scenario: 'expired' },
    });
  });
});
