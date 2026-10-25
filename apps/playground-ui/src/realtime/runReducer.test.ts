import {
  planTamper,
  stepTemplateFor,
  type RunConfig,
  type RunDetail,
  type RunEvent,
} from '@playground/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { mockCatalog } from '../mocks/catalog';
import { db } from '../mocks/db';
import { confirmManualEvidence, startSimulation } from '../mocks/simulator';
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
    steps: stepTemplateFor(config.mode).map((t) => ({ phase: t.phase, step: t.step, status: 'pending' as const })),
    versions: [],
    artifacts: [],
  };
}

/** Plays a scenario on the simulator and folds its events from the initial run record. */
async function play(requested: RunConfig) {
  // Plans the tamper the way the mock POST /runs handler does.
  const planned = planTamper(requested, mockCatalog, db.list());
  const initial = { ...newRun(planned.config), ...(planned.tamper ? { tamper: planned.tamper.applied } : {}) };
  const record = db.create(structuredClone(initial));
  if (planned.tamper) record.tamperPlan = planned.tamper;
  const events: RunEvent[] = [];
  const off = simulatedEvents.subscribe(initial.id, (e) => events.push(e));
  await startSimulation(record, mockCatalog.find((c) => c.id === requested.walletId)!);
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

  it('tampers with the presented copy and shows the change on the vp_token message', async () => {
    const { folded, server } = await play({
      ...baseConfig,
      format: 'vc+sd-jwt',
      credentialConfigurationId: 'FarmerCredentialSdJwt',
      tamper: { id: 'T-CLAIM-EDIT' },
      expectedOutcome: 'INVALID',
    });
    expect(folded.observedOutcome).toBe('INVALID');
    expect(folded.verdict).toBe('PASS');
    const posted = server.exchanges.find((e) => e.step === 'oid4vp.response')!;
    expect(posted.tampered).toMatchObject({ ruleId: 'T-CLAIM-EDIT', target: 'credential' });
    expect(posted.tampered?.diff).toContain('disclosure fullName: Ramesh Kumar → Ramesh Kumar (edited)');
    // The issued credential itself is untouched; only the presented copy changed.
    const issued = server.run.artifacts.find((a) => a.kind === 'credential')!.raw;
    expect(posted.tampered?.before).toBe(issued);
    expect(server.run.tamper).toMatchObject({ id: 'T-CLAIM-EDIT', exchangeId: posted.id });
    expect(server.findings.find((f) => f.checkId === 'TAMPER-001')?.severity).toBe('PASS');
  });

  it('replays the vp_token of an earlier run', async () => {
    const earlier = await play(baseConfig);
    const { server } = await play({ ...baseConfig, tamper: { id: 'T-NONCE-REPLAY' }, expectedOutcome: 'INVALID' });
    expect(server.run.tamper?.sourceRunId).toBe(earlier.server.run.id);
    const replayed = server.run.artifacts.find((a) => a.kind === 'vp_token')!.raw;
    expect(replayed).toBe(earlier.server.run.artifacts.find((a) => a.kind === 'vp_token')!.raw);
  });

  it('issues the expired copy for T-EXPIRED', async () => {
    const { folded, server } = await play({ ...baseConfig, tamper: { id: 'T-EXPIRED' }, expectedOutcome: 'EXPIRED' });
    expect(server.run.config.credentialConfigurationId).toBe('FarmerCredentialExpired');
    expect(folded.observedOutcome).toBe('EXPIRED');
    expect(folded.verdict).toBe('PASS');
  });

  it('never fakes captured traffic for an external issuer', async () => {
    const config: RunConfig = {
      ...baseConfig,
      mode: 'issue-only',
      issuerId: 'hovi-playground',
      walletId: 'inji-wallet-mobile',
      format: 'dc+sd-jwt',
      credentialConfigurationId: 'pid-sdjwt',
    };
    const playing = play(config);
    // The holder confirms on the run page once the wallet shows the credential.
    let confirmed = false;
    for (let i = 0; i < 200 && !confirmed; i++) {
      await new Promise((r) => setTimeout(r, 5));
      const waiting = db.all().find((r) => r.run.config.issuerId === 'hovi-playground' && r.manualWaiters.has('credential_held'));
      if (waiting) confirmed = confirmManualEvidence(waiting.run.id, 'credential_held');
    }
    const { folded, server } = await playing;
    expect(confirmed).toBe(true);
    expect(server.exchanges.map((e) => `${e.method} ${e.step}`)).toEqual(['OOB oid4vci.credential_offer']);
    for (const step of ['oid4vci.token', 'oid4vci.credential', 'credential_held']) {
      expect(folded.steps.find((s) => s.step === step)).toMatchObject({ status: 'done', evidenceKind: 'manual' });
    }
    expect(server.findings.map((f) => f.checkId)).toContain('EXTERNAL-ISSUER-MANUAL-EVIDENCE');
    expect(folded.verdict).toBe('PASS_WITH_WARNINGS');
  });

  it('ignores events for other runs', () => {
    const run = newRun(baseConfig);
    expect(applyRunEvent(run, { type: 'run.status', runId: 'other', state: 'Issuing', at: '' })).toBe(run);
  });
});
