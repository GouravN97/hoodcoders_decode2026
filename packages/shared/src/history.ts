// Run history and the interoperability matrix (plan §8.2 HistoryService / MatrixService, good-to-have
// G5). Pure, so the BFF and the UI's in-browser mocks filter and aggregate runs the same way.
import { z } from 'zod';
import type { CatalogEntry } from './catalog';
import {
  CredentialFormatSchema,
  InteropVerdictSchema,
  RunModeSchema,
  VerificationOutcomeSchema,
  type CredentialFormat,
  type InteropVerdict,
  type Role,
} from './domain';
import { formatLabel, outcomeLabel, verdictLabel } from './labels';
import { RunStateSchema, runUsesRole, type RunDetail } from './run';
import { canReplayFrom } from './tamper';

const ParticipantSchema = z.object({
  id: z.string(),
  /** Display name when the run was created; older runs saved without it fall back to the id. */
  name: z.string(),
  /** Version the catalog reported when the run was created. */
  version: z.string(),
});
export type RunParticipant = z.infer<typeof ParticipantSchema>;

/** One row of GET /api/runs: what history, filters and the matrix need, without the payloads. */
export const RunSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  state: RunStateSchema,
  mode: RunModeSchema,
  issuer: ParticipantSchema,
  wallet: ParticipantSchema,
  verifier: ParticipantSchema,
  format: CredentialFormatSchema,
  credentialConfigurationId: z.string(),
  expectedOutcome: VerificationOutcomeSchema,
  observedOutcome: VerificationOutcomeSchema.optional(),
  verdict: InteropVerdictSchema.optional(),
  /** The tamper the run applied, if any. */
  tamper: z.string().optional(),
  errorSummary: z.string().optional(),
  /** T-NONCE-REPLAY can reuse this run's vp_token (see canReplayFrom). */
  replayable: z.boolean(),
  labels: z.record(z.string(), z.string()).optional(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

/**
 * A run as history shows it. `catalog` names implementations for runs saved before the name was
 * snapshotted; the version always comes from the run itself.
 */
export function summarizeRun(
  run: RunDetail,
  catalog: Array<Pick<CatalogEntry, 'id' | 'displayName'>> = [],
): RunSummary {
  const participant = (role: Role, id: string): RunParticipant => {
    // Match on role first (newer runs record it), then on id (older runs).
    const v =
      run.versions.find((x) => x.role === role && x.implementationId === id) ??
      run.versions.find((x) => x.implementationId === id);
    const name = v?.displayName ?? catalog.find((c) => c.id === id)?.displayName ?? id;
    return { id, name, version: v?.version ?? 'unknown' };
  };
  const { config } = run;
  return {
    id: run.id,
    createdAt: run.createdAt,
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    state: run.state,
    mode: config.mode,
    issuer: participant('issuer', config.issuerId),
    wallet: participant('wallet', config.walletId),
    verifier: participant('verifier', config.verifierId),
    format: config.format,
    credentialConfigurationId: config.credentialConfigurationId,
    expectedOutcome: config.expectedOutcome,
    ...(run.observedOutcome ? { observedOutcome: run.observedOutcome } : {}),
    ...(run.verdict ? { verdict: run.verdict } : {}),
    ...(run.tamper ? { tamper: run.tamper.id } : {}),
    ...(run.errorSummary ? { errorSummary: run.errorSummary } : {}),
    replayable: canReplayFrom(run, config),
    ...(config.labels ? { labels: config.labels } : {}),
  };
}

// ---------- filters ----------

/**
 * GET /api/runs query. Every filter is optional; `tamper` is `none`, `any` or a tamper id; `from`
 * and `to` are dates (YYYY-MM-DD, `to` inclusive) or ISO timestamps.
 */
export const RunsQuerySchema = z.object({
  issuer: z.string().optional(),
  wallet: z.string().optional(),
  verifier: z.string().optional(),
  issuerVersion: z.string().optional(),
  walletVersion: z.string().optional(),
  verifierVersion: z.string().optional(),
  format: CredentialFormatSchema.optional(),
  mode: RunModeSchema.optional(),
  outcome: VerificationOutcomeSchema.optional(),
  verdict: InteropVerdictSchema.optional(),
  tamper: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});
export type RunsQuery = z.infer<typeof RunsQuerySchema>;

/** The filter keys, in the order the history page shows them. */
export const RUN_FILTER_KEYS = [
  'issuer',
  'issuerVersion',
  'wallet',
  'walletVersion',
  'verifier',
  'verifierVersion',
  'format',
  'mode',
  'outcome',
  'verdict',
  'tamper',
  'from',
  'to',
] as const satisfies ReadonlyArray<keyof RunsQuery>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const startOf = (v: string) => (DAY.test(v) ? `${v}T00:00:00.000Z` : v);
const endOf = (v: string) => (DAY.test(v) ? `${v}T23:59:59.999Z` : v);

/** Runs matching every filter in `q`, in the order given (newest first from the store). */
export function filterRuns(runs: RunSummary[], q: RunsQuery): RunSummary[] {
  const out = runs.filter(
    (r) =>
      (!q.issuer || r.issuer.id === q.issuer) &&
      (!q.wallet || r.wallet.id === q.wallet) &&
      (!q.verifier || r.verifier.id === q.verifier) &&
      (!q.issuerVersion || r.issuer.version === q.issuerVersion) &&
      (!q.walletVersion || r.wallet.version === q.walletVersion) &&
      (!q.verifierVersion || r.verifier.version === q.verifierVersion) &&
      (!q.format || r.format === q.format) &&
      (!q.mode || r.mode === q.mode) &&
      (!q.outcome || r.observedOutcome === q.outcome) &&
      (!q.verdict || r.verdict === q.verdict) &&
      (!q.tamper ||
        (q.tamper === 'none' ? !r.tamper : q.tamper === 'any' ? Boolean(r.tamper) : r.tamper === q.tamper)) &&
      (!q.from || r.createdAt >= startOf(q.from)) &&
      (!q.to || r.createdAt <= endOf(q.to)),
  );
  return q.limit ? out.slice(0, q.limit) : out;
}

// ---------- interoperability matrix ----------

export const MatrixCellSchema = z.object({
  /** The newest finished run of this combination. */
  latest: RunSummarySchema,
  runs: z.number().int(),
  /** Runs of this combination that passed (Pass or Pass with warnings). */
  passed: z.number().int(),
});
export type MatrixCell = z.infer<typeof MatrixCellSchema>;

export const MatrixRowSchema = z.object({
  issuer: ParticipantSchema,
  wallet: ParticipantSchema,
  /** Absent for issue-only runs, which never contact a verifier. */
  verifier: ParticipantSchema.optional(),
  cells: z.partialRecord(CredentialFormatSchema, MatrixCellSchema),
});
export type MatrixRow = z.infer<typeof MatrixRowSchema>;

export const MatrixSchema = z.object({
  generatedAt: z.string(),
  includeNegative: z.boolean(),
  formats: z.array(CredentialFormatSchema),
  /** Finished runs the matrix was built from. */
  runCount: z.number().int(),
  rows: z.array(MatrixRowSchema),
});
export type Matrix = z.infer<typeof MatrixSchema>;

const passed = (v: InteropVerdict | undefined) => v === 'PASS' || v === 'PASS_WITH_WARNINGS';

/**
 * A negative test checks that something is refused: a tamper, or a run that expects Invalid or
 * Valid-but-expired. Its pass says nothing about whether the normal path works.
 */
export const isNegativeTest = (r: Pick<RunSummary, 'tamper' | 'mode' | 'expectedOutcome'>) =>
  Boolean(r.tamper) || (runUsesRole(r.mode, 'verifier') && r.expectedOutcome !== 'VALID');

/**
 * The latest verdict per issuer × wallet × verifier × format, versions included, so a module upgrade
 * starts a new row instead of overwriting the old result. Negative tests are left out unless asked
 * for, so a cell answers "does the normal path work"; unfinished runs are always left out.
 */
export function buildMatrix(
  runs: RunSummary[],
  opts: { includeNegative?: boolean; now?: Date } = {},
): Matrix {
  const finished = runs.filter(
    (r) => r.finishedAt && r.verdict && (opts.includeNegative || !isNegativeTest(r)),
  );
  const rows = new Map<string, MatrixRow>();
  const formats = new Set<CredentialFormat>();
  for (const r of finished) {
    const verifies = runUsesRole(r.mode, 'verifier');
    const key = [r.issuer, r.wallet, ...(verifies ? [r.verifier] : [])]
      .map((p) => `${p.id}@${p.version}`)
      .join('|');
    const row: MatrixRow = rows.get(key) ?? {
      issuer: r.issuer,
      wallet: r.wallet,
      ...(verifies ? { verifier: r.verifier } : {}),
      cells: {},
    };
    const cell = row.cells[r.format];
    row.cells[r.format] = {
      latest: !cell || r.createdAt > cell.latest.createdAt ? r : cell.latest,
      runs: (cell?.runs ?? 0) + 1,
      passed: (cell?.passed ?? 0) + (passed(r.verdict) ? 1 : 0),
    };
    rows.set(key, row);
    formats.add(r.format);
  }
  const name = (p?: RunParticipant) => (p ? `${p.name} ${p.version}` : '');
  return {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    includeNegative: Boolean(opts.includeNegative),
    formats: CredentialFormatSchema.options.filter((f) => formats.has(f)),
    runCount: finished.length,
    rows: [...rows.values()].sort(
      (a, b) =>
        name(a.issuer).localeCompare(name(b.issuer)) ||
        name(a.wallet).localeCompare(name(b.wallet)) ||
        name(a.verifier).localeCompare(name(b.verifier)),
    ),
  };
}

const VERDICT_MARK: Record<InteropVerdict, string> = {
  PASS: '✅',
  PASS_WITH_WARNINGS: '⚠️',
  FAIL: '❌',
  INCONCLUSIVE: '❔',
  NOT_APPLICABLE: '➖',
};

/** What an issue-only run's verdict means for the credential. */
const ISSUE_ONLY: Record<InteropVerdict, string> = {
  PASS: 'issued',
  PASS_WITH_WARNINGS: 'issued',
  FAIL: 'not issued',
  INCONCLUSIVE: 'not confirmed',
  NOT_APPLICABLE: 'not issued',
};

/** One cell's text: verdict, what the verifier said (or what happened to an issue-only credential) and how many runs. */
export function matrixCellText(cell: MatrixCell): string {
  const r = cell.latest;
  const v = r.verdict!;
  const what = !runUsesRole(r.mode, 'verifier')
    ? ISSUE_ONLY[v]
    : r.observedOutcome
      ? outcomeLabel(r.observedOutcome)
      : 'no result';
  return `${VERDICT_MARK[v]} ${verdictLabel(v)} (${what})${cell.runs > 1 ? ` · ${cell.passed}/${cell.runs} passed` : ''}`;
}

const md = (s: string) => s.replace(/\|/g, '\\|');

/** The interoperability matrix deliverable as Markdown. */
export function renderMatrixMarkdown(m: Matrix, runUrl?: (id: string) => string): string {
  const lines = [
    '# Inji interoperability matrix',
    '',
    `Generated ${m.generatedAt} from ${m.runCount} finished run${m.runCount === 1 ? '' : 's'}. Each cell is the latest run of that combination; ${m.includeNegative ? 'negative tests (tampers, expected Invalid or Expired) are included' : 'negative tests (tampers, expected Invalid or Expired) are left out, so each cell says whether the normal path works'}. Versions are the ones the catalog reported when the run was created.`,
    '',
  ];
  if (m.rows.length === 0) {
    lines.push('No finished runs yet.', '');
    return lines.join('\n');
  }
  lines.push(
    `| Issuer | Wallet | Verifier | ${m.formats.map((f) => `${formatLabel(f)} (\`${f}\`)`).join(' | ')} |`,
    `| --- | --- | --- | ${m.formats.map(() => '---').join(' | ')} |`,
  );
  for (const row of m.rows) {
    const who = (p?: RunParticipant) => (p ? md(`${p.name} ${p.version}`) : '— (issue only)');
    const cells = m.formats.map((f) => {
      const c = row.cells[f];
      if (!c) return '';
      const text = md(matrixCellText(c));
      return runUrl ? `[${text}](${runUrl(c.latest.id)})` : text;
    });
    lines.push(`| ${who(row.issuer)} | ${who(row.wallet)} | ${who(row.verifier)} | ${cells.join(' | ')} |`);
  }
  lines.push(
    '',
    'Legend: ✅ pass · ⚠️ pass with warnings · ❌ fail · ❔ inconclusive · ➖ known unsupported. In brackets: what the verifier answered or, for issue-only runs, whether the credential was issued into the wallet.',
    '',
  );
  return lines.join('\n');
}
