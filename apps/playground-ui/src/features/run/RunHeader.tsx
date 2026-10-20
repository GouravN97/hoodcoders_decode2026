import { formatLabel, type CatalogEntry, type RunDetail, type RunState } from '@playground/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCancelRun } from '../../api/queries';
import { ArrowRightIcon } from '../../components/icons';
import { Badge, Button, buttonClass, PageHeader, type Tone } from '../../components/ui';
import { isTerminal } from '../../realtime/runReducer';

const STATE_TONE: Partial<Record<RunState, Tone>> = {
  Reported: 'ok',
  Aborted: 'bad',
  Cancelled: 'neutral',
};

export function Elapsed({ from, to }: { from: string; to?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (to) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [to]);
  const s = Math.max(0, Math.round(((to ? new Date(to).getTime() : now) - new Date(from).getTime()) / 1000));
  return <span className="tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}

export function RunHeader({ run, catalog }: { run: RunDetail; catalog: CatalogEntry[] }) {
  const cancel = useCancelRun(run.id);
  const name = (id: string) => catalog.find((c) => c.id === id)?.displayName ?? id;
  const terminal = isTerminal(run);

  return (
    <PageHeader
      title={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {name(run.config.issuerId)}
          <ArrowRightIcon className="text-muted" />
          {name(run.config.walletId)}
          <ArrowRightIcon className="text-muted" />
          {name(run.config.verifierId)}
        </span>
      }
      description={
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="accent">{formatLabel(run.config.format)}</Badge>
          <Badge mono>{run.config.format}</Badge>
          <Badge tone={STATE_TONE[run.state] ?? 'accent'}>{run.state}</Badge>
          {run.correlation === 'heuristic' && (
            <Badge tone="warn" title="Messages were linked to this run by time window, not by an exact identifier">
              heuristic correlation
            </Badge>
          )}
          <span className="font-mono" title={run.id}>run {run.id.slice(0, 8)}</span>
        </div>
      }
      actions={
        <>
          {!terminal && (
            <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              Cancel run
            </Button>
          )}
          <Link to="/" className={buttonClass({ variant: 'primary' })}>
            New run
          </Link>
        </>
      }
    />
  );
}
