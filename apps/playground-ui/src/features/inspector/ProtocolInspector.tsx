import type { ExchangeWithDecoded } from '@playground/shared';
import { useState } from 'react';
import { EyeIcon } from '../../components/icons';
import { Card, cx, EmptyState, SectionTitle } from '../../components/ui';
import { ExchangeDetail } from './ExchangeDetail';
import { ExchangeList } from './ExchangeList';

export function ProtocolInspector({
  exchanges,
  selectedId,
  onSelect,
  loading,
}: {
  exchanges: ExchangeWithDecoded[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const selected = exchanges.find((e) => e.id === selectedId) ?? exchanges.at(-1);

  return (
    <Card id="inspector" aria-label="Protocol inspector" className="flex min-w-0 flex-col overflow-hidden">
      <SectionTitle
        aside={
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} className="accent-[var(--c-accent)]" />
            <EyeIcon width={14} height={14} strokeWidth={1.5} /> Reveal secrets
          </label>
        }
      >
        Protocol inspector
      </SectionTitle>
      <div className="grid min-h-[28rem] grid-cols-1 md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <div className={cx('flex max-h-[36rem] min-h-0 flex-col border-border md:max-h-[48rem] md:border-r', 'border-b md:border-b-0')}>
          <ExchangeList exchanges={exchanges} selectedId={selected?.id} onSelect={onSelect} />
        </div>
        <div className="min-w-0">
          {selected ? (
            <ExchangeDetail key={selected.id} exchange={selected} reveal={reveal} />
          ) : (
            <EmptyState title={loading ? 'Loading messages…' : 'No message selected'}>
              Every request and response between the issuer, wallet and verifier shows up here, raw and decoded.
            </EmptyState>
          )}
        </div>
      </div>
    </Card>
  );
}
