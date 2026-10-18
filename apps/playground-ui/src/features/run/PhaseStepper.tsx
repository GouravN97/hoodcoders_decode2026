import { formatDuration, phaseLabel, RUN_PHASES, stepLabel, type RunDetail } from '@playground/shared';
import { cx } from '../../components/ui';
import { EvidenceIcon, phaseStatus, STATUS_LABEL, StatusIcon } from './status';

const PHASE_TONE = {
  done: 'border-ok',
  failed: 'border-bad',
  inconclusive: 'border-warn',
  active: 'border-accent',
  skipped: 'border-border',
  pending: 'border-border',
} as const;

export function PhaseStepper({
  run,
  selectedExchangeId,
  onSelectExchange,
}: {
  run: RunDetail;
  selectedExchangeId?: string | null;
  onSelectExchange: (exchangeId: string) => void;
}) {
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Run progress">
      {RUN_PHASES.map((phase, i) => {
        const steps = run.steps.filter((s) => s.phase === phase);
        const status = phaseStatus(steps);
        return (
          <li
            key={phase}
            className={cx('rounded-xl border border-border bg-surface', 'border-t-[3px]', PHASE_TONE[status])}
            aria-label={`${phaseLabel(phase)}: ${STATUS_LABEL[status]}`}
          >
            <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                <span className="font-mono text-xs text-muted">{i + 1}</span>
                {phaseLabel(phase)}
              </span>
              <span className="text-[11px] text-muted">{STATUS_LABEL[status]}</span>
            </div>
            <ul className="flex flex-col pb-2">
              {steps.map((s) => {
                const content = (
                  <>
                    <StatusIcon status={s.status} />
                    <span className="min-w-0 flex-1 text-left leading-snug">{stepLabel(s.step)}</span>
                    {s.evidenceKind && <EvidenceIcon kind={s.evidenceKind} />}
                    <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted">
                      {s.durationMs !== undefined ? formatDuration(s.durationMs) : ''}
                    </span>
                  </>
                );
                const row = 'flex w-full items-center gap-2 px-3 py-1 text-[13px]';
                return (
                  <li key={s.step} data-step={s.step} data-status={s.status}>
                    {s.exchangeId ? (
                      <button
                        type="button"
                        onClick={() => onSelectExchange(s.exchangeId!)}
                        className={cx(row, 'hover:bg-surface-2', selectedExchangeId === s.exchangeId && 'bg-accent-soft')}
                        title="Show this message in the inspector"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className={cx(row, s.status === 'pending' && 'text-muted')}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
