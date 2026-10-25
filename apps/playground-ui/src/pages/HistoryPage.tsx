// Run history and the interoperability matrix (plan §9.1 /history, good-to-have G5). Filters live
// in the URL, so a filtered view can be shared; the matrix exports as the Markdown deliverable.
import {
  formatLabel,
  matrixCellText,
  modeLabel,
  outcomeLabel,
  RUN_FILTER_KEYS,
  runUsesRole,
  TAMPER_CATALOGUE,
  verdictLabel,
  type InteropVerdict,
  type Matrix,
  type RunParticipant,
  type RunsQuery,
  type RunSummary,
} from '@playground/shared';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { useMatrix, useRuns } from '../api/queries';
import { DownloadIcon } from '../components/icons';
import {
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  SectionTitle,
  selectClass,
  Spinner,
  Tabs,
  type Tone,
} from '../components/ui';
import { saveText } from '../features/report/download';

type Tab = 'runs' | 'matrix';
type FilterKey = (typeof RUN_FILTER_KEYS)[number];

const VERDICT_TONE: Record<InteropVerdict, Tone> = {
  PASS: 'ok',
  PASS_WITH_WARNINGS: 'warn',
  FAIL: 'bad',
  INCONCLUSIVE: 'neutral',
  NOT_APPLICABLE: 'neutral',
};

const LABEL: Record<FilterKey, string> = {
  issuer: 'Issuer',
  issuerVersion: 'Issuer version',
  wallet: 'Wallet',
  walletVersion: 'Wallet version',
  verifier: 'Verifier',
  verifierVersion: 'Verifier version',
  format: 'Format',
  mode: 'Run mode',
  outcome: 'Verifier result',
  verdict: 'Verdict',
  tamper: 'Tamper',
  from: 'From',
  to: 'To',
};

const who = (p: RunParticipant) => (
  <span className="whitespace-nowrap">
    {p.name} <span className="font-mono text-[11px] text-muted">{p.version}</span>
  </span>
);

const sorted = <T,>(values: Iterable<T>) => [...new Set(values)].sort();

/** The options each filter offers, from the runs there are. */
function filterOptions(runs: RunSummary[], q: RunsQuery): Record<FilterKey, Array<{ value: string; label: string }>> {
  const role = (key: 'issuer' | 'wallet' | 'verifier') =>
    sorted(runs.map((r) => `${r[key].id}\t${r[key].name}`)).map((v) => {
      const [value = '', label = value] = v.split('\t');
      return { value, label };
    });
  // Versions of the chosen implementation, or of every implementation in that role.
  const version = (key: 'issuer' | 'wallet' | 'verifier') =>
    sorted(runs.filter((r) => !q[key] || r[key].id === q[key]).map((r) => r[key].version)).map((v) => ({ value: v, label: v }));
  const plain = <T extends string>(values: T[], label: (v: T) => string) =>
    sorted(values).map((v) => ({ value: v, label: label(v) }));
  return {
    issuer: role('issuer'),
    issuerVersion: version('issuer'),
    wallet: role('wallet'),
    walletVersion: version('wallet'),
    verifier: role('verifier'),
    verifierVersion: version('verifier'),
    format: plain(runs.map((r) => r.format), (f) => `${formatLabel(f)} (${f})`),
    mode: plain(runs.map((r) => r.mode), modeLabel),
    outcome: plain(runs.flatMap((r) => (r.observedOutcome ? [r.observedOutcome] : [])), outcomeLabel),
    verdict: plain(runs.flatMap((r) => (r.verdict ? [r.verdict] : [])), verdictLabel),
    tamper: [
      { value: 'none', label: 'No tamper' },
      { value: 'any', label: 'Any tamper' },
      ...TAMPER_CATALOGUE.filter((t) => runs.some((r) => r.tamper === t.id)).map((t) => ({ value: t.id, label: `${t.label} (${t.id})` })),
    ],
    from: [],
    to: [],
  };
}

