// TelemetryService, metrics half (plan §16.3, bonus B3): GET /metrics in the Prometheus text
// format. Computed from the saved runs on every scrape, so the numbers cover the whole history
// (runs survive restarts in DATA_DIR) and need no counters to keep in step with the run store.
import {
  summarizeRun,
  TERMINAL_RUN_STATES,
  type CatalogEntry,
  type Exchange,
  type RunDetail,
} from '@playground/shared';

type Labels = Record<string, string>;

const escape = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const labelText = (l: Labels) =>
  `{${Object.entries(l)
    .map(([k, v]) => `${k}="${escape(v)}"`)
    .join(',')}}`;

/** One metric family: HELP, TYPE and its samples, keyed by label set. */
class Family {
  private readonly samples = new Map<string, { labels: Labels; value: number }>();

  constructor(
    readonly name: string,
    readonly type: 'gauge' | 'counter',
    readonly help: string,
  ) {}

  add(labels: Labels, value = 1) {
    const key = labelText(labels);
    const s = this.samples.get(key) ?? { labels, value: 0 };
    s.value += value;
    this.samples.set(key, s);
  }

  render(): string[] {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
      ...[...this.samples.values()].map((s) => `${this.name}${labelText(s.labels)} ${s.value}`),
    ];
  }
}

/** A sum/count pair, so a dashboard can divide them for the mean. */
class Timing {
  readonly sum: Family;
  readonly count: Family;

  constructor(name: string, help: string) {
    this.sum = new Family(`${name}_sum`, 'gauge', `${help} (total)`);
    this.count = new Family(`${name}_count`, 'gauge', `${help} (number of observations)`);
  }

  observe(labels: Labels, value: number) {
    this.sum.add(labels, value);
    this.count.add(labels);
  }
}

/**
 * Metrics for the finished runs. `negative` marks tampers and runs that expect Invalid or Expired,
 * so a success rate of the normal path can leave them out, as the matrix does.
 */
export function renderMetrics(
  runs: RunDetail[],
  exchangesOf: (runId: string) => Exchange[],
  catalog: Array<Pick<CatalogEntry, 'id' | 'displayName'>> = [],
): string {
  const runsTotal = new Family(
    'interop_runs',
    'gauge',
    'Finished runs by issuer, wallet, verifier, versions, format, mode, verdict and whether the run is a negative test',
  );
  const passed = new Family('interop_runs_passed', 'gauge', 'Finished runs whose verdict is Pass or Pass with warnings');
  const runDuration = new Timing('interop_run_duration_seconds', 'Run duration from creation to the report');
  const stepDuration = new Timing('interop_step_duration_seconds', 'Run step duration');
  const exchangeLatency = new Timing('interop_exchange_latency_seconds', 'Protocol message latency through the Protocol Tap');
  const exchangeErrors = new Family(
    'interop_exchange_errors',
    'gauge',
    'Protocol messages answered with HTTP 4xx/5xx or no response, by component, step and status',
  );
  const lastRun = new Family('interop_last_run_timestamp_seconds', 'gauge', 'When the newest finished run was created');

  let newest = 0;
  for (const run of runs) {
    if (!TERMINAL_RUN_STATES.includes(run.state)) continue;
    const s = summarizeRun(run, catalog);
    const combo: Labels = {
      issuer: s.issuer.id,
      issuer_version: s.issuer.version,
      wallet: s.wallet.id,
      wallet_version: s.wallet.version,
      verifier: s.verifier.id,
      verifier_version: s.verifier.version,
      format: s.format,
      mode: s.mode,
    };
    const negative = String(Boolean(run.config.tamper) || run.config.expectedOutcome !== 'VALID');
    runsTotal.add({ ...combo, verdict: run.verdict ?? 'NONE', negative });
    if (run.verdict === 'PASS' || run.verdict === 'PASS_WITH_WARNINGS') passed.add({ ...combo, negative });

    const created = Date.parse(run.createdAt);
    newest = Math.max(newest, created);
    if (run.finishedAt) runDuration.observe({ ...combo, negative }, (Date.parse(run.finishedAt) - created) / 1000);
    for (const st of run.steps)
      if (st.durationMs !== undefined && (st.status === 'done' || st.status === 'failed'))
        stepDuration.observe({ phase: st.phase, step: st.step, status: st.status, format: s.format }, st.durationMs / 1000);

    for (const ex of exchangesOf(run.id)) {
      if (ex.outOfBand) continue;
      if (ex.latencyMs !== undefined)
        exchangeLatency.observe({ component: ex.component, step: ex.step }, ex.latencyMs / 1000);
      if (ex.status === undefined || ex.status >= 400)
        exchangeErrors.add({ component: ex.component, step: ex.step, status: String(ex.status ?? 'none') });
    }
  }
  if (newest) lastRun.add({}, Math.round(newest / 1000));

  return `${[
    runsTotal,
    passed,
    runDuration.sum,
    runDuration.count,
    stepDuration.sum,
    stepDuration.count,
    exchangeLatency.sum,
    exchangeLatency.count,
    exchangeErrors,
    lastRun,
  ]
    .flatMap((f) => f.render())
    .join('\n')}\n`;
}
