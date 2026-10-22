import { outcomeLabel, stepLabel, type ExchangeWithDecoded, type RunDetail } from '@playground/shared';
import { ActivityIcon, CheckIcon, ClockIcon, MessagesIcon } from '../../components/icons';
import { Badge, cx, StatCard } from '../../components/ui';
import { Elapsed } from './RunHeader';

const OUTCOME_TEXT = { VALID: 'text-ok', INVALID: 'text-bad', EXPIRED: 'text-warn', REVOKED: 'text-bad' } as const;

/** KPI row for a run: step progress, captured messages, elapsed time and the verifier's answer. */
export function RunStats({ run, exchanges }: { run: RunDetail; exchanges: ExchangeWithDecoded[] }) {
  const counted = run.steps.filter((s) => s.status !== 'skipped');
  const done = counted.filter((s) => s.status === 'done').length;
  const active = run.steps.find((s) => s.status === 'active');
  const problems = run.steps.filter((s) => s.status === 'failed' || s.status === 'inconclusive').length;
  const httpErrors = exchanges.filter((e) => !e.outOfBand && e.status !== undefined && e.status >= 400).length;
  const outcome = run.result?.outcome ?? run.observedOutcome;
  const pct = counted.length ? Math.round((done / counted.length) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 xl:grid-cols-4 dashdark:gap-3" aria-label="Run summary">
      <StatCard
        icon={<ActivityIcon width={22} height={22} />}
        label="Steps done"
        value={`${done}/${counted.length}`}
        chip={problems > 0 ? <Badge tone="bad">{problems} with problems</Badge> : <Badge tone="accent">{pct}%</Badge>}
        footer={active ? `Now: ${stepLabel(active.step)}` : run.finishedAt ? 'Run finished' : 'Waiting to start'}
      />
      <StatCard
        icon={<MessagesIcon width={22} height={22} />}
        label="Messages captured"
        value={exchanges.length}
        chip={exchanges.length > 0 && (httpErrors > 0 ? <Badge tone="bad">{httpErrors} HTTP errors</Badge> : <Badge tone="ok">no errors</Badge>)}
        footer="Recorded by the protocol tap"
      />
      <StatCard
        icon={<ClockIcon width={22} height={22} />}
        label="Elapsed"
        value={<Elapsed from={run.createdAt} to={run.finishedAt} />}
        footer={`Started ${new Date(run.createdAt).toLocaleTimeString()}`}
      />
      <StatCard
        icon={<CheckIcon width={22} height={22} />}
        label="Verifier result"
        value={
          outcome ? (
            <span className={cx(outcome in OUTCOME_TEXT ? OUTCOME_TEXT[outcome as keyof typeof OUTCOME_TEXT] : 'text-muted')}>
              {outcomeLabel(outcome)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )
        }
        chip={
          outcome && (
            <Badge tone={outcome === run.config.expectedOutcome ? 'ok' : 'bad'}>
              {outcome === run.config.expectedOutcome ? 'as expected' : 'unexpected'}
            </Badge>
          )
        }
        footer={`Expected ${outcomeLabel(run.config.expectedOutcome)}`}
      />
    </div>
  );
}
