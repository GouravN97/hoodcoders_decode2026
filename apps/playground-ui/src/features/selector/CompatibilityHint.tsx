import { roleLabel, type RunConfig } from '@playground/shared';
import { usePrediction } from '../../api/queries';
import { AlertIcon, CheckIcon } from '../../components/icons';
import { cx, Spinner } from '../../components/ui';
import { useDebounced } from '../../hooks/useDebounced';

export function CompatibilityHint({ config }: { config: RunConfig | null }) {
  const debounced = useDebounced(config, 250);
  const { data, isFetching, isError } = usePrediction(debounced);

  if (!config) return null;
  if (isError) return <p className="text-xs text-muted">Compatibility prediction unavailable.</p>;
  if (!data) return <p className="flex items-center gap-2 text-xs text-muted"><Spinner className="size-3" /> Checking compatibility…</p>;

  const unsupported = data.status === 'unsupported';
  return (
    <div
      aria-live="polite"
      className={cx(
        'rounded-lg border px-3 py-2 text-[13px]',
        unsupported ? 'border-warn/30 bg-warn-soft' : 'border-border bg-surface-2',
        isFetching && 'opacity-70',
      )}
    >
      <p className={cx('flex items-center gap-1.5 font-medium', unsupported ? 'text-warn' : 'text-ok')}>
        {unsupported ? <AlertIcon /> : <CheckIcon />}
        {unsupported ? 'Predicted not to work' : data.status === 'supported' ? 'Expected to work' : 'No prediction'}
      </p>
      {data.reasons.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
          {data.reasons.map((r, i) => (
            <li key={i} className={cx(r.severity === 'error' && 'text-warn')}>
              {r.role && <span className="font-medium">{roleLabel(r.role)}: </span>}
              {r.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
