import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Exchange, RunDetail, RunReport } from '@playground/shared';
import { describe, expect, it } from 'vitest';
import { renderMetrics } from './metrics.ts';
import { ObsrvExporter, toObsrvEvent } from './obsrv.ts';

const versions: RunDetail['versions'] = [
  { implementationId: 'inji-certify', version: '0.14.0', role: 'issuer', displayName: 'Inji Certify' },
  { implementationId: 'mock-wallet', version: '0.1.0', role: 'wallet', displayName: 'Mock wallet' },
  { implementationId: 'inji-verify', version: '0.18.2', role: 'verifier', displayName: 'Inji Verify' },
];

function run(id: string, over: Partial<RunDetail> = {}, config: Partial<RunDetail['config']> = {}): RunDetail {
  return {
    id,
    createdAt: '2026-10-26T05:00:00.000Z',
    finishedAt: '2026-10-26T05:00:02.000Z',
    trigger: 'nightly',
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
      ...config,
    },
    state: 'Reported',
    verdict: 'PASS',
    correlation: 'exact',
    steps: [
      { id: 's1', phase: 'issuing', step: 'oid4vci.token', label: 'Token', status: 'done', durationMs: 250 },
      { id: 's2', phase: 'verifying', step: 'verify.result', label: 'Result', status: 'done', durationMs: 750 },
    ],
    versions,
    artifacts: [],
    ...over,
  } as RunDetail;
}

const exchange = (runId: string, status: number | undefined, latencyMs: number): Exchange =>
  ({
    id: `${runId}-${status}`,
    runId,
    seq: 1,
    ts: '',
    component: 'verify',
    method: 'POST',
    url: 'https://verify.localhost:8443/v1/verify/vp-submission/direct-post',
    status,
    latencyMs,
    step: 'oid4vp.response',
    request: { headers: {} },
    correlationKeys: [],
    outOfBand: false,
  }) as Exchange;

describe('renderMetrics', () => {
  it('counts finished runs per combination and verdict, and times steps and messages', () => {
    const runs = [
      run('a'),
      run('b', { verdict: 'FAIL' }, { tamper: { id: 'T-WRONG-TYPE' }, expectedOutcome: 'INVALID' }),
      run('c', { state: 'Verifying', verdict: undefined }),
    ];
    const text = renderMetrics(runs, (id) => (id === 'a' ? [exchange('a', 200, 40), exchange('a', 400, 60)] : []));
    const combo =
      'issuer="inji-certify",issuer_version="0.14.0",wallet="mock-wallet",wallet_version="0.1.0",verifier="inji-verify",verifier_version="0.18.2",format="vc+sd-jwt",mode="full"';

    expect(text).toContain('# TYPE interop_runs gauge');
    expect(text).toContain(`interop_runs{${combo},verdict="PASS",negative="false"} 1`);
    expect(text).toContain(`interop_runs{${combo},verdict="FAIL",negative="true"} 1`);
    expect(text).toContain(`interop_runs_passed{${combo},negative="false"} 1`);
    expect(text).not.toContain(`interop_runs_passed{${combo},negative="true"}`);
    expect(text).toContain(`interop_run_duration_seconds_sum{${combo},negative="false"} 2`);
    expect(text).toContain('interop_step_duration_seconds_count{phase="verifying",step="verify.result",status="done",format="vc+sd-jwt"} 2');
    expect(text).toContain('interop_exchange_latency_seconds_sum{component="verify",step="oid4vp.response"} 0.1');
    expect(text).toContain('interop_exchange_errors{component="verify",step="oid4vp.response",status="400"} 1');
    expect(text).toContain(`interop_last_run_timestamp_seconds{} ${Date.parse('2026-10-26T05:00:00Z') / 1000}`);
    // The unfinished run is left out.
    expect(text.match(/^interop_runs\{/gm)).toHaveLength(2);
  });

  it('escapes label values', () => {
    const text = renderMetrics([run('q', { verdict: 'PASS' }, { issuerId: 'we"ird\\id' })], () => []);
    expect(text).toContain('issuer="we\\"ird\\\\id"');
  });
});

describe('Obsrv events', () => {
  const report = {
    expectedOutcome: 'INVALID',
    observedOutcome: 'VALID',
    verdict: 'FAIL',
    passed: false,
    durationMs: 2000,
    proofType: 'ES256',
    steps: [{ phase: 'verifying', step: 'verify.result', status: 'done', durationMs: 750 }],
    error: { step: 'verify.result', message: 'Expected INVALID, verifier returned VALID' },
  } as RunReport;

  it('wraps a finished run in the Sunbird telemetry v3 envelope', () => {
    const event = toObsrvEvent(run('r1', { verdict: 'FAIL' }, { tamper: { id: 'T-WRONG-TYPE' } }), report);
    expect(event).toMatchObject({
      eid: 'INTEROP_RUN',
      ver: '3.0',
      mid: 'INTEROP_RUN:r1',
      ets: Date.parse('2026-10-26T05:00:02.000Z'),
      actor: { id: 'nightly', type: 'System' },
      context: { channel: 'inji-interop-playground', env: 'interop' },
      object: { id: 'r1', type: 'InteropRun' },
      edata: {
        issuer: { id: 'inji-certify', version: '0.14.0' },
        verifier: { id: 'inji-verify', version: '0.18.2' },
        tamper: 'T-WRONG-TYPE',
        verdict: 'FAIL',
        passed: false,
        errorStep: 'verify.result',
      },
    });
    expect(event.context.cdata).toContainEqual({ id: 'vc+sd-jwt', type: 'CredentialFormat' });
  });

  it("posts each event to Obsrv's dataset ingestion API", async () => {
    const received: Array<{ auth?: string; body: { data: { id: string; events: Array<{ eid: string }> } } }> = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c));
      req.on('end', () => {
        received.push({ auth: req.headers.authorization, body: JSON.parse(body) });
        res.writeHead(200).end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    await new ObsrvExporter({
      ingestUrl: `http://127.0.0.1:${port}/data/v1/in/inji-interop-runs`,
      authorization: 'Bearer t',
    }).export(toObsrvEvent(run('r9'), report));
    server.close();
    expect(received).toEqual([
      { auth: 'Bearer t', body: { data: { id: 'INTEROP_RUN:r9', events: [expect.objectContaining({ eid: 'INTEROP_RUN' })] } } },
    ]);
  });

  it('appends one JSON line per run to a file per day', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'obsrv-'));
    const exporter = new ObsrvExporter({ dir });
    await exporter.export(toObsrvEvent(run('r1'), report));
    await exporter.export(toObsrvEvent(run('r2'), report));
    const lines = (await readFile(join(dir, 'interop-runs-2026-10-26.jsonl'), 'utf8')).trim().split('\n');
    expect(lines.map((l) => (JSON.parse(l) as { object: { id: string } }).object.id)).toEqual(['r1', 'r2']);
  });
});
