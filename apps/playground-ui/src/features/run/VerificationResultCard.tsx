import {
  outcomeLabel,
  reportTamper,
  verdictLabel,
  type ReportTamper,
  type RunDetail,
  type SecondOpinion,
  type VerificationOutcome,
  type VerificationStage,
} from '@playground/shared';
import { AlertIcon, CheckIcon, ClockIcon, DashIcon, XIcon } from '../../components/icons';
import { CodeBlock } from '../../components/JsonTree';
import { cx } from '../../components/ui';

const TONE: Record<VerificationOutcome, { box: string; Icon: typeof CheckIcon; text: string }> = {
  VALID: { box: 'bg-ok-soft border-ok/40', Icon: CheckIcon, text: 'text-ok' },
  INVALID: { box: 'bg-bad-soft border-bad/40', Icon: XIcon, text: 'text-bad' },
  EXPIRED: { box: 'bg-warn-soft border-warn/40', Icon: ClockIcon, text: 'text-warn' },
  REVOKED: { box: 'bg-bad-soft border-bad/40', Icon: XIcon, text: 'text-bad' },
  REJECTED: { box: 'bg-surface-2 border-border', Icon: AlertIcon, text: 'text-muted' },
  ERROR: { box: 'bg-surface-2 border-border', Icon: AlertIcon, text: 'text-muted' },
};

const EXPLAIN: Record<VerificationOutcome, string> = {
  VALID: 'Genuine, unchanged and in date.',
  INVALID: 'The credential failed a check: its signature, data or type did not hold up.',
  EXPIRED: 'Genuinely signed, but past its expiry date.',
  REVOKED: 'The issuer has revoked this credential.',
  REJECTED: 'The wallet or verifier refused the presentation.',
  ERROR: 'The verifier could not produce a result.',
};

/** Whether the verifier caught the run's tamper, in one sentence. */
export function TamperVerdict({ tamper, verifierName }: { tamper: ReportTamper; verifierName: string }) {
  const tone =
    tamper.detected === false ? 'text-bad' : tamper.detected && tamper.observedOutcome === tamper.expectedOutcome ? 'text-ok' : 'text-warn';
  return (
    <p className={cx('text-xs', tone)} data-testid="tamper-verdict">
      <strong>
        {tamper.id} {tamper.label.toLowerCase()}
      </strong>
      {tamper.defaulted && <span className="text-muted"> (applied because the run expected Invalid)</span>}:{' '}
      {tamper.detected === null
        ? 'no verification result to judge.'
        : !tamper.detected
          ? `not detected — ${verifierName} accepted it as ${outcomeLabel('VALID')}.`
          : tamper.observedOutcome === tamper.expectedOutcome
            ? `${verifierName} rejected it as expected.`
            : `${verifierName} rejected it as ${outcomeLabel(tamper.observedOutcome!)}, not the expected ${outcomeLabel(tamper.expectedOutcome)}.`}
    </p>
  );
}

const STAGE_TONE: Record<VerificationStage['status'], { Icon: typeof CheckIcon; text: string; label: string }> = {
  pass: { Icon: CheckIcon, text: 'text-ok', label: 'Passed' },
  fail: { Icon: XIcon, text: 'text-bad', label: 'Failed' },
  warn: { Icon: AlertIcon, text: 'text-warn', label: 'Warning' },
  skip: { Icon: DashIcon, text: 'text-muted', label: 'Not checked' },
};

