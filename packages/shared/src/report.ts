// Per-run pass/fail report (Task 7) and its Markdown rendering. The renderer is pure so the
// BFF's MarkdownReportRenderer and the UI mocks produce identical files.
import { z } from 'zod';
import {
  CredentialFormatSchema,
  GrantTypeSchema,
  InteropVerdictSchema,
  PresentationFlowSchema,
  RoleSchema,
  VerificationOutcomeSchema,
} from './domain';
import { CheckFindingSchema } from './events';
import {
  formatLabel,
  outcomeLabel,
  roleLabel,
  stepLabel,
  verdictLabel,
} from './labels';
import { EvidenceKindSchema, RunPhaseSchema, StepStatusSchema } from './run';

export const ReportParticipantSchema = z.object({
  role: RoleSchema,
  id: z.string(),
  displayName: z.string(),
  version: z.string().optional(),
});
export type ReportParticipant = z.infer<typeof ReportParticipantSchema>;

export const RunReportSchema = z.object({
  runId: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  durationMs: z.number().optional(),
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
  inspectorUrl: z.string(),
});
export type RunReport = z.infer<typeof RunReportSchema>;

const cell = (v: string | number | undefined) =>
  v === undefined || v === '' ? '—' : String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const participant = (p: ReportParticipant) => (p.version ? `${p.displayName} (${p.version})` : p.displayName);

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function renderReportMarkdown(r: RunReport): string {
  const lines: string[] = [];
  lines.push(`# Interop run report — ${r.passed ? 'PASS' : 'FAIL'}`, '');
  lines.push(`Run \`${r.runId}\` · ${r.createdAt}`, '');
  lines.push('| Field | Value |', '| --- | --- |');
  lines.push(`| ${roleLabel('issuer')} | ${cell(participant(r.issuer))} |`);
  lines.push(`| ${roleLabel('wallet')} | ${cell(participant(r.wallet))} |`);
  lines.push(`| ${roleLabel('verifier')} | ${cell(participant(r.verifier))} |`);
  lines.push(`| Format | ${cell(`${formatLabel(r.format)} (\`${r.format}\`)`)} |`);
  lines.push(`| Credential configuration | ${cell(r.credentialConfigurationId)} |`);
  lines.push(`| Proof type | ${cell(r.proofType)} |`);
  lines.push(
    `| Outcome | ${cell(`${verdictLabel(r.verdict)} — observed ${r.observedOutcome ? outcomeLabel(r.observedOutcome) : 'no result'}, expected ${outcomeLabel(r.expectedOutcome)}`)} |`,
  );
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

  lines.push(`Protocol messages: ${r.inspectorUrl}`, '');
  return lines.join('\n');
}
