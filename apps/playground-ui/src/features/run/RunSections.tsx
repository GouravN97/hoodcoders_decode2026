import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { IssuerIcon } from '../../components/icons';
import { cx } from '../../components/ui';

export type RunSectionId = 'credential' | 'inspector' | 'report';

export interface RunSection {
  id: RunSectionId;
  label: string;
  /** Label for the three-across row on narrow screens. */
  shortLabel: string;
  /** Short status under the label, e.g. "14 messages". */
  meta: ReactNode;
  Icon: typeof IssuerIcon;
  content: ReactNode;
}

const NEXT_KEYS = ['ArrowDown', 'ArrowRight'];
const PREV_KEYS = ['ArrowUp', 'ArrowLeft'];

/**
 * Side menu for a run's detail views: one section shows at a time. A vertical tab list beside the panel on wide
 * screens, a horizontal row above it on narrow ones. Hidden panels stay mounted so their state (inspector filters,
 * revealed secrets) survives switching back and forth.
 */
export function RunSections({
  sections,
  value,
  onChange,
}: {
  sections: RunSection[];
  value: RunSectionId;
  onChange: (id: RunSectionId) => void;
}) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = sections.findIndex((s) => s.id === value);
    let next = -1;
    if (NEXT_KEYS.includes(e.key)) next = (i + 1) % sections.length;
    else if (PREV_KEYS.includes(e.key)) next = (i - 1 + sections.length) % sections.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = sections.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(sections[next]!.id);
    tabs.current[next]?.focus();
  };

  return (
    <div id="run-sections" className="grid scroll-mt-4 grid-cols-1 items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div
        role="tablist"
        aria-label="Run details"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1.5 lg:sticky lg:top-4 lg:flex lg:flex-col"
      >
        {sections.map((s, i) => {
          const selected = s.id === value;
          return (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`run-tab-${s.id}`}
              aria-label={s.label}
              aria-selected={selected}
              aria-controls={`run-panel-${s.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(s.id)}
              className={cx(
                'relative flex min-w-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-center transition-colors lg:flex-row lg:gap-2.5 lg:px-3 lg:text-left',
                selected ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent max-lg:hidden" />}
              <s.Icon width={16} height={16} className={selected ? 'text-accent' : undefined} />
              <span className="flex w-full min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] font-medium">
                  <span className="lg:hidden">{s.shortLabel}</span>
                  <span className="max-lg:hidden">{s.label}</span>
                </span>
                <span className="truncate text-[11px] text-muted">{s.meta}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="min-w-0">
        {sections.map((s) => (
          <div key={s.id} role="tabpanel" id={`run-panel-${s.id}`} aria-labelledby={`run-tab-${s.id}`} hidden={s.id !== value}>
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
}
