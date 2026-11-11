import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from './catalog';
import { predict } from './compatibility';
import type { RunConfig } from './domain';

const entry = (
  id: string,
  role: CatalogEntry['role'],
  capabilities: Partial<CatalogEntry['capabilities']> = {},
): CatalogEntry => ({
  id,
  role,
  displayName: id,
  vendor: 'mock',
  adapter: 'X',
  publicUrl: 'https://test',
  health: 'up',
  capabilities: {
    formats: ['vc+sd-jwt'],
    proofSuites: ['ES256'],
    deliveryChannels: ['api'],
    automation: 'headless',
    supportsTamper: false,
    ...capabilities,
  },
});

const catalog = [
  entry('certify', 'issuer', { expiredVariants: { Farmer: 'FarmerExpired' } }),
  entry('mock-wallet', 'wallet', { supportsTamper: true }),
  entry('phone', 'wallet', { automation: 'human-in-the-loop' }),
  entry('verify', 'verifier'),
];

const config: RunConfig = {
  mode: 'full',
  issuerId: 'certify',
  walletId: 'mock-wallet',
  verifierId: 'verify',
  format: 'vc+sd-jwt',
  credentialConfigurationId: 'Farmer',
  grantType: 'pre-authorized_code',
  presentationFlow: 'cross-device-qr',
  expectedOutcome: 'VALID',
};

const messages = (c: RunConfig, ctx = {}) => predict(c, catalog, ctx).reasons.map((r) => r.message);

describe('predict with a tamper', () => {
  it('supports a wallet-hook tamper on a wallet with hooks', () => {
    expect(predict({ ...config, tamper: { id: 'T-SIG-FLIP' }, expectedOutcome: 'INVALID' }, catalog).status).toBe(
      'supported',
    );
  });

  it('rejects a wallet-hook tamper on a phone wallet', () => {
    const p = predict({ ...config, walletId: 'phone', tamper: { id: 'T-CLAIM-EDIT' } }, catalog);
    expect(p.status).toBe('unsupported');
    expect(p.reasons.map((r) => r.message).join()).toContain('phone cannot apply T-CLAIM-EDIT');
  });

  it('names the expired copy T-EXPIRED issues, or says there is none', () => {
    expect(messages({ ...config, tamper: { id: 'T-EXPIRED' }, expectedOutcome: 'EXPIRED' })).toContain(
      'certify issues FarmerExpired, a copy signed with validity in the past',
    );
    expect(
      predict({ ...config, credentialConfigurationId: 'X', tamper: { id: 'T-EXPIRED' } }, catalog).status,
    ).toBe('unsupported');
  });

  it('does not warn about expiry when the expired credential itself is picked', () => {
    const m = messages({ ...config, credentialConfigurationId: 'FarmerExpired', expectedOutcome: 'EXPIRED' });
    expect(m.join()).not.toContain('Valid-but-expired needs');
  });

  it('needs an earlier run to replay', () => {
    const replay = { ...config, tamper: { id: 'T-NONCE-REPLAY' }, expectedOutcome: 'INVALID' as const };
    expect(predict(replay, catalog, { replayAvailable: false }).status).toBe('unsupported');
    expect(predict(replay, catalog, { replayAvailable: true }).status).toBe('supported');
  });

  it('only applies tampers to runs that present', () => {
    expect(predict({ ...config, mode: 'issue-only', tamper: { id: 'T-SIG-FLIP' } }, catalog).status).toBe(
      'unsupported',
    );
  });
});

describe('predict with a phone wallet and a party only this machine can reach', () => {
  const local = (e: CatalogEntry): CatalogEntry => ({ ...e, publicUrl: 'https://verify.localhost:8443/mock-verifier' });
  const phone = entry('paradym', 'wallet', { automation: 'human-in-the-loop', deliveryChannels: ['qr'] });
  const browser = entry('inji-web', 'wallet', { automation: 'human-in-the-loop', deliveryChannels: ['open-url'] });

  it('warns that a phone cannot reach a localhost verifier, and says how to fix it', () => {
    const p = predict({ ...config, walletId: 'paradym' }, [catalog[0]!, phone, local(catalog[3]!)]);
    expect(p.status).toBe('supported');
    expect(p.reasons).toContainEqual({
      role: 'verifier',
      severity: 'warn',
      message: 'paradym on a phone cannot reach verify at verify.localhost:8443; start the stack behind tunnels (make up-phone)',
    });
  });

  it('does not warn behind tunnels, for a wallet in this machine’s browser, or for a party the run does not use', () => {
    const atTunnel = predict({ ...config, walletId: 'paradym' }, [catalog[0]!, phone, catalog[3]!]);
    expect(atTunnel.reasons.some((r) => r.message.includes('cannot reach'))).toBe(false);
    const inBrowser = predict({ ...config, walletId: 'inji-web' }, [catalog[0]!, browser, local(catalog[3]!)]);
    expect(inBrowser.reasons.some((r) => r.message.includes('cannot reach'))).toBe(false);
    const issueOnly = predict({ ...config, walletId: 'paradym', mode: 'issue-only' }, [catalog[0]!, phone, local(catalog[3]!)]);
    expect(issueOnly.reasons.some((r) => r.message.includes('cannot reach'))).toBe(false);
  });
});
