import { stepLabel, type RunStep } from '@playground/shared';
import { CodeBlock } from '../../components/JsonTree';
import { Button, cx } from '../../components/ui';

export function StepErrorPanel({ steps, onSelectExchange }: { steps: RunStep[]; onSelectExchange: (id: string) => void }) {
  const problems = steps.filter((s) => (s.status === 'failed' || s.status === 'inconclusive') && s.error);
  if (problems.length === 0) return null;
  return (
    <>
      {problems.map((s) => {
        const failed = s.status === 'failed';
        return (
          <section
            key={s.step}
            role="alert"
            aria-label={`${stepLabel(s.step)} ${failed ? 'failed' : 'inconclusive'}`}
            className={cx('rounded-xl border p-4', failed ? 'border-bad/40 bg-bad-soft' : 'border-warn/40 bg-warn-soft')}
          >
            <p className={cx('text-[11px] font-medium uppercase tracking-wider', failed ? 'text-bad' : 'text-warn')}>
              {failed ? 'Step failed' : 'Step inconclusive'}
            </p>
            <p className="mt-0.5 text-base font-semibold">{stepLabel(s.step)}</p>
            <p className="mt-1 text-[13px]">
              {s.error!.message}
              {s.error!.status !== undefined && <span className="font-mono"> · HTTP {s.error!.status}</span>}
            </p>
            {s.error!.body && <CodeBlock className="mt-3 bg-surface">{s.error!.body}</CodeBlock>}
            {s.exchangeId && (
              <Button size="sm" className="mt-3" onClick={() => onSelectExchange(s.exchangeId!)}>
                Show the message
              </Button>
            )}
          </section>
        );
      })}
    </>
  );
}