/** Every check the verifier reports making, in order. */
export function VerifierChecks({ stages }: { stages: VerificationStage[] }) {
  return (
    <ol className="divide-y divide-border/60" data-testid="verifier-checks">
      {stages.map((s, i) => {
        const tone = STAGE_TONE[s.status];
        return (
          <li key={`${s.id}-${i}`} className="flex items-start gap-2.5 px-5 py-2 text-xs" data-stage={s.id} data-status={s.status}>
            <tone.Icon width={14} height={14} strokeWidth={2.5} className={cx('mt-px shrink-0', tone.text)} />
            <span className="min-w-0">
              <span className="sr-only">{tone.label}: </span>
              <strong className="font-medium">{s.label}</strong>
              <span className="text-muted"> — {s.message}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The other verifier's verdict on the same credential (VER-002), in one sentence. */
export function SecondOpinionLine({ opinion, verifierName }: { opinion: SecondOpinion; verifierName: string }) {
  const other = opinion.displayName ?? opinion.verifierId;
  const tone = !opinion.comparable ? 'text-muted' : opinion.agrees ? 'text-ok' : 'text-warn';
  return (
    <p className="text-xs" data-testid="second-opinion" data-agrees={opinion.comparable ? String(opinion.agrees) : 'not-compared'}>
      <strong>Second opinion</strong> from {other} on the credential alone:{' '}
      <strong className={tone}>{outcomeLabel(opinion.outcome)}</strong>
      {opinion.reason && <span className="text-muted"> ({opinion.reason})</span>}
      {' — '}
      {!opinion.comparable
        ? `not compared: this run is judged on presentation checks (requested type, holder binding, nonce) that a credential-only check does not make.`
        : opinion.agrees
          ? `agrees with ${verifierName}.`
          : `disagrees with ${verifierName}.`}
    </p>
  );
}

export function VerificationResultCard({ run, verifierName = 'Verifier' }: { run: RunDetail; verifierName?: string }) {
  const outcome = run.result?.outcome ?? run.observedOutcome;
  if (!outcome) return null;
  const tone = TONE[outcome];
  const matched = outcome === run.config.expectedOutcome;
  const tamper = reportTamper(run);

  // Enters once per run: opacity always fades in; the rise and blur only without reduced motion.
  return (
    <section
      aria-label="Verification result"
      aria-live="polite"
      className={cx(
        'overflow-hidden rounded-xl border transition-[opacity,translate,filter] duration-300 ease-out',
        'starting:opacity-0 motion-safe:starting:translate-y-3 motion-safe:starting:blur-[4px]',
        tone.box,
      )}
      data-testid="verification-result"
      data-outcome={outcome}
    >
      <div className="flex items-center gap-4 p-5">
        <span className={cx('grid size-12 shrink-0 place-items-center rounded-full bg-surface', tone.text)}>
          <tone.Icon width={26} height={26} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{verifierName} result</p>
          <p className={cx('text-2xl font-bold tracking-tight', tone.text)}>{outcomeLabel(outcome)}</p>
          <p className="text-[13px] text-muted">{EXPLAIN[outcome]}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 bg-surface/60 px-5 py-2 text-xs">
        <span>
          Expected <strong>{outcomeLabel(run.config.expectedOutcome)}</strong> —{' '}
          {matched ? 'matches' : 'does not match'}
        </span>
        {run.verdict && <span>Run verdict: <strong>{verdictLabel(run.verdict)}</strong></span>}
      </div>
      {tamper && (
        <div className="border-t border-border/60 bg-surface/60 px-5 py-2">
          <TamperVerdict tamper={tamper} verifierName={verifierName} />
        </div>
      )}
      {run.result?.secondOpinion && (
        <div className="border-t border-border/60 bg-surface/60 px-5 py-2">
          <SecondOpinionLine opinion={run.result.secondOpinion} verifierName={verifierName} />
        </div>
      )}
      {run.result?.stages && run.result.stages.length > 0 && (
        <details className="border-t border-border/60 bg-surface" open>
          <summary className="cursor-pointer px-5 py-2 text-xs font-medium text-muted hover:text-fg">
            Checks made by {verifierName} ({run.result.stages.filter((s) => s.status === 'pass').length} of {run.result.stages.length} passed)
          </summary>
          <VerifierChecks stages={run.result.stages} />
        </details>
      )}
      {run.result?.verifierRaw !== undefined && (
        <details className="border-t border-border/60 bg-surface">
          <summary className="cursor-pointer px-5 py-2 text-xs font-medium text-muted hover:text-fg">
            Full verifier response
          </summary>
          <div className="px-4 pb-4">
            <CodeBlock>{JSON.stringify(run.result.verifierRaw, null, 2)}</CodeBlock>
          </div>
        </details>
      )}
    </section>
  );
}
