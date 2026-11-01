// Per-run pass/fail report (Task 7) and its Markdown rendering. The renderer is pure so the
// BFF's MarkdownReportRenderer and the UI mocks produce identical files.
import { z } from 'zod';
import {
  CredentialFormatSchema,
  GrantTypeSchema,
  InteropVerdictSchema,
  PresentationFlowSchema,
  RoleSchema,
  RunModeSchema,
  SecondOpinionSchema,
  VerificationOutcomeSchema,
  type SecondOpinion,
} from './domain';
import { PredictionSchema, type Prediction } from './catalog';
import { CheckFindingSchema } from './events';
import {
  formatLabel,
  modeLabel,
  outcomeLabel,
  roleLabel,
  stepLabel,
  verdictLabel,
} from './labels';
import {
  EvidenceKindSchema,
  RunPhaseSchema,
  runUsesRole,
  StepStatusSchema,
  type RunDetail,
} from './run';
import { AppliedTamperSchema } from './tamper';

export const ReportParticipantSchema = z.object({
  role: RoleSchema,
  id: z.string(),
  displayName: z.string(),
  version: z.string().optional(),
});
export type ReportParticipant = z.infer<typeof ReportParticipantSchema>;

/** The tamper a run applied and whether the verifier caught it. */
export const ReportTamperSchema = AppliedTamperSchema.extend({
  observedOutcome: VerificationOutcomeSchema.optional(),
  /** true: the verifier did not accept it; false: it answered Valid; null: no answer to judge. */
  detected: z.boolean().nullable(),
});
export type ReportTamper = z.infer<typeof ReportTamperSchema>;

/** The report's tamper section for a run, or undefined when the run applied none. */
export function reportTamper(run: Pick<RunDetail, 'tamper' | 'observedOutcome'>): ReportTamper | undefined {
  if (!run.tamper) return undefined;
  return {
    ...run.tamper,
    ...(run.observedOutcome ? { observedOutcome: run.observedOutcome } : {}),
    detected: run.observedOutcome ? run.observedOutcome !== 'VALID' : null,
  };
}

export const RunReportSchema = z.object({
  runId: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  durationMs: z.number().optional(),
  /** Runs saved before modes were honoured have no mode; read them as `full`. */
  mode: RunModeSchema.default('full'),
  issuer: ReportParticipantSchema,
  wallet: ReportParticipantSchema,
  verifier: ReportParticipantSchema,
  format: CredentialFormatSchema,
  credentialConfigurationId: z.string(),
  /** Signature method actually seen on the credential, e.g. Ed25519Signature2020 or ES256. */
  proofType: z.string().optional(),
  grantType: GrantTypeSchema,
  presentationFlow: PresentationFlowSchema,
  expectedOutcome: VerificationOutcomeSchema,
  observedOutcome: VerificationOutcomeSchema.optional(),
  verdict: InteropVerdictSchema,
  passed: z.boolean(),
  error: z
    .object({
      step: z.string(),
      message: z.string(),
      status: z.number().int().optional(),
      body: z.string().optional(),
    })
    .optional(),
  steps: z.array(
    z.object({
      phase: RunPhaseSchema,
      step: z.string(),
      status: StepStatusSchema,
      evidenceKind: EvidenceKindSchema.optional(),
      durationMs: z.number().optional(),
    }),
  ),
  correlation: z.enum(['exact', 'heuristic']),
  findings: z.array(CheckFindingSchema),
  tamper: ReportTamperSchema.optional(),
  /** The other verifier's verdict on the same credential (VER-002). */
  secondOpinion: SecondOpinionSchema.optional(),
  /** What the catalog predicted before the run started; runs saved before it was recorded have none. */
  prediction: PredictionSchema.optional(),
  /** Mermaid sequence diagram of the whole run (see sequence.ts); GitHub renders it in Markdown. */
  sequence: z.string().optional(),
  inspectorUrl: z.string(),
});
export type RunReport = z.infer<typeof RunReportSchema>;

const cell = (v: string | number | undefined) =>
  v === undefined || v === '' ? '—' : String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const participant = (p: ReportParticipant) => (p.version ? `${p.displayName} (${p.version})` : p.displayName);

