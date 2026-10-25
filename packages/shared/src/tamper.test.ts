import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from './catalog';
import { renderReportMarkdown, reportTamper, tamperLine, type RunReport } from './report';
import {
  applicableTampers,
  canReplayFrom,
  describeTamper,
  expiredVariantFor,
  nonceOfVpToken,
  ReplayParamsSchema,
  tamperDiffText,
  TAMPER_CATALOGUE,
} from './tamper';

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const disclosure = (name: string, value: string) => b64(JSON.stringify(['salt', name, value]));

const entry = (capabilities: Partial<CatalogEntry['capabilities']>) =>
  ({
    capabilities: {
      formats: [],
      proofSuites: [],
      deliveryChannels: [],
      automation: 'headless',
      supportsTamper: false,
      ...capabilities,
    },
  }) as Pick<CatalogEntry, 'capabilities'>;

const certify = entry({
  expiredVariants: { FarmerCredentialSdJwt: 'FarmerCredentialSdJwtExpired' },
});

describe('tamper catalogue', () => {
  it('covers the plan §13 tampers the playground implements, each with an expected outcome', () => {
    expect(TAMPER_CATALOGUE.map((t) => t.id)).toEqual([
      'T-SIG-FLIP',
      'T-CLAIM-EDIT',
      'T-WRONG-TYPE',
      'T-NONCE-REPLAY',
      'T-EXPIRED',
    ]);
    expect(TAMPER_CATALOGUE.find((t) => t.id === 'T-EXPIRED')?.expectedOutcome).toBe('EXPIRED');
  });

  it('offers nothing to a wallet that cannot tamper', () => {
    const tampers = applicableTampers({
      format: 'vc+sd-jwt',
      wallet: entry({ supportsTamper: false }),
      issuer: certify,
      credentialConfigurationId: 'FarmerCredentialSdJwt',
    });
    expect(tampers).toEqual([]);
  });

  it('offers T-EXPIRED only when the issuer has an expired copy of the credential', () => {
    const wallet = entry({ supportsTamper: true });
    const ids = (configId: string) =>
      applicableTampers({ format: 'vc+sd-jwt', wallet, issuer: certify, credentialConfigurationId: configId }).map(
        (t) => t.id,
      );
    expect(ids('FarmerCredentialSdJwt')).toContain('T-EXPIRED');
    expect(ids('SomethingElse')).not.toContain('T-EXPIRED');
    expect(ids('SomethingElse')).toContain('T-SIG-FLIP');
  });

  it('maps a configuration to its expired copy, and an expired copy to itself', () => {
    expect(expiredVariantFor(certify, 'FarmerCredentialSdJwt')).toBe('FarmerCredentialSdJwtExpired');
    expect(expiredVariantFor(certify, 'FarmerCredentialSdJwtExpired')).toBe('FarmerCredentialSdJwtExpired');
    expect(expiredVariantFor(certify, 'Other')).toBeUndefined();
  });

  it('defaults a replay to resubmitting the earlier vp_token', () => {
    expect(ReplayParamsSchema.parse({})).toEqual({ variant: 'resubmit-vp' });
  });
});

describe('describeTamper', () => {
  it('names the changed SD-JWT disclosure by claim', () => {
    const before = `h.p.s~${disclosure('fullName', 'Ramesh Kumar')}~${disclosure('farmerID', 'F-1')}~`;
    const after = `h.p.s~${disclosure('fullName', 'Ramesh Kumar (edited)')}~${disclosure('farmerID', 'F-1')}~`;
    expect(describeTamper(before, after, 'vc+sd-jwt')).toEqual([
      { path: 'disclosure fullName', before: 'Ramesh Kumar', after: 'Ramesh Kumar (edited)' },
    ]);
  });

  it('reports a changed issuer signature', () => {
    const changes = describeTamper('h.p.sigA~', 'h.p.sigB~', 'dc+sd-jwt');
    expect(changes).toEqual([{ path: 'issuer JWT signature', before: 'sigA', after: 'sigB' }]);
  });

  it('reports JSON-LD changes by path', () => {
    const before = JSON.stringify({ credentialSubject: { fullName: 'A', id: 'x' }, proof: { proofValue: 'z1' } });
    const after = JSON.stringify({ credentialSubject: { fullName: 'B', id: 'x' }, proof: { proofValue: 'z1' } });
    expect(describeTamper(before, after, 'ldp_vc')).toEqual([
      { path: 'credentialSubject.fullName', before: '"A"', after: '"B"' },
    ]);
  });

  it('renders a readable diff text', () => {
    expect(
      tamperDiffText({ summary: 'Edited one claim', changes: [{ path: 'a', before: '1', after: '2' }] }),
    ).toBe('Edited one claim\na: 1 → 2');
  });
});

