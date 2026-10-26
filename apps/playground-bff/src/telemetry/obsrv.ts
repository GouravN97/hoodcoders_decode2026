// TelemetryService, events half (plan §16.3 ObsrvEventExporter, bonus B3). Each finished run
// becomes one event in the Sunbird telemetry v3 envelope that Inji Wallet sends to Obsrv
// (eid, ets, ver, mid, actor, context, object, edata), so MOSIP's Obsrv → Druid pipeline can
// ingest playground runs next to wallet telemetry. Events are appended to
// `${DATA_DIR}/telemetry/interop-runs-<date>.jsonl` (a Druid batch-ingest source) and, when
// OBSRV_INGEST_URL is set, posted to Obsrv's dataset ingestion API.
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { summarizeRun, type CatalogEntry, type RunDetail, type RunReport } from '@playground/shared';

export interface InteropRunEvent {
  eid: 'INTEROP_RUN';
  ets: number;
  ver: '3.0';
  mid: string;
  actor: { id: string; type: 'System' | 'User' };
  context: {
    channel: string;
    pdata: { id: string; pid: string; ver: string };
    env: string;
    cdata: Array<{ id: string; type: string }>;
  };
  object: { id: string; type: 'InteropRun'; ver: string };
  edata: {
    issuer: { id: string; version: string };
    wallet: { id: string; version: string };
    verifier: { id: string; version: string };
    format: string;
    mode: string;
    proofType?: string;
    tamper?: string;
    expectedOutcome: string;
    observedOutcome?: string;
    verdict: string;
    passed: boolean;
    durationMs?: number;
    steps: Array<{ step: string; phase: string; status: string; durationMs?: number }>;
    errorStep?: string;
    errorMessage?: string;
    trigger: string;
    correlation: string;
  };
}

export const PDATA = { id: 'inji-interop-playground', pid: 'playground-bff', ver: '0.1.0' };

export function toObsrvEvent(
  run: RunDetail,
  report: RunReport,
  catalog: Array<Pick<CatalogEntry, 'id' | 'displayName'>> = [],
): InteropRunEvent {
  const s = summarizeRun(run, catalog);
  const who = (p: { id: string; version: string }) => ({ id: p.id, version: p.version });
  return {
    eid: 'INTEROP_RUN',
    ets: Date.parse(run.finishedAt ?? run.createdAt),
    ver: '3.0',
    mid: `INTEROP_RUN:${run.id}`,
    actor: { id: run.trigger, type: run.trigger === 'ui' ? 'User' : 'System' },
    context: {
      channel: PDATA.id,
      pdata: PDATA,
      env: 'interop',
      cdata: [
        { id: s.issuer.id, type: 'Issuer' },
        { id: s.wallet.id, type: 'Wallet' },
        { id: s.verifier.id, type: 'Verifier' },
        { id: s.format, type: 'CredentialFormat' },
      ],
    },
    object: { id: run.id, type: 'InteropRun', ver: '1' },
    edata: {
      issuer: who(s.issuer),
      wallet: who(s.wallet),
      verifier: who(s.verifier),
      format: s.format,
      mode: s.mode,
      ...(report.proofType ? { proofType: report.proofType } : {}),
      ...(run.config.tamper ? { tamper: run.config.tamper.id } : {}),
      expectedOutcome: report.expectedOutcome,
      ...(report.observedOutcome ? { observedOutcome: report.observedOutcome } : {}),
      verdict: report.verdict,
      passed: report.passed,
      ...(report.durationMs !== undefined ? { durationMs: report.durationMs } : {}),
      steps: report.steps.map((st) => ({
        step: st.step,
        phase: st.phase,
        status: st.status,
        ...(st.durationMs !== undefined ? { durationMs: st.durationMs } : {}),
      })),
      ...(report.error ? { errorStep: report.error.step, errorMessage: report.error.message } : {}),
      trigger: run.trigger,
      correlation: run.correlation,
    },
  };
}

export interface ObsrvExporterOptions {
  /** Directory for the JSONL files; unset = no files. */
  dir?: string;
  /** Obsrv dataset ingestion endpoint, e.g. https://obsrv.example/data/v1/in/inji-interop-runs. */
  ingestUrl?: string;
  /** Sent as `Authorization` when set. */
  authorization?: string;
}

export class ObsrvExporter {
  constructor(private readonly opts: ObsrvExporterOptions) {}

  get enabled() {
    return Boolean(this.opts.dir || this.opts.ingestUrl);
  }

  /** Never throws: telemetry must not break a run. */
  async export(event: InteropRunEvent): Promise<void> {
    const { dir, ingestUrl, authorization } = this.opts;
    if (dir) {
      try {
        await mkdir(dir, { recursive: true });
        const day = new Date(event.ets).toISOString().slice(0, 10);
        await appendFile(join(dir, `interop-runs-${day}.jsonl`), `${JSON.stringify(event)}\n`);
      } catch (e) {
        console.warn(`[telemetry] could not write the run event: ${(e as Error).message}`);
      }
    }
    if (ingestUrl) {
      try {
        const res = await fetch(ingestUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
          body: JSON.stringify({ data: { id: event.mid, events: [event] } }),
          signal: AbortSignal.timeout(5000),
        });
        await res.body?.cancel();
        if (!res.ok) console.warn(`[telemetry] Obsrv answered ${res.status} for ${event.mid}`);
      } catch (e) {
        console.warn(`[telemetry] could not send ${event.mid} to Obsrv: ${(e as Error).message}`);
      }
    }
  }
}