/** The participant cell, or a note when this run mode never contacts that role. */
function participantCell(r: RunReport, p: ReportParticipant): string {
  return runUsesRole(r.mode, p.role)
    ? cell(participant(p))
    : cell(`${participant(p)} — not used (${r.mode} run)`);
}

/** The error-level reasons a prediction gave for "this cannot work", joined into one sentence. */
const blockers = (p: Prediction | undefined) =>
  (p?.reasons ?? []).filter((x) => x.severity === 'error').map((x) => x.message.replace(/\.$/, ''));

/** The prediction in one line, for the report's Prediction field. */
export function predictionLine(p: Prediction | undefined): string {
  if (!p) return 'Not recorded for this run';
  if (p.status === 'unsupported') return `Predicted not to work: ${blockers(p).join('; ') || 'see the compatibility panel'}`;
  if (p.status === 'unknown') return 'No prediction: the catalog does not describe enough to tell';
  const warns = p.reasons.filter((x) => x.severity === 'warn').length;
  return warns ? `Predicted to work, with ${warns} warning${warns === 1 ? '' : 's'}` : 'Predicted to work';
}

/**
 * The report's verdict in words: a headline (the verdict's name) and one or two sentences on what it
 * means for this run. A "Known unsupported" run did not do what it was asked to, but the catalog had
 * predicted that before it started, so it is not counted as an interoperability failure. The two
 * views (report page and Markdown) use this so they never disagree.
 */
export function verdictSummary(r: RunReport): { headline: string; detail: string } {
  const headline = verdictLabel(r.verdict);
  const verifier = r.verifier.displayName;
  const presents = runUsesRole(r.mode, 'verifier');
  const stoppedAt = r.error ? ` (stopped at ${stepLabel(r.error.step)})` : '';
  const happened = !presents
    ? r.passed
      ? 'the credential was issued and stored in the wallet'
      : `the credential was not stored in the wallet${stoppedAt}`
    : r.observedOutcome
      ? `${verifier} answered ${outcomeLabel(r.observedOutcome)}`
      : `${verifier} never gave a verification result${stoppedAt}`;
  const asked = presents
    ? `Expected ${outcomeLabel(r.expectedOutcome)}; ${happened}.`
    : `Issue-only run: ${happened}; nothing was presented.`;
  const reasons = blockers(r.prediction);
  const why = reasons.length ? ` (${reasons.join('; ')})` : '';
  const predictedUnsupported = r.prediction?.status === 'unsupported';

  switch (r.verdict) {
    case 'PASS':
    case 'PASS_WITH_WARNINGS': {
      const warn = r.verdict === 'PASS_WITH_WARNINGS' ? ' The warnings are listed under the findings.' : '';
      const surprise = predictedUnsupported
        ? ` The catalog predicted this combination would not work${why}; it did, so the prediction is out of date.`
        : '';
      return { headline, detail: `${asked}${warn}${surprise}` };
    }
    case 'NOT_APPLICABLE':
      return {
        headline,
        detail: `${asked} Not counted as an interoperability failure: before the run started, the catalog predicted this combination cannot work${why}, and the run confirmed it.`,
      };
    case 'INCONCLUSIVE':
      return {
        headline,
        detail:
          r.error?.message === 'Cancelled by user'
            ? 'Cancelled before it finished, so there is no verdict.'
            : `${asked} The playground could not observe enough to judge the run either way.`,
      };
    default:
      return {
        headline,
        detail: `${asked}${r.prediction?.status === 'supported' ? ' The catalog predicted this combination would work, so this is an interoperability failure.' : ''}`,
      };
  }
}

function outcomeCell(r: RunReport): string {
  const { headline, detail } = verdictSummary(r);
  return cell(`${headline} — ${detail}`);
}

