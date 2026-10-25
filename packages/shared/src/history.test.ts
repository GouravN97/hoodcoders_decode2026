import { describe, expect, it } from 'vitest';
import {
  buildMatrix,
  filterRuns,
  renderMatrixMarkdown,
  RunsQuerySchema,
  summarizeRun,
  type RunSummary,
} from './history';
import type { RunDetail } from './run';

const run = (over: Partial<RunDetail> & { id: string }): RunDetail => ({
  createdAt: '2026-10-25T10:00:00.000Z',
  finishedAt: '2026-10-25T10:00:30.000Z',
  trigger: 'ui',
  state: 'Reported',
  correlation: 'exact',
  steps: [],
  artifacts: [{ id: 'a', kind: 'vp_token', raw: 't' }],
  verdict: 'PASS',
  observedOutcome: 'VALID',
  versions: [
    { implementationId: 'inji-certify', role: 'issuer', version: '0.14.0', displayName: 'Inji Certify' },
    { implementationId: 'mock-wallet', role: 'wallet', version: '0.1.0', displayName: 'Mock wallet' },
    { implementationId: 'inji-verify', role: 'verifier', version: '0.18.2', displayName: 'Inji Verify' },
  ],
  config: {
    mode: 'full',
    issuerId: 'inji-certify',
    walletId: 'mock-wallet',
    verifierId: 'inji-verify',
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'FarmerCredentialSdJwt',
    grantType: 'pre-authorized_code',
    presentationFlow: 'cross-device-qr',
    expectedOutcome: 'VALID',
  },
  ...over,
});

const withVerify = (r: RunDetail, version: string): RunDetail => ({
  ...r,
  versions: r.versions.map((v) => (v.role === 'verifier' ? { ...v, version } : v)),
});

describe('summarizeRun', () => {
  it('keeps the versions and names snapshotted at creation', () => {
    const s = summarizeRun(run({ id: 'r1' }));
    expect(s.verifier).toEqual({ id: 'inji-verify', name: 'Inji Verify', version: '0.18.2' });
    expect(s.replayable).toBe(true);
  });

  it('reads runs saved before roles and names were recorded', () => {
    const old = run({ id: 'old', versions: [{ implementationId: 'inji-verify', version: '0.18.1' }] });
    expect(summarizeRun(old).verifier).toEqual({ id: 'inji-verify', name: 'inji-verify', version: '0.18.1' });
    expect(summarizeRun(old, [{ id: 'inji-verify', displayName: 'Inji Verify' }]).verifier.name).toBe('Inji Verify');
    expect(summarizeRun(old).issuer.version).toBe('unknown');
  });
});

describe('filterRuns', () => {
  const runs: RunSummary[] = [
    summarizeRun(run({ id: 'sd', createdAt: '2026-10-25T10:00:00.000Z' })),
    summarizeRun(
      run({
        id: 'ld-old-verify',
        createdAt: '2026-10-20T09:00:00.000Z',
        config: { ...run({ id: 'x' }).config, format: 'ldp_vc' },
        versions: withVerify(run({ id: 'x' }), '0.18.1').versions,
      }),
    ),
    summarizeRun(
      run({
        id: 'tampered',
        verdict: 'FAIL',
        tamper: { id: 'T-WRONG-TYPE', label: 'Wrong credential type', mechanism: 'wallet-hook', expectedOutcome: 'INVALID' },
      }),
    ),
  ];
  const ids = (q: Record<string, string>) => filterRuns(runs, RunsQuerySchema.parse(q)).map((r) => r.id);

  it('filters by module version, format, verdict and outcome', () => {
    expect(ids({ verifierVersion: '0.18.1' })).toEqual(['ld-old-verify']);
    expect(ids({ format: 'ldp_vc' })).toEqual(['ld-old-verify']);
    expect(ids({ verdict: 'FAIL' })).toEqual(['tampered']);
    expect(ids({ outcome: 'VALID' })).toHaveLength(3);
  });

  it('filters by tamper: none, any or one id', () => {
    expect(ids({ tamper: 'none' })).toEqual(['sd', 'ld-old-verify']);
    expect(ids({ tamper: 'any' })).toEqual(['tampered']);
    expect(ids({ tamper: 'T-WRONG-TYPE' })).toEqual(['tampered']);
  });

  it('filters by date with an inclusive end day', () => {
    expect(ids({ from: '2026-10-21' })).toEqual(['sd', 'tampered']);
    expect(ids({ to: '2026-10-20' })).toEqual(['ld-old-verify']);
  });

  it('rejects an unknown format and caps the result', () => {
    expect(RunsQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false);
    expect(ids({ limit: '1' })).toEqual(['sd']);
  });
});

