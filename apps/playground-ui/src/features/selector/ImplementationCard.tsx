import { formatLabel, type CatalogEntry } from '@playground/shared';
import { CheckIcon } from '../../components/icons';
import { Badge, cx } from '../../components/ui';

const HEALTH = {
  up: { dot: 'bg-ok', label: 'Online', text: 'text-ok' },
  down: { dot: 'bg-bad', label: 'Offline', text: 'text-bad' },
  unknown: { dot: 'bg-muted', label: 'Status unknown', text: 'text-muted' },
} as const;

const VENDOR_LABEL = { inji: 'Inji', mock: 'Mock', external: 'External' } as const;

/**
 * One choice in a role's row: name, online status and description, then formats. A radio underneath (visually
 * hidden), so the row behaves as a radio group: click or arrow keys to choose.
 */
export function ImplementationCard({
  entry,
  selected,
  disabledReason,
  onSelect,
}: {
  entry: CatalogEntry;
  selected: boolean;
  disabledReason?: string;
  onSelect: () => void;
}) {
  const disabled = Boolean(disabledReason);
  const health = HEALTH[entry.health];
  const human = entry.capabilities.automation === 'human-in-the-loop';
  const detailsId = `${entry.id}-details`;
  return (
    <label
      title={disabledReason}
      data-testid={`choice-${entry.id}`}
      className={cx(
        'relative flex w-72 shrink-0 snap-start flex-col gap-3 rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow,opacity]',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent dashdark:rounded-xl',
        selected ? 'border-accent ring-1 ring-accent' : 'border-border',
        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
        !selected && !disabled && 'hover:border-accent/50',
      )}
    >
      <input
        type="radio"
        name={`role-${entry.role}`}
        value={entry.id}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        aria-label={entry.displayName}
        aria-describedby={detailsId}
        className="sr-only"
      />
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg font-medium leading-snug tracking-tight dashdark:font-semibold">{entry.displayName}</span>
        {selected ? (
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
            <CheckIcon width={14} height={14} strokeWidth={2.5} />
          </span>
        ) : (
          <Badge tone={entry.vendor === 'inji' ? 'accent' : 'neutral'}>{VENDOR_LABEL[entry.vendor]}</Badge>
        )}
      </div>
      <div id={detailsId} className="flex flex-1 flex-col gap-3">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className={cx('inline-flex items-center gap-1.5 font-medium', health.text)}>
            <span className={cx('size-2 rounded-full', health.dot)} aria-hidden />
            {health.label}
          </span>
          {entry.version && <span className="font-mono text-xs text-muted">v{entry.version}</span>}
          <span className="text-muted">{human ? 'Needs a person' : 'Automatic'}</span>
        </p>
        {entry.description && <p className="text-[13px] leading-relaxed text-muted">{entry.description}</p>}
        <div className="mt-auto flex flex-wrap gap-1">
          {entry.capabilities.formats.map((f) => (
            <Badge key={f} mono title={formatLabel(f)}>
              {f}
            </Badge>
          ))}
        </div>
        {disabledReason && <p className="text-xs font-medium text-bad">{disabledReason}</p>}
      </div>
    </label>
  );
}