function Filters({ runs, query, set }: { runs: RunSummary[]; query: RunsQuery; set: (key: FilterKey, value: string) => void }) {
  const options = useMemo(() => filterOptions(runs, query), [runs, query]);
  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" aria-label="Filters" role="group">
      {RUN_FILTER_KEYS.map((key) =>
        key === 'from' || key === 'to' ? (
          <Field key={key} label={LABEL[key]} htmlFor={`filter-${key}`}>
            <input
              id={`filter-${key}`}
              type="date"
              className={selectClass}
              value={query[key] ?? ''}
              onChange={(e) => set(key, e.target.value)}
            />
          </Field>
        ) : (
          <Field key={key} label={LABEL[key]} htmlFor={`filter-${key}`}>
            <select id={`filter-${key}`} className={selectClass} value={String(query[key] ?? '')} onChange={(e) => set(key, e.target.value)}>
              <option value="">All</option>
              {options[key].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        ),
      )}
    </div>
  );
}

function RunsTable({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) return <EmptyState title="No runs match">Change or clear the filters.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]" aria-label="Runs">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            {['When', 'Verdict', 'Issuer', 'Wallet', 'Verifier', 'Format', 'Mode', 'Tamper', 'Expected → result'].map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-2 font-medium first:pl-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const verifies = runUsesRole(r.mode, 'verifier');
            return (
              <tr key={r.id} className="border-b border-border align-top last:border-b-0 hover:bg-surface-2">
                <td className="whitespace-nowrap px-2 py-2">
                  <Link to={`/runs/${r.id}`} className="text-accent underline-offset-2 hover:underline">
                    {new Date(r.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                  </Link>
                  {r.labels?.sample === 'true' && (
                    <span className="ml-1.5">
                      <Badge tone="warn">sample</Badge>
                    </span>
                  )}
                </td>
                <td className="px-2 py-2" title={r.errorSummary}>
                  {r.verdict ? <Badge tone={VERDICT_TONE[r.verdict]}>{verdictLabel(r.verdict)}</Badge> : <Badge>{r.state}</Badge>}
                </td>
                <td className="px-2 py-2">{runUsesRole(r.mode, 'issuer') ? who(r.issuer) : <span className="text-muted">—</span>}</td>
                <td className="px-2 py-2">{who(r.wallet)}</td>
                <td className="px-2 py-2">{verifies ? who(r.verifier) : <span className="text-muted">—</span>}</td>
                <td className="px-2 py-2">
                  <Badge mono>{r.format}</Badge>
                </td>
                <td className="whitespace-nowrap px-2 py-2">{modeLabel(r.mode)}</td>
                <td className="px-2 py-2">{r.tamper ? <Badge tone="bad" mono>{r.tamper}</Badge> : <span className="text-muted">—</span>}</td>
                <td className="whitespace-nowrap px-2 py-2">
                  {verifies ? (
                    <>
                      {outcomeLabel(r.expectedOutcome)} → <strong>{r.observedOutcome ? outcomeLabel(r.observedOutcome) : '—'}</strong>
                    </>
                  ) : (
                    <span className="text-muted">issue only</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatrixGrid({ matrix }: { matrix: Matrix }) {
  if (matrix.rows.length === 0) return <EmptyState title="No finished runs yet">The matrix fills in as runs finish.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]" aria-label="Interoperability matrix">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th className="px-2 py-2 font-medium">Issuer</th>
            <th className="px-2 py-2 font-medium">Wallet</th>
            <th className="px-2 py-2 font-medium">Verifier</th>
            {matrix.formats.map((f) => (
              <th key={f} className="whitespace-nowrap px-2 py-2 font-mono font-medium" title={formatLabel(f)}>
                {f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={`${row.issuer.id}@${row.issuer.version}|${row.wallet.id}@${row.wallet.version}|${row.verifier?.id ?? ''}@${row.verifier?.version ?? ''}`} className="border-b border-border align-top last:border-b-0">
              <td className="px-2 py-2">{who(row.issuer)}</td>
              <td className="px-2 py-2">{who(row.wallet)}</td>
              <td className="px-2 py-2">{row.verifier ? who(row.verifier) : <span className="text-muted">— issue only</span>}</td>
              {matrix.formats.map((f) => {
                const cell = row.cells[f];
                return (
                  <td key={f} className="px-2 py-2">
                    {cell ? (
                      <Link
                        to={`/runs/${cell.latest.id}`}
                        title={`Latest run ${new Date(cell.latest.createdAt).toLocaleString()}${cell.latest.errorSummary ? `: ${cell.latest.errorSummary}` : ''}`}
                        className="inline-flex flex-col gap-0.5"
                        data-testid={`matrix-cell-${f}`}
                      >
                        <Badge tone={VERDICT_TONE[cell.latest.verdict!]}>{matrixCellText(cell).replace(/^\S+ /, '')}</Badge>
                        <span className="text-[11px] text-muted">{new Date(cell.latest.createdAt).toLocaleDateString()}</span>
                      </Link>
                    ) : (
                      <span className="text-muted">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixPanel() {
  const [includeNegative, setIncludeNegative] = useState(false);
  const matrix = useMatrix(includeNegative);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exportMarkdown = async () => {
    setBusy(true);
    try {
      const text = await api.matrixMarkdown(includeNegative);
      setMarkdown(text);
      saveText(text, 'interop-matrix.md');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card aria-label="Interoperability matrix">
      <SectionTitle
        aside={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={includeNegative} onChange={(e) => setIncludeNegative(e.target.checked)} className="accent-[var(--c-accent)]" />
              Include negative tests
            </label>
            {markdown && <CopyButton text={markdown} label="Copy Markdown" />}
            <Button size="sm" className="pl-2" onClick={() => void exportMarkdown()} disabled={busy}>
              {busy ? <Spinner className="size-3.5" /> : <DownloadIcon width={14} height={14} />}
              Export Markdown
            </Button>
          </div>
        }
      >
        Interoperability matrix
      </SectionTitle>
      <p className="px-4 pb-3 text-xs text-muted">
        The latest run of each issuer × wallet × verifier × format, with the module versions it ran against. A new version starts a new row,
        so regressions across releases stay visible. Negative tests (tampers, runs expecting Invalid or Expired) are left out unless
        included, so each cell says whether the normal path works.
      </p>
      {matrix.isPending ? (
        <p className="flex items-center gap-2 px-4 py-6 text-[13px] text-muted">
          <Spinner /> Building the matrix…
        </p>
      ) : matrix.isError ? (
        <div className="p-4">
          <ErrorNote title="Could not load the matrix" error={matrix.error} />
        </div>
      ) : (
        <MatrixGrid matrix={matrix.data} />
      )}
    </Card>
  );
}

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'matrix' ? 'matrix' : 'runs';
  const query = useMemo(() => {
    const q: Record<string, string> = {};
    for (const key of RUN_FILTER_KEYS) {
      const v = params.get(key);
      if (v) q[key] = v;
    }
    return q as RunsQuery;
  }, [params]);
  const all = useRuns({});
  const filtered = useRuns(query as Record<string, string>);
  const samples = (all.data ?? []).filter((r) => r.labels?.sample === 'true').length;
  const active = Object.keys(query).length;

  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Run history"
        description="Every saved run, filterable by module version, format, outcome, run mode, tamper and date, and the interoperability matrix built from them."
      />
      {samples > 0 && (
        <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]" role="note">
          <strong>Sample data:</strong> {samples} of these runs were generated by the in-browser mocks so the page has something to show.
          They are marked <Badge tone="warn">sample</Badge> and are not results. Runs you start appear alongside them.
        </p>
      )}
      <Tabs
        label="History view"
        value={tab}
        onChange={(t) => setParam('tab', t === 'runs' ? '' : t)}
        items={[
          { id: 'runs', label: 'Runs' },
          { id: 'matrix', label: 'Matrix' },
        ]}
      />
      {tab === 'runs' ? (
        <Card aria-label="Runs">
          <SectionTitle
            aside={
              <div className="flex items-center gap-3 text-xs text-muted">
                <span data-testid="run-count">
                  {filtered.data ? `${filtered.data.length} of ${all.data?.length ?? '…'} runs` : '…'}
                </span>
                {active > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setParams((p) => (RUN_FILTER_KEYS.forEach((k) => p.delete(k)), p), { replace: true })}>
                    Clear filters
                  </Button>
                )}
              </div>
            }
          >
            Runs
          </SectionTitle>
          <Filters runs={all.data ?? []} query={query} set={setParam} />
          {filtered.isPending ? (
            <p className="flex items-center gap-2 px-4 py-6 text-[13px] text-muted">
              <Spinner /> Loading runs…
            </p>
          ) : filtered.isError ? (
            <div className="p-4">
              <ErrorNote title="Could not load the runs" error={filtered.error} />
            </div>
          ) : (
            <RunsTable runs={filtered.data} />
          )}
        </Card>
      ) : (
        <MatrixPanel />
      )}
    </div>
  );
}