describe('buildMatrix', () => {
  const sd = run({ id: 'sd-1', createdAt: '2026-10-25T10:00:00.000Z' });
  const runs = [
    summarizeRun({ ...sd, id: 'sd-2', createdAt: '2026-10-25T11:00:00.000Z', verdict: 'FAIL', observedOutcome: 'INVALID' }),
    summarizeRun(sd),
    summarizeRun(withVerify({ ...sd, id: 'sd-new-verify' }, '1.0.0')),
    summarizeRun(
      run({ id: 'tamper', tamper: { id: 'T-SIG-FLIP', label: 'Broken signature', mechanism: 'wallet-hook', expectedOutcome: 'INVALID' } }),
    ),
    summarizeRun(run({ id: 'issue-only', config: { ...sd.config, mode: 'issue-only' }, observedOutcome: undefined })),
    summarizeRun(run({ id: 'running', finishedAt: undefined, verdict: undefined, state: 'Presenting' })),
  ];

  it('keeps the latest run per combination and counts passes', () => {
    const m = buildMatrix(runs, { now: new Date('2026-10-25T12:00:00Z') });
    const row = m.rows.find((r) => r.verifier?.version === '0.18.2')!;
    expect(row.cells['vc+sd-jwt']).toMatchObject({ runs: 2, passed: 1, latest: { id: 'sd-2' } });
  });

  it('starts a new row when a module version changes', () => {
    const m = buildMatrix(runs);
    expect(m.rows.map((r) => r.verifier?.version ?? 'issue-only').sort()).toEqual(['0.18.2', '1.0.0', 'issue-only']);
  });

  it('leaves out negative tests unless asked, and unfinished runs always', () => {
    const expired = summarizeRun(run({ id: 'expired', config: { ...sd.config, expectedOutcome: 'EXPIRED' }, observedOutcome: 'EXPIRED' }));
    expect(buildMatrix([...runs, expired]).runCount).toBe(4);
    expect(buildMatrix([...runs, expired], { includeNegative: true }).runCount).toBe(6);
  });

  it('renders Markdown with versions, a cell per format and run links', () => {
    const text = renderMatrixMarkdown(buildMatrix(runs, { now: new Date('2026-10-25T12:00:00Z') }), (id) => `http://ui/runs/${id}`);
    expect(text).toContain('| Issuer | Wallet | Verifier | SD-JWT VC (`vc+sd-jwt`) |');
    expect(text).toContain('| Inji Certify 0.14.0 | Mock wallet 0.1.0 | Inji Verify 0.18.2 | [❌ Fail (Invalid) · 1/2 passed](http://ui/runs/sd-2) |');
    expect(text).toContain('| Inji Certify 0.14.0 | Mock wallet 0.1.0 | — (issue only) | [✅ Pass (issued)](http://ui/runs/issue-only) |');
    expect(text).toContain('negative tests (tampers, expected Invalid or Expired) are left out');
    const failedIssue = renderMatrixMarkdown(
      buildMatrix([summarizeRun(run({ id: 'f', config: { ...sd.config, mode: 'issue-only' }, verdict: 'FAIL', observedOutcome: undefined }))]),
    );
    expect(failedIssue).toContain('❌ Fail (not issued)');
  });

  it('says so when there is nothing to show', () => {
    expect(renderMatrixMarkdown(buildMatrix([]))).toContain('No finished runs yet.');
  });
});
