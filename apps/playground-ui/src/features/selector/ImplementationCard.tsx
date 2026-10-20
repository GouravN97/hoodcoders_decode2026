import { formatLabel, type CatalogEntry } from '@playground/shared';
import { Badge, cx } from '../../components/ui';

const HEALTH = {
  up: { dot: 'bg-ok', label: 'Online' },
  down: { dot: 'bg-bad', label: 'Offline' },
  unknown: { dot: 'bg-muted', label: 'Unknown' },
} as const;

const VENDOR_LABEL = { inji: 'Inji', mock: 'Mock', external: 'External' } as const;

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
  return (
    <label
      title={disabledReason}
      className={cx(
        'relative flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-[background-color,border-color,box-shadow]',
        selected ? 'border-accent bg-accent-soft/60 ring-1 ring-accent' : 'border-border bg-surface hover:border-muted/60',
        disabled && 'cursor-not-allowed opacity-55 hover:border-border',
      )}
    >
      <input
        type="radio"
        name={`role-${entry.role}`}
        value={entry.id}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
        aria-describedby={`${entry.id}-meta`}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cx(
              'grid size-4 shrink-0 place-items-center rounded-full border',
              selected ? 'border-accent' : 'border-border',
            )}
          >
            {selected && <span className="size-2 rounded-full bg-accent" />}
          </span>
          <span className="text-sm font-semibold leading-tight">{entry.displayName}</span>
        </div>
        <Badge tone={entry.vendor === 'inji' ? 'accent' : 'neutral'}>{VENDOR_LABEL[entry.vendor]}</Badge>
      </div>
      <div id={`${entry.id}-meta`} className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className={cx('size-1.5 rounded-full', health.dot)} aria-hidden />
          {health.label}
        </span>
        {entry.version && <span className="font-mono">v{entry.version}</span>}
        <span>{human ? 'Needs a person' : 'Automatic'}</span>
      </div>
      <div className="flex flex-wrap gap-1 pl-6">
        {entry.capabilities.formats.map((f) => (
          <Badge key={f} mono title={formatLabel(f)}>
            {f}
          </Badge>
        ))}
      </div>
      {disabledReason && <p className="pl-6 text-xs text-bad">{disabledReason}</p>}
    </label>
  );
}
