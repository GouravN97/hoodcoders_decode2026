import { formatLabel, type CatalogEntry } from '@playground/shared';
import { Badge, cx } from '../../components/ui';

const HEALTH = {
  up: { dot: 'bg-ok', label: 'Online' },
  down: { dot: 'bg-bad', label: 'Offline' },
  unknown: { dot: 'bg-muted', label: 'Unknown' },
} as const;

const VENDOR_LABEL = { inji: 'Inji', mock: 'Mock', external: 'External' } as const;

/** Details of the implementation chosen for a role: vendor, health, version, automation and formats. */
export function ImplementationCard({ entry, problem }: { entry: CatalogEntry; problem?: string }) {
  const health = HEALTH[entry.health];
  const human = entry.capabilities.automation === 'human-in-the-loop';
  return (
    <div
      className={cx(
        'flex flex-col gap-2 rounded-lg border bg-accent-soft/60 p-3',
        problem ? 'border-bad/50' : 'border-accent/50',
      )}
      data-testid={`selected-${entry.role}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-tight">{entry.displayName}</span>
        <Badge tone={entry.vendor === 'inji' ? 'accent' : 'neutral'}>{VENDOR_LABEL[entry.vendor]}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className={cx('size-1.5 rounded-full', health.dot)} aria-hidden />
          {health.label}
        </span>
        {entry.version && <span className="font-mono">v{entry.version}</span>}
        <span>{human ? 'Needs a person' : 'Automatic'}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {entry.capabilities.formats.map((f) => (
          <Badge key={f} mono title={formatLabel(f)}>
            {f}
          </Badge>
        ))}
      </div>
      {problem && <p className="text-xs text-bad">{problem}</p>}
    </div>
  );
}
