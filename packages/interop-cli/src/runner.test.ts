import type { CatalogEntry, RunConfig, RunDetail, RunReport } from '@playground/shared';
import { describe, expect, it } from 'vitest';
import type { BffClient } from './client.ts';
import { expandMatrix, loadMatrix } from './matrix.ts';
import { renderJunit, renderMarkdown, suitePassed } from './render.ts';
import { pickConfiguration, runMatrix } from './runner.ts';

const entry = (id: string, role: CatalogEntry['role'], extra: Partial<CatalogEntry['capabilities']> = {}): CatalogEntry =>
  ({
    id,
    role,
    displayName: id,
    vendor: 'mock',
    adapter: 'X',
    publicUrl: 'http://x',
    health: 'up',
    version: '1.0',
    capabilities: { automation: 'headless', ...extra },
  }) as unknown as CatalogEntry;

const CATALOG = [
  entry('certify', 'issuer', { expiredVariants: { Sd: 'SdExpired' } }),
  entry('mock-wallet', 'wallet'),
  entry('phone', 'wallet', { automation: 'human-in-the-loop' }),
  entry('verify', 'verifier'),
  { ...entry('mdoc', 'issuer'), health: 'down' } as CatalogEntry,
];

/** A BFF whose runs end with the outcome `outcomeFor` picks; records what it was asked. */
function fakeBff(outcomeFor: (c: RunConfig) => RunReport['observedOutcome']) {
  const created: Array<{ config: RunConfig; trigger: string }> = [];
  const bff = {
    catalog: async () => CATALOG,
    credentialConfigurations: async () => [
      { id: 'SdExpired', format: 'vc+sd-jwt', displayName: '', proofSuites: [] },
      { id: 'Sd', format: 'vc+sd-jwt', displayName: '', proofSuites: [] },
    ],
    createRun: async (config: RunConfig, trigger: string) => {
      created.push({ config, trigger });
      return `run-${created.length}`;
    },
    run: async (id: string) => ({ id, state: 'Reported' }) as RunDetail,
    report: async (id: string): Promise<RunReport> => {
      const { config } = created[Number(id.split('-')[1]) - 1]!;
      const observed = outcomeFor(config);
      const p = (role: 'issuer' | 'wallet' | 'verifier', pid: string) => ({ role, id: pid, displayName: pid, version: '1.0' });
      return {
        runId: id,
        createdAt: '2026-10-26T00:00:00Z',
        mode: config.mode,
        issuer: p('issuer', config.issuerId),
        wallet: p('wallet', config.walletId),
        verifier: p('verifier', config.verifierId),
        format: config.format,
        credentialConfigurationId: config.credentialConfigurationId,
        proofType: 'ES256',
        grantType: config.grantType,
        presentationFlow: config.presentationFlow,
        expectedOutcome: config.expectedOutcome,
        observedOutcome: observed,
        verdict: observed === config.expectedOutcome ? 'PASS' : 'FAIL',
        passed: observed === config.expectedOutcome,
        steps: [],
        correlation: 'exact',
        findings: [],
        inspectorUrl: `http://ui/runs/${id}`,
      };
    },
    cancel: async () => undefined,
  };
  return { bff: bff as unknown as BffClient, created };
}

const lanes = expandMatrix(
  loadMatrix(`
name: t
include:
  - { issuer: certify, wallet: mock-wallet, verifier: verify, format: vc+sd-jwt }
  - { issuer: certify, wallet: mock-wallet, verifier: verify, format: vc+sd-jwt, tamper: { id: T-WRONG-TYPE }, expectedOutcome: INVALID, knownGap: "gap 1" }
  - { issuer: certify, wallet: mock-wallet, verifier: verify, format: vc+sd-jwt, tamper: { id: T-SIG-FLIP }, expectedOutcome: INVALID }
  - { issuer: certify, wallet: phone, verifier: verify, format: vc+sd-jwt }
  - { issuer: mdoc, wallet: mock-wallet, verifier: verify, format: mso_mdoc }
  - { issuer: certify, wallet: mock-wallet, verifier: verify, format: ldp_vc }
`),
);

describe('runMatrix', () => {
  it('runs lanes in order and classifies pass, fail, known gap and skips', async () => {
    // The verifier misses the wrong type (the known gap) and the broken signature (a new failure).
    const { bff, created } = fakeBff(() => 'VALID');
    const results = await runMatrix(bff, lanes, { trigger: 'nightly', headlessOnly: true, laneTimeoutMs: 1000, pollMs: 1 });

    expect(results.map((r) => [r.status, r.reason])).toEqual([
      ['pass', undefined],
      ['known-gap', undefined],
      ['fail', undefined],
      ['skipped', 'phone needs a person (--headless-only)'],
      ['skipped', 'mdoc is down'],
      ['skipped', 'certify has no ldp_vc credential configuration'],
    ]);
    // The expired copy is never picked for a normal lane; every run is tagged with the trigger.
    expect(created.map((c) => [c.config.credentialConfigurationId, c.trigger])).toEqual([
      ['Sd', 'nightly'],
      ['Sd', 'nightly'],
      ['Sd', 'nightly'],
    ]);
    expect(suitePassed(results)).toBe(false);

    const meta = { matrix: 't', bff: 'http://bff', startedAt: 'S', finishedAt: 'F' };
    const md = renderMarkdown(results, meta);
    expect(md).toContain('**Failed** — 6 lanes: 1 pass · 1 fail · 1 known gap · 3 skipped.');
    expect(md).toContain('| certify 1.0 | mock-wallet 1.0 | verify 1.0 | SD-JWT VC | ES256 | T-SIG-FLIP |');
    expect(md).toContain('## Failures');
    expect(md).toContain('observed Valid, expected Invalid');

    const junit = renderJunit(results, meta);
    expect(junit).toContain('tests="6" failures="1" errors="0" skipped="4"');
    expect(junit).toContain('<skipped message="known gap: gap 1">');
  });

  it('flags a known-gap lane that passes, without failing the suite', async () => {
    const { bff } = fakeBff((c) => (c.tamper ? 'INVALID' : 'VALID'));
    const results = await runMatrix(bff, lanes.slice(0, 3), { trigger: 'cli', headlessOnly: false, laneTimeoutMs: 1000, pollMs: 1 });
    expect(results.map((r) => r.status)).toEqual(['pass', 'gap-fixed', 'pass']);
    expect(suitePassed(results)).toBe(true);
  });

  it('reports a run that never finishes as an error and cancels it', async () => {
    const { bff } = fakeBff(() => 'VALID');
    let cancelled = '';
    Object.assign(bff, {
      run: async (id: string) => ({ id, state: 'Verifying' }),
      cancel: async (id: string) => void (cancelled = id),
    });
    const [r] = await runMatrix(bff, lanes.slice(0, 1), { trigger: 'cli', headlessOnly: false, laneTimeoutMs: 20, pollMs: 5 });
    expect(r).toMatchObject({ status: 'error', runId: 'run-1' });
    expect(r!.reason).toMatch(/no result after/);
    expect(cancelled).toBe('run-1');
  });
});

describe('pickConfiguration', () => {
  it('picks the first configuration of the format that is not an expired copy', () => {
    const configs = [
      { id: 'SdExpired', format: 'vc+sd-jwt' as const, displayName: '', proofSuites: [] },
      { id: 'Ld', format: 'ldp_vc' as const, displayName: '', proofSuites: [] },
    ];
    expect(pickConfiguration(configs, CATALOG[0], 'ldp_vc')).toBe('Ld');
    expect(pickConfiguration(configs, CATALOG[0], 'vc+sd-jwt')).toBeUndefined();
  });
});