/** One line on the tamper and the verifier's reaction to it. */
export function tamperLine(t: ReportTamper, verifierName: string): string {
  const what = `${t.id} ${t.label.toLowerCase()} (${t.mechanism}${t.defaulted ? ', applied because the run expected Invalid' : ''})`;
  if (t.detected === null) return `${what}: no verification result to judge`;
  if (!t.detected) return `${what}: **not detected** — ${verifierName} returned ${outcomeLabel('VALID')}`;
  if (t.observedOutcome === t.expectedOutcome)
    return `${what}: ${verifierName} rejected it as expected (${outcomeLabel(t.expectedOutcome)})`;
  return `${what}: ${verifierName} rejected it as ${outcomeLabel(t.observedOutcome!)}, not the expected ${outcomeLabel(t.expectedOutcome)}`;
}

/** The second verifier's verdict, and whether it was compared with the run's. */
export function secondOpinionLine(o: SecondOpinion): string {
  const what = `${o.displayName ?? o.verifierId}: ${outcomeLabel(o.outcome)}${o.reason ? ` (${o.reason})` : ''}`;
  if (!o.comparable) return `${what} — credential alone, not compared (the run is judged on presentation checks)`;
  return `${what} — ${o.agrees ? 'agrees' : '**disagrees**'}`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function renderReportMarkdown(r: RunReport): string {
  const lines: string[] = [];
  lines.push(`# Interop run report — ${verdictLabel(r.verdict).toUpperCase()}`, '');
  lines.push(`Run \`${r.runId}\` · ${r.createdAt}`, '');
  lines.push('| Field | Value |', '| --- | --- |');
  lines.push(`| Run mode | ${modeLabel(r.mode)} |`);
  lines.push(`| ${roleLabel('issuer')} | ${participantCell(r, r.issuer)} |`);
  lines.push(`| ${roleLabel('wallet')} | ${participantCell(r, r.wallet)} |`);
  lines.push(`| ${roleLabel('verifier')} | ${participantCell(r, r.verifier)} |`);
  lines.push(`| Format | ${cell(`${formatLabel(r.format)} (\`${r.format}\`)`)} |`);
  lines.push(`| Credential configuration | ${cell(r.credentialConfigurationId)} |`);
  lines.push(`| Proof type | ${cell(r.proofType)} |`);
  lines.push(`| Outcome | ${outcomeCell(r)} |`);
  lines.push(`| Prediction | ${cell(predictionLine(r.prediction))} |`);
  if (r.tamper) lines.push(`| Tamper | ${cell(tamperLine(r.tamper, r.verifier.displayName))} |`);
  if (r.secondOpinion) lines.push(`| Second opinion | ${cell(secondOpinionLine(r.secondOpinion))} |`);
  lines.push(
    `| Error detail | ${cell(r.error ? `${stepLabel(r.error.step)}: ${r.error.message}${r.error.status ? ` (HTTP ${r.error.status})` : ''}` : undefined)} |`,
  );
  lines.push(`| Started | ${cell(r.createdAt)} |`);
  lines.push(`| Finished | ${cell(r.finishedAt)} |`);
  lines.push(`| Duration | ${formatDuration(r.durationMs)} |`);
  lines.push(`| Correlation | ${r.correlation} |`);
  lines.push('');

  lines.push('## Steps', '', '| Phase | Step | Status | Evidence | Duration |', '| --- | --- | --- | --- | --- |');
  for (const s of r.steps) {
    lines.push(
      `| ${s.phase} | ${cell(stepLabel(s.step))} | ${s.status} | ${cell(s.evidenceKind)} | ${formatDuration(s.durationMs)} |`,
    );
  }
  lines.push('');

  if (r.error?.body) {
    lines.push('## Upstream error body', '', '```', r.error.body, '```', '');
  }

  if (r.findings.length > 0) {
    lines.push('## Compliance findings', '', '| Check | Severity | Message |', '| --- | --- | --- |');
    for (const f of r.findings) lines.push(`| ${f.checkId} | ${f.severity} | ${cell(f.message)} |`);
    lines.push('');
  }

  if (r.sequence) {
    lines.push(
      '## Message sequence',
      '',
      'Solid arrows were captured by the Protocol Tap; dashed arrows were not captured and are inferred.',
      '',
      '```mermaid',
      r.sequence,
      '```',
      '',
    );
  }

  lines.push(`Protocol messages: ${r.inspectorUrl}`, '');
  return lines.join('\n');
}
