// RunReportBuilder (plan §8.2, Task 7): the pass/fail report for one run. The Markdown rendering
// is shared with the UI (renderReportMarkdown in packages/shared).
import type { CatalogEntry, ReportParticipant, Role, RunReport } from '@playground/shared';
import { decodeBody } from '../decoder/payload-decoder.ts';
import type { RunRecord } from './store.ts';

/** Signature method actually seen on the credential: the JWS alg for SD-JWT, proof.type for JSON-LD. */
export function proofTypeOf(credentialRaw: string | undefined): string | undefined {
  if (!credentialRaw) return undefined;
  const d = decodeBody(credentialRaw);
  if (d.kind === 'sd-jwt') return String(d.issuerJwt.header.alg ?? '') || undefined;
  if (d.kind === 'jwt') return String(d.jwt.header.alg ?? '') || undefined;
  if (d.kind === 'json') {
    const proof = (d.value as { proof?: { type?: string } | Array<{ type?: string }> }).proof;
    return Array.isArray(proof) ? proof.map((p) => p.type).join(', ') : proof?.type;
  }
  return undefined;
}

export function buildRunReport(
  record: RunRecord,
  catalog: CatalogEntry[],
  uiOrigin: string,
): RunReport {
  const { run } = record;
  const participant = (role: Role, id: string): ReportParticipant => {
    const entry = catalog.find((c) => c.id === id);
    const version = run.versions.find((v) => v.implementationId === id)?.version;
    return { role, id, displayName: entry?.displayName ?? id, ...(version ? { version } : {}) };
  };
  const failed = run.steps.find((s) => s.status === 'failed' || s.status === 'inconclusive');
  const credential = run.artifacts.find((a) => a.kind === 'credential');
  const verdict = run.verdict ?? 'INCONCLUSIVE';
  const error = failed?.error
    ? { step: failed.step, ...failed.error }
    : verdict === 'FAIL' && run.errorSummary
      ? { step: 'verify.result', message: run.errorSummary }
      : run.state === 'Cancelled'
        ? {
            step: run.steps.find((s) => s.status === 'skipped')?.step ?? 'run',
            message: 'Cancelled by user',
          }
        : run.state === 'Aborted' && run.errorSummary
          ? { step: 'preflight', message: run.errorSummary }
          : undefined;
  const proofType = proofTypeOf(credential?.raw) ?? run.config.proofSuite;

  return {
    runId: run.id,
    createdAt: run.createdAt,
    ...(run.finishedAt
      ? {
          finishedAt: run.finishedAt,
          durationMs: new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime(),
        }
      : {}),
    mode: run.config.mode,
    issuer: participant('issuer', run.config.issuerId),
    wallet: participant('wallet', run.config.walletId),
    verifier: participant('verifier', run.config.verifierId),
    format: run.config.format,
    credentialConfigurationId: run.config.credentialConfigurationId,
    ...(proofType ? { proofType } : {}),
    grantType: run.config.grantType,
    presentationFlow: run.config.presentationFlow,
    expectedOutcome: run.config.expectedOutcome,
    ...(run.observedOutcome ? { observedOutcome: run.observedOutcome } : {}),
    verdict,
    passed: verdict === 'PASS' || verdict === 'PASS_WITH_WARNINGS',
    ...(error ? { error } : {}),
    steps: run.steps.map((s) => ({
      phase: s.phase,
      step: s.step,
      status: s.status,
      ...(s.evidenceKind ? { evidenceKind: s.evidenceKind } : {}),
      ...(s.durationMs !== undefined ? { durationMs: s.durationMs } : {}),
    })),
    correlation: run.correlation,
    findings: record.findings,
    inspectorUrl: `${uiOrigin.replace(/\/$/, '')}/runs/${run.id}?view=inspector`,
  };
}
