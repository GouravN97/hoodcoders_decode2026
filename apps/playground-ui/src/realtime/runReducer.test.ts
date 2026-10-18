import { RUN_STEP_TEMPLATE, type RunConfig, type RunDetail, type RunEvent } from '@playground/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { mockCatalog } from '../mocks/catalog';
import { db } from '../mocks/db';
import { startSimulation } from '../mocks/simulator';
import { simulatedEvents } from './index';
import { applyRunEvent } from './runReducer';

const baseConfig: RunConfig = {
  mode: 'full',
  issuerId: 'inji-certify',
  walletId: 'mock-wallet',
  verifierId: 'inji-verify',
  format: 'ldp_vc',
  credentialConfigurationId: 'FarmerCredential',
  grantType: 'pre-authorized_code',
  presentationFlow: 'cross-device-qr',
  expectedOutcome: 'VALID',
};

function newRun(config: RunConfig): RunDetail {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    trigger: 'ui',
    config,
    state: 'Configured',
    correlation: 'exact',
    steps: RUN_STEP_TEMPLATE.map((t) => ({ phase: t.phase, step: t.step, status: 'pending' as const })),
    versions: [],
    artifacts: [],
  };
}

/** Plays a scenario on the simulator and folds its events from the initial run record. */
async function play(config: RunConfig) {
  const initial = newRun(config);
  const record = db.create(structuredClone(initial));
  const events: RunEvent[] = [];
  const off = simulatedEvents.subscribe(initial.id, (e) => events.push(e));
  await startSimulation(record, mockCatalog.find((c) => c.id === config.walletId)!);
  off();
  return { folded: events.reduce(applyRunEvent, initial), server: record, events };
}

beforeAll(() => sessionStorage.setItem('playground.simSpeed', '1000'));

describe('applyRunEvent over simulated runs', () => {
  it.each([
    ['valid ldp_vc', baseConfig, 'VALID', 'PASS'],
    ['valid SD-JWT', { ...baseConfig, format: 'vc+sd-jwt', credentialConfigurationId: 'FarmerCredentialSdJwt' }, 'VALID', 'PASS'],
    ['expected invalid', { ...baseConfig, expectedOutcome: 'INVALID' }, 'INVALID', 'PASS'],
    ['expected expired', { ...baseConfig, expectedOutcome: 'EXPIRED' }, 'EXPIRED', 'PASS'],
    ['expired but expected valid', { ...baseConfig, labels: { scenario: 'expired' } }, 'EXPIRED', 'FAIL'],
  ] as const)('%s', async (_name, config, outcome, verdict) => {
    const { folded, server, events } = await play(config as RunConfig);
    expect(folded.state).toBe('Reported');
    expect(folded.observedOutcome).toBe(outcome);
    expect(folded.verdict).toBe(verdict);
    expect(folded.steps).toEqual(server.run.steps);
    expect(folded.artifacts.map((a) => a.kind)).toEqual(server.run.artifacts.map((a) => a.kind));
    // The five messages Task 5 names all appear.
    const kinds = new Set(server.exchanges.flatMap((e) => e.artifactKinds ?? []));
    for (const k of ['offer', 'auth_request', 'presentation_definition', 'vp_token', 'verification_result']) {
      expect(kinds).toContain(k);
    }
    expect(events.filter((e) => e.type === 'run.exchange')).toHaveLength(server.exchanges.length);
  });

  it('fails the token step with the upstream error', async () => {
    const { folded } = await play({ ...baseConfig, labels: { scenario: 'fail-at-token' } });
    const token = folded.steps.find((s) => s.step === 'oid4vci.token');
    expect(token?.status).toBe('failed');
    expect(token?.error).toMatchObject({ status: 400 });
    expect(token?.error?.body).toContain('invalid_grant');
    expect(folded.steps.filter((s) => s.phase === 'verifying').every((s) => s.status === 'skipped')).toBe(true);
    expect(folded.verdict).toBe('FAIL');
  });

  it('marks an unanswered presentation request inconclusive', async () => {
    const { folded } = await play({ ...baseConfig, labels: { scenario: 'timeout' } });
    expect(folded.steps.find((s) => s.step === 'request_delivered')?.status).toBe('inconclusive');
    expect(folded.verdict).toBe('INCONCLUSIVE');
  });

  it('ignores events for other runs', () => {
    const run = newRun(baseConfig);
    expect(applyRunEvent(run, { type: 'run.status', runId: 'other', state: 'Issuing', at: '' })).toBe(run);
  });
});
