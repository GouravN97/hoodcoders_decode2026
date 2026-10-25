// Before/after view of a tampered payload (plan §9.3 DiffView): what the tamper rule changed,
// field by field, the exact characters that differ, and both payloads decoded side by side.
import { tamperDefinition, type Exchange } from '@playground/shared';
import { useMemo } from 'react';
import { Badge } from '../../components/ui';
import { decodeBody } from '../../lib/decode';
import { redactText } from '../../lib/redact';
import { DecodedView } from './DecodedView';

type Tampered = NonNullable<Exchange['tampered']>;

const TARGET_LABEL: Record<NonNullable<Tampered['target']>, string> = {
  credential: 'The credential was changed before the wallet presented it.',
  vp_token: 'The vp_token itself was replayed or bound to the wrong nonce.',
  presentation: 'The credential is unchanged; the wallet presented it where it should not have.',
};

/** Splits two strings into their common prefix, the differing middles and the common suffix. */
export function splitDiff(a: string, b: string) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  return {
    prefix: a.slice(0, start),
    before: a.slice(start, a.length - end),
    after: b.slice(start, b.length - end),
    suffix: a.slice(a.length - end),
  };
}

const CONTEXT = 48;

function Excerpt({ prefix, middle, suffix, tone }: { prefix: string; middle: string; suffix: string; tone: 'bad' | 'ok' }) {
  return (
    <code className="block break-all rounded-md bg-code px-2 py-1.5 font-mono text-[11px] leading-5">
      <span className="text-muted">
        {prefix.length > CONTEXT ? '…' : ''}
        {prefix.slice(-CONTEXT)}
      </span>
      <mark className={tone === 'bad' ? 'rounded-sm bg-bad-soft px-0.5 text-bad line-through' : 'rounded-sm bg-ok-soft px-0.5 text-ok'}>
        {middle || '∅'}
      </mark>
      <span className="text-muted">
        {suffix.slice(0, CONTEXT)}
        {suffix.length > CONTEXT ? '…' : ''}
      </span>
    </code>
  );
}

export function TamperDiff({ tampered, reveal }: { tampered: Tampered; reveal: boolean }) {
  const [summary = '', ...changes] = tampered.diff.split('\n');
  const def = tamperDefinition(tampered.ruleId);
  const before = reveal ? tampered.before : redactText(tampered.before);
  const after = reveal ? tampered.after : redactText(tampered.after);
  const diff = useMemo(() => (before && after ? splitDiff(before, after) : null), [before, after]);

  return (
    <div className="flex flex-col gap-3" data-testid="tamper-diff">
      <div className="flex flex-col gap-1 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
          <Badge tone="bad" mono>
            {tampered.ruleId}
          </Badge>
          {def?.label}
        </p>
        <p className="text-[13px]">{summary}</p>
        {tampered.target && <p className="text-xs text-muted">{TARGET_LABEL[tampered.target]}</p>}
      </div>

      {changes.length > 0 && (
        <table className="w-full text-left text-xs" aria-label="Tampered fields">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Where</th>
              <th className="py-1 pr-3 font-medium">Before</th>
              <th className="py-1 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((line) => {
              const [path = line, rest = ''] = line.split(/: (.*)/s);
              const [was = '', now = ''] = rest.split(' → ');
              return (
                <tr key={line} className="border-t border-border align-top">
                  <td className="py-1 pr-3 font-mono font-semibold">{path}</td>
                  <td className="py-1 pr-3 break-all text-bad">{was}</td>
                  <td className="py-1 break-all text-ok">{now}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {diff && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Exact change</p>
          <Excerpt prefix={diff.prefix} middle={diff.before} suffix={diff.suffix} tone="bad" />
          <Excerpt prefix={diff.prefix} middle={diff.after} suffix={diff.suffix} tone="ok" />
        </div>
      )}

      {(before || after) && (
        // Full width, one after the other: the SD-JWT disclosure table needs the room to show
        // which digest no longer matches.
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted hover:text-fg">
            Before and after, decoded
          </summary>
          <div className="flex flex-col gap-4 border-t border-border p-3">
            {after && (
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">After (as presented)</p>
                <DecodedView decoded={decodeBody(after)} />
              </div>
            )}
            {before && (
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Before (as issued)</p>
                <DecodedView decoded={decodeBody(before)} />
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