describe('tamper in the report', () => {
  const applied = {
    id: 'T-SIG-FLIP',
    label: 'Broken signature',
    mechanism: 'wallet-hook' as const,
    expectedOutcome: 'INVALID' as const,
  };

  it('says whether the verifier caught the tamper', () => {
    expect(reportTamper({ tamper: applied, observedOutcome: 'INVALID' })?.detected).toBe(true);
    expect(reportTamper({ tamper: applied, observedOutcome: 'VALID' })?.detected).toBe(false);
    expect(reportTamper({ tamper: applied })?.detected).toBeNull();
    expect(reportTamper({ observedOutcome: 'VALID' })).toBeUndefined();
  });

  it('writes a Tamper row naming the verifier', () => {
    const caught = tamperLine({ ...applied, observedOutcome: 'INVALID', detected: true }, 'Inji Verify');
    expect(caught).toContain('Inji Verify rejected it as expected (Invalid)');
    const missed = tamperLine({ ...applied, observedOutcome: 'VALID', detected: false }, 'Inji Verify');
    expect(missed).toContain('**not detected**');

    const report = {
      runId: 'r',
      createdAt: '2026-10-25T10:00:00Z',
      mode: 'full',
      issuer: { role: 'issuer', id: 'inji-certify', displayName: 'Inji Certify' },
      wallet: { role: 'wallet', id: 'mock-wallet', displayName: 'Mock wallet' },
      verifier: { role: 'verifier', id: 'inji-verify', displayName: 'Inji Verify' },
      format: 'vc+sd-jwt',
      credentialConfigurationId: 'FarmerCredentialSdJwt',
      grantType: 'pre-authorized_code',
      presentationFlow: 'cross-device-qr',
      expectedOutcome: 'INVALID',
      observedOutcome: 'INVALID',
      verdict: 'PASS',
      passed: true,
      steps: [],
      correlation: 'exact',
      findings: [],
      tamper: { ...applied, observedOutcome: 'INVALID', detected: true },
      inspectorUrl: 'http://localhost/runs/r',
    } satisfies RunReport;
    expect(renderReportMarkdown(report)).toContain('| Tamper | T-SIG-FLIP broken signature (wallet-hook): Inji Verify rejected it as expected (Invalid) |');
  });
});

describe('nonceOfVpToken', () => {
  it('reads the key-binding JWT nonce of an SD-JWT presentation', () => {
    const kb = `${b64('{"alg":"ES256"}')}.${b64('{"nonce":"n-1"}')}.sig`;
    expect(nonceOfVpToken(`h.p.s~${disclosure('a', 'b')}~${kb}`)).toBe('n-1');
  });
  it('reads the proof challenge of a JSON-LD presentation', () => {
    expect(nonceOfVpToken(JSON.stringify({ proof: { challenge: 'n-2' } }))).toBe('n-2');
  });
  it('returns undefined without key binding', () => {
    expect(nonceOfVpToken('h.p.s~')).toBeUndefined();
  });
});

describe('canReplayFrom', () => {
  const run = {
    finishedAt: '2026-10-25T10:00:00Z',
    config: { verifierId: 'inji-verify', format: 'vc+sd-jwt' },
    artifacts: [{ id: 'a', kind: 'vp_token', raw: 't' }],
    observedOutcome: 'VALID',
  } as unknown as Parameters<typeof canReplayFrom>[0];
  const target = { verifierId: 'inji-verify', format: 'vc+sd-jwt' } as const;

  it('replays an untampered presentation the verifier accepted', () => {
    expect(canReplayFrom(run, target)).toBe(true);
  });
  it('skips tampered, rejected or other-verifier runs', () => {
    expect(
      canReplayFrom({ ...run, tamper: { id: 'T-SIG-FLIP', label: 'x', mechanism: 'wallet-hook', expectedOutcome: 'INVALID' } }, target),
    ).toBe(false);
    expect(canReplayFrom({ ...run, observedOutcome: 'INVALID' }, target)).toBe(false);
    expect(canReplayFrom(run, { ...target, verifierId: 'other' })).toBe(false);
  });
});
