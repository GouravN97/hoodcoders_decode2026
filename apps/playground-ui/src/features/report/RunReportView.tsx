import {
  formatDuration,
  formatLabel,
  modeLabel,
  outcomeLabel,
  phaseLabel,
  runUsesRole,
  stepLabel,
  verdictLabel,
  type InteropVerdict,
  type ReportParticipant,
  type RunReport,
} from '@playground/shared';
import { useState, type ReactNode } from 'react';
import type { ReportFormat } from '../../api/client';
import { useReport } from '../../api/queries';
import { DownloadIcon, IssuerIcon } from '../../components/icons';
import { Button, Card, cx, ErrorNote, SectionTitle, Spinner, type Tone } from '../../components/ui';
import { EvidenceIcon, STATUS_LABEL, StatusIcon } from '../run/status';
import { downloadReport } from './download';

const VERDICT_TONE: Record<InteropVerdict, Tone> = {
  PASS: 'ok',
  PASS_WITH_WARNINGS: 'ok',
  FAIL: 'bad',
  INCONCLUSIVE: 'warn',
  NOT_APPLICABLE: 'neutral',
};
const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  bad: 'text-bad',
  warn: 'text-warn',
  neutral: 'text-muted',
  accent: 'text-accent',
};

const who = (p: ReportParticipant) => (
  <>
    {p.displayName}
    {p.version && <span className="ml-1.5 font-mono text-xs text-muted">v{p.version}</span>}
  </>
);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 border-t border-border px-4 py-2 text-[13px] first:border-t-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function DownloadButtons({ runId }: { runId: string }) {
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const get = async (format: ReportFormat) => {
    setBusy(format);
    setError(null);
    try {
      await downloadReport(runId, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-bad">{error}</span>}
      {(['md', 'json'] as const).map((f) => (
        <Button key={f} size="sm" className="pl-2" onClick={() => void get(f)} disabled={busy !== null}>
          {busy === f ? <Spinner className="size-3.5" /> : <DownloadIcon width={14} height={14} />}
          {f === 'md' ? 'Markdown' : 'JSON'}
        </Button>
      ))}
    </div>
  );
}

function ReportBody({ report }: { report: RunReport }) {
  const tone = VERDICT_TONE[report.verdict];
  const verifies = runUsesRole(report.mode, 'verifier');
  const usedOrNot = (p: ReportParticipant) =>
    runUsesRole(report.mode, p.role) ? (
      who(p)
    ) : (
      <span className="text-muted">
        {who(p)} — not used in this run
      </span>
    );
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 pb-4 pt-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Outcome</p>
          <p className={cx('text-2xl font-bold tracking-tight', TONE_TEXT[tone])} data-testid="report-verdict">
            {report.passed ? 'Pass' : 'Fail'}
            {!['PASS', 'FAIL'].includes(report.verdict) && (
              <span className="ml-2 text-sm font-medium text-muted">{verdictLabel(report.verdict)}</span>
            )}
          </p>
        </div>
        {verifies ? (
          <p className="text-[13px] text-muted">
            Expected <strong className="text-fg">{outcomeLabel(report.expectedOutcome)}</strong>, verifier said{' '}
            <strong className="text-fg">{report.observedOutcome ? outcomeLabel(report.observedOutcome) : 'nothing'}</strong>
            .
          </p>
        ) : (
          <p className="text-[13px] text-muted">
            Issue-only run: passes once the credential is stored in the wallet.
          </p>
        )}
      </div>
      <dl className="border-t border-border" aria-label="Report fields">
        <Row label="Run mode">{modeLabel(report.mode)}</Row>
        <Row label="Issuer">{usedOrNot(report.issuer)}</Row>
        <Row label="Wallet">{usedOrNot(report.wallet)}</Row>
        <Row label="Verifier">{usedOrNot(report.verifier)}</Row>
        <Row label="Format">
          {formatLabel(report.format)} <span className="font-mono text-xs text-muted">{report.format}</span>
        </Row>
        <Row label="Proof type">
          <span className="font-mono">{report.proofType ?? '—'}</span>
        </Row>
        <Row label="Outcome">
          {report.passed ? 'Pass' : 'Fail'} —{' '}
          {!verifies
            ? report.passed
              ? 'credential issued and stored'
              : 'credential not stored'
            : report.observedOutcome
              ? outcomeLabel(report.observedOutcome)
              : 'no verification result'}
        </Row>
        <Row label="Error detail">
          {report.error ? (
            <span className="text-bad">
              <strong>{stepLabel(report.error.step)}:</strong> {report.error.message}
              {report.error.status !== undefined && <span className="font-mono"> (HTTP {report.error.status})</span>}
            </span>
          ) : (
            <span className="text-muted">None</span>
          )}
        </Row>
        <Row label="Credential">
          <span className="font-mono text-xs">{report.credentialConfigurationId}</span>
        </Row>
        <Row label="Started / finished">
          {new Date(report.createdAt).toLocaleString()} → {report.finishedAt ? new Date(report.finishedAt).toLocaleTimeString() : '—'}
          <span className="ml-2 text-muted">({formatDuration(report.durationMs)})</span>
        </Row>
        <Row label="Correlation">{report.correlation}</Row>
      </dl>
      <details className="border-t border-border">
        <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-muted hover:text-fg">Step timings</summary>
        <table className="w-full text-left text-[13px]">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-4 py-1 font-medium">Phase</th>
              <th className="py-1 font-medium">Step</th>
              <th className="py-1 font-medium">Status</th>
              <th className="px-4 py-1 text-right font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {report.steps.map((s) => (
              <tr key={s.step} className="border-t border-border">
                <td className="px-4 py-1 text-muted">{phaseLabel(s.phase)}</td>
                <td className="py-1">
                  <span className="flex items-center gap-1.5">
                    {stepLabel(s.step)} {s.evidenceKind && <EvidenceIcon kind={s.evidenceKind} />}
                  </span>
                </td>
                <td className="py-1">
                  <span className="flex items-center gap-1.5">
                    <StatusIcon status={s.status} className="size-4" /> {STATUS_LABEL[s.status]}
                  </span>
                </td>
                <td className="px-4 py-1 text-right font-mono text-xs">{formatDuration(s.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

export function RunReportView({ runId, ready }: { runId: string; ready: boolean }) {
  const report = useReport(runId, ready);
  return (
    <Card id="report" aria-label="Run report">
      <SectionTitle icon={<IssuerIcon width={16} height={16} />} aside={ready && <DownloadButtons runId={runId} />}>
        Run report
      </SectionTitle>
      {!ready ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted">The report is ready when the run finishes.</p>
      ) : report.isPending ? (
        <p className="flex items-center justify-center gap-2 px-4 py-6 text-[13px] text-muted">
          <Spinner /> Building report…
        </p>
      ) : report.isError ? (
        <div className="p-4">
          <ErrorNote title="Could not load the report" error={report.error} />
        </div>
      ) : (
        <ReportBody report={report.data} />
      )}
    </Card>
  );
}
