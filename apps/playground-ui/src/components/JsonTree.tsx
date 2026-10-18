// Collapsible JSON viewer for decoded payloads.
import { cx } from './ui';

function Scalar({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted">null</span>;
  if (typeof value === 'string')
    return <span className="break-all text-ok">&quot;{value}&quot;</span>;
  if (typeof value === 'number') return <span className="text-accent">{value}</span>;
  if (typeof value === 'boolean') return <span className="text-warn">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function Node({ name, value, depth, openDepth }: { name?: string; value: unknown; depth: number; openDepth: number }) {
  const label = name !== undefined && <span className="text-fg">{name}: </span>;
  if (value === null || typeof value !== 'object') {
    return (
      <div className="pl-4">
        {label}
        <Scalar value={value} />
      </div>
    );
  }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  if (entries.length === 0) {
    return (
      <div className="pl-4">
        {label}
        <span className="text-muted">{open + close}</span>
      </div>
    );
  }
  return (
    <details open={depth < openDepth} className={cx(depth > 0 && 'pl-4', 'group')}>
      <summary className="-ml-4 cursor-pointer list-none pl-4 marker:hidden hover:bg-surface-2">
        <span className="mr-1 inline-block w-3 text-muted transition-transform group-open:rotate-90">›</span>
        {label}
        <span className="text-muted">
          {open}
          <span className="group-open:hidden"> {entries.length} {Array.isArray(value) ? 'items' : 'keys'} {close}</span>
        </span>
      </summary>
      {entries.map(([k, v]) => (
        <Node key={k} name={Array.isArray(value) ? undefined : k} value={v} depth={depth + 1} openDepth={openDepth} />
      ))}
      <div className="text-muted">{close}</div>
    </details>
  );
}

export function JsonTree({ value, openDepth = 3 }: { value: unknown; openDepth?: number }) {
  return (
    <div className="font-mono text-xs leading-5">
      <Node value={value} depth={0} openDepth={openDepth} />
    </div>
  );
}

export function CodeBlock({ children, className }: { children: string; className?: string }) {
  return (
    <pre className={cx('max-h-[28rem] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-code p-3 font-mono text-xs leading-5', className)}>
      {children}
    </pre>
  );
}
