import { artifactLabel, protocolStepLabel, type ExchangeWithDecoded } from '@playground/shared';
import { useState } from 'react';
import { ArrowRightIcon } from '../../components/icons';
import { Badge, cx, EmptyState, Tabs } from '../../components/ui';
import { namedMessages, partyLabel, phaseOf, shortUrl, type InspectorPhase } from './messages';

const FILTERS: Array<{ id: 'all' | InspectorPhase; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'issue', label: 'Issue' },
  { id: 'present', label: 'Present' },
  { id: 'verify', label: 'Verify' },
];

function StatusChip({ ex }: { ex: ExchangeWithDecoded }) {
  if (ex.outOfBand) return <Badge tone="accent">QR / link</Badge>;
  if (ex.status === undefined) return <Badge>…</Badge>;
  return (
    <Badge tone={ex.status >= 400 ? 'bad' : ex.status >= 300 ? 'warn' : 'ok'} mono>
      {ex.status}
    </Badge>
  );
}

export function ExchangeList({
  exchanges,
  selectedId,
  onSelect,
}: {
  exchanges: ExchangeWithDecoded[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | InspectorPhase>('all');
  const shown = exchanges.filter((e) => filter === 'all' || phaseOf(e.step) === filter);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <Tabs label="Filter messages by phase" size="sm" items={FILTERS} value={filter} onChange={setFilter} />
        <span className="text-[11px] text-muted">{shown.length} messages</span>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No messages yet">Messages appear here as the protocol tap records them.</EmptyState>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto" aria-label="Protocol messages">
          {shown.map((ex) => {
            const named = namedMessages(ex).filter((k) => artifactLabel(k) !== protocolStepLabel(ex.step));
            const selected = ex.id === selectedId;
            return (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ex.id)}
                  aria-current={selected ? 'true' : undefined}
                  data-exchange-id={ex.id}
                  className={cx(
                    'flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left',
                    selected ? 'bg-accent-soft' : 'hover:bg-surface-2',
                    !ex.outOfBand && ex.status !== undefined && ex.status >= 400 && 'border-l-2 border-l-bad',
                  )}
                >
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="font-mono">#{ex.seq}</span>
                    <span className="font-mono">{new Date(ex.ts).toLocaleTimeString(undefined, { hour12: false })}</span>
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      {partyLabel(ex.from)} <ArrowRightIcon width={11} height={11} /> {partyLabel(ex.component)}
                    </span>
                    <span className="ml-auto">
                      <StatusChip ex={ex} />
                    </span>
                  </div>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[11px] font-semibold">{ex.outOfBand ? 'OOB' : ex.method}</span>
                    <span className="truncate font-mono text-xs" title={ex.url}>
                      {shortUrl(ex.url)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-xs">{protocolStepLabel(ex.step)}</span>
                    {named.map((k) => (
                      <Badge key={k} tone="accent">
                        {artifactLabel(k)}
                      </Badge>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
