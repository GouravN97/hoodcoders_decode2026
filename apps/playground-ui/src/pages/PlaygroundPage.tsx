import {
  formatLabel,
  modeLabel,
  runUsesRole,
  type CatalogEntry,
  type Role,
} from '@playground/shared';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useCatalog, useCreateRun, useCredentialConfigurations } from '../api/queries';
import {
  ArrowRightIcon,
  IssuerIcon,
  LayersIcon,
  PlayIcon,
  ShieldIcon,
  WalletIcon,
} from '../components/icons';
import { Badge, Button, ErrorNote, PageHeader, Spinner, StatCard } from '../components/ui';
import { buildRunConfig, selectableFormats, supportedFlows } from '../features/selector/compat';
import { CompatibilityHint } from '../features/selector/CompatibilityHint';
import { RoleSelectorBoard } from '../features/selector/RoleSelectorBoard';
import { RunConfigPanel } from '../features/selector/RunConfigPanel';
import { useRecentRuns } from '../store/recentRuns';
import { selectedIdFor, useSelection } from '../store/selection';

const ROLE_STAT: Record<Role, { label: string; Icon: typeof IssuerIcon }> = {
  issuer: { label: 'Issuers', Icon: IssuerIcon },
  wallet: { label: 'Wallets', Icon: WalletIcon },
  verifier: { label: 'Verifiers', Icon: ShieldIcon },
};

function CatalogStats({
  entries,
  formats,
  loading,
}: {
  entries: CatalogEntry[];
  formats: string[];
  loading: boolean;
}) {
  const dash = loading ? '…' : '—';
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-8 xl:grid-cols-4 dashdark:gap-3"
      aria-label="Catalog overview"
    >
      {(Object.keys(ROLE_STAT) as Role[]).map((role) => {
        const { label, Icon } = ROLE_STAT[role];
        const ofRole = entries.filter((c) => c.role === role);
        const online = ofRole.filter((c) => c.health === 'up').length;
        return (
          <StatCard
            key={role}
            icon={<Icon width={22} height={22} />}
            label={label}
            value={ofRole.length || dash}
            chip={
              ofRole.length > 0 && (
                <Badge tone={online === ofRole.length ? 'ok' : online === 0 ? 'bad' : 'warn'}>
                  {online} online
                </Badge>
              )
            }
            footer={ofRole.map((c) => c.displayName).join(', ') || 'None in the catalog'}
          />
        );
      })}
      <StatCard
        icon={<LayersIcon width={22} height={22} />}
        label="Formats to test"
        value={loading ? dash : formats.length}
        footer={formats.length > 0 ? formats.join(', ') : 'For the current selection'}
      />
    </div>
  );
}

/** "a", "a and b", "a, b and c" */
const listJoin = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export function PlaygroundPage() {
  const catalog = useCatalog();
  const selection = useSelection();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const createRun = useCreateRun();
  const addRecent = useRecentRuns((s) => s.add);

  const entries = useMemo(() => catalog.data ?? [], [catalog.data]);
  const pick = (role: Role) =>
    entries.find((c) => c.role === role && c.id === selectedIdFor(selection, role));
  const issuer = pick('issuer');
  const wallet = pick('wallet');
  const verifier = pick('verifier');
  const missingRoles = (['issuer', 'wallet', 'verifier'] as const).filter(
    (r) => !{ issuer, wallet, verifier }[r],
  );

  const configs = useCredentialConfigurations(issuer?.id);
  const formats = useMemo(
    () => selectableFormats(selection.mode, issuer, wallet, verifier),
    [selection.mode, issuer, wallet, verifier],
  );
  const flows = useMemo(() => supportedFlows(wallet, verifier), [wallet, verifier]);
  const credentialConfig = configs.data?.find(
    (c) => c.id === selection.credentialConfigurationId && c.format === selection.format,
  );
  const config = buildRunConfig(
    selection,
    issuer,
    wallet,
    verifier,
    credentialConfig,
    params.get('scenario'),
  );

  const start = () => {
    if (missingRoles.length > 0 || !config) return;
    createRun.mutate(config, {
      onSuccess: ({ id }) => {
        addRecent({
          id,
          title: [issuer, wallet, verifier]
            .filter((c) => c && runUsesRole(config.mode, c.role))
            .map((c) => c?.displayName)
            .join(' → '),
          wallet: wallet?.displayName ?? config.walletId,
          formatLabel: formatLabel(config.format),
          startedAt: Date.now(),
        });
        navigate(`/runs/${id}`);
      },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        hero
        title="New interop run"
        description="Pick who plays each role, choose a credential format, then run a live issue → hold → present → verify cycle (or just one half of it) and watch every protocol message."
      />

      <CatalogStats entries={entries} formats={formats} loading={catalog.isPending} />

      {catalog.isError && <ErrorNote title="Could not load the catalog" error={catalog.error} />}

      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        {catalog.isPending ? (
          <div className="flex h-60 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm text-muted">
            <Spinner /> Loading catalog…
          </div>
        ) : (
          <RoleSelectorBoard catalog={entries} />
        )}
        <div className="flex flex-col gap-3 2xl:sticky 2xl:top-4">
          <RunConfigPanel
            formats={formats}
            flows={flows}
            credentialConfigs={configs.data ?? []}
            configsLoading={configs.isLoading}
            issuer={issuer}
            wallet={wallet}
            verifier={verifier}
          />
          <CompatibilityHint config={config} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <p
            className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs sm:text-sm"
            aria-live="polite"
          >
            {issuer && wallet && verifier ? (
              <>
                <span className="font-medium">{issuer.displayName}</span>
                <ArrowRightIcon className="text-muted" />
                <span className="font-medium">{wallet.displayName}</span>
                <ArrowRightIcon className="text-muted" />
                <span className="font-medium">{verifier.displayName}</span>
                {selection.format && (
                  <span className="text-muted">· {formatLabel(selection.format)}</span>
                )}
                {selection.mode !== 'full' && (
                  <span className="text-muted">· {modeLabel(selection.mode)}</span>
                )}
              </>
            ) : (
              <span className="text-muted" data-testid="missing-roles">
                Choose {listJoin(missingRoles.map((r) => `${r === 'issuer' ? 'an' : 'a'} ${r}`))} to
                run
              </span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-3">
            {createRun.isError && (
              <span className="text-xs text-bad">{createRun.error.message}</span>
            )}
            <Button
              variant="primary"
              size="lg"
              className="pl-3.5 pr-4 sm:pl-4.5 sm:pr-5"
              onClick={start}
              disabled={missingRoles.length > 0 || !config || createRun.isPending}
            >
              {createRun.isPending ? <Spinner /> : <PlayIcon />}
              Run
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
