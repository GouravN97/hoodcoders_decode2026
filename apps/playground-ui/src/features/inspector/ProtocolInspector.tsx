import type { CatalogEntry, ExchangeWithDecoded, RunDetail } from '@playground/shared';
import { useCallback, useRef, useState } from 'react';
import { EyeIcon, MessagesIcon } from '../../components/icons';
import { Card, cx, EmptyState, SectionTitle, Tabs } from '../../components/ui';
import { ExchangeDetail } from './ExchangeDetail';
import { ExchangeList } from './ExchangeList';
import { SequenceDiagramView } from './SequenceDiagramView';

type Layout = 'list' | 'sequence';

export function ProtocolInspector({
  exchanges,
  selectedId,
  onSelect,
  loading,
  run,
  catalog = [],
}: {
  exchanges: ExchangeWithDecoded[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  /** With the run, the inspector can also show the messages as a sequence diagram. */
  run?: RunDetail;
  catalog?: CatalogEntry[];
}) {
  const [reveal, setReveal] = useState(false);
  const [layout, setLayout] = useState<Layout>('list');
  const sequence = layout === 'sequence' && run;
  const selected = exchanges.find((e) => e.id === selectedId) ?? exchanges.at(-1);
  const detail = useRef<HTMLDivElement>(null);
  // Under the diagram the detail can be off screen: bring it up after an arrow is clicked.
  const selectFromDiagram = useCallback(
    (id: string) => {
      onSelect(id);
      requestAnimationFrame(() =>
        detail.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      );
    },
    [onSelect],
  );

  return (
    <Card
      id="inspector"
      aria-label="Protocol inspector"
      className="flex min-w-0 flex-col overflow-hidden"
    >
      <SectionTitle
        icon={<MessagesIcon width={16} height={16} />}
        aside={
          <div className="flex flex-wrap items-center gap-3">
            {run && (
              <Tabs
                label="Show messages as"
                size="sm"
                value={layout}
                onChange={setLayout}
                items={[
                  { id: 'list', label: 'List' },
                  { id: 'sequence', label: 'Sequence' },
                ]}
              />
            )}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={reveal}
                onChange={(e) => setReveal(e.target.checked)}
                className="accent-[var(--c-accent)]"
              />
              <EyeIcon width={14} height={14} strokeWidth={1.5} /> Reveal secrets
            </label>
          </div>
        }
      >
        Protocol inspector
      </SectionTitle>
      <div
        className={cx(
          'grid min-h-[28rem] grid-cols-1 border-t border-border',
          // The diagram needs the full width; the selected message's detail goes underneath.
          !sequence && 'md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]',
        )}
      >
        <div
          className={cx(
            'flex min-h-0 flex-col border-b border-border',
            sequence
              ? 'max-h-[44rem]'
              : 'max-h-[36rem] md:max-h-[48rem] md:border-b-0 md:border-r',
          )}
        >
          {sequence ? (
            <SequenceDiagramView
              run={run}
              exchanges={exchanges}
              catalog={catalog}
              selectedId={selected?.id}
              onSelect={selectFromDiagram}
            />
          ) : (
            <ExchangeList exchanges={exchanges} selectedId={selected?.id} onSelect={onSelect} />
          )}
        </div>
        <div ref={detail} className="min-w-0 scroll-mt-4">
          {selected ? (
            <ExchangeDetail key={selected.id} exchange={selected} reveal={reveal} />
          ) : (
            <EmptyState title={loading ? 'Loading messages…' : 'No message selected'}>
              Every request and response between the issuer, wallet and verifier shows up here, raw
              and decoded.
            </EmptyState>
          )}
        </div>
      </div>
    </Card>
  );
}
