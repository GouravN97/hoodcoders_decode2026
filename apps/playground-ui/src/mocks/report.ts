// Mock RunReportBuilder: assembles the Task 7 report from the stored run.
import {
  buildSequence,
  reportTamper,
  toMermaid,
  type CatalogEntry,
  type ReportParticipant,
  type Role,
  type RunReport,
} from '@playground/shared';
import { decodeBody } from '../lib/decode';
import type { MockRunRecord } from './db';

function proofTypeOf(credentialRaw: string | undefined): string | undefined {
  if (!credentialRaw) return undefined;
  const d = decodeBody(credentialRaw);
  if (d.kind === 'sd-jwt') return String(d.issuerJwt.header.alg ?? '');
  if (d.kind === 'jwt') return String(d.jwt.header.alg ?? '');
  if (d.kind === 'json') {
    const proof = (d.value as { proof?: { type?: string } | Array<{ type?: string }> }).proof;
    return Array.isArray(proof) ? proof.map((p) => p.type).join(', ') : proof?.type;
  }
  return undefined;
}

export function buildRunReport(record: MockRunRecord, catalog: CatalogEntry[]): RunReport {
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
        ? { step: run.steps.find((s) => s.status === 'skipped')?.step ?? 'run', message: 'Cancelled by user' }
        : undefined;
  const proofType = proofTypeOf(credential?.raw) ?? run.config.proofSuite;
  const tamper = reportTamper(run);
  const sequence = toMermaid(
    buildSequence(
      {
        config: run.config,
        exchanges: record.exchanges,
        steps: run.steps,
        catalog,
        ...(run.tamper ? { tamper: run.tamper } : {}),
      },
      'full',
    ),
  );

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
    ...(tamper ? { tamper } : {}),
    ...(run.result?.secondOpinion ? { secondOpinion: run.result.secondOpinion } : {}),
    sequence,
    inspectorUrl: `${location.origin}/runs/${run.id}#inspector`,
  };
}
