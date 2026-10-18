import { formatLabel, type Role } from '@playground/shared';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useCatalog, useCreateRun, useCredentialConfigurations } from '../api/queries';
import { ArrowRightIcon, PlayIcon } from '../components/icons';
import { Button, ErrorNote, Spinner } from '../components/ui';
import { buildRunConfig, commonFormats, supportedFlows } from '../features/selector/compat';
import { CompatibilityHint } from '../features/selector/CompatibilityHint';
import { RoleSelectorBoard } from '../features/selector/RoleSelectorBoard';
import { RunConfigPanel } from '../features/selector/RunConfigPanel';
import { selectedIdFor, useSelection } from '../store/selection';

export function PlaygroundPage() {
  const catalog = useCatalog();
  const selection = useSelection();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const createRun = useCreateRun();

  const entries = useMemo(() => catalog.data ?? [], [catalog.data]);
  const pick = (role: Role) => entries.find((c) => c.role === role && c.id === selectedIdFor(selection, role));
  const issuer = pick('issuer');
  const wallet = pick('wallet');
  const verifier = pick('verifier');

  const configs = useCredentialConfigurations(issuer?.id);
  const formats = useMemo(() => commonFormats([issuer, wallet, verifier]), [issuer, wallet, verifier]);
  const flows = useMemo(() => supportedFlows(wallet, verifier), [wallet, verifier]);
  const credentialConfig = configs.data?.find(
    (c) => c.id === selection.credentialConfigurationId && c.format === selection.format,
  );
  const config = buildRunConfig(selection, issuer, wallet, verifier, credentialConfig, params.get('scenario'));

  const start = () => {
    if (!config) return;
    createRun.mutate(config, { onSuccess: ({ id }) => navigate(`/runs/${id}`) });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">New interop run</h1>
        <p className="max-w-2xl text-sm text-muted">
          Pick who plays each role, choose a credential format, then run a live issue → hold → present → verify cycle
          and watch every protocol message.
        </p>
      </header>

      {catalog.isError && <ErrorNote title="Could not load the catalog" error={catalog.error} />}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {catalog.isPending ? (
          <div className="flex h-60 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm text-muted">
            <Spinner /> Loading catalog…
          </div>
        ) : (
          <RoleSelectorBoard catalog={entries} />
        )}
        <div className="flex flex-col gap-3 lg:sticky lg:top-4">
          <RunConfigPanel
            formats={formats}
            flows={flows}
            credentialConfigs={configs.data ?? []}
            configsLoading={configs.isLoading}
            issuer={issuer}
          />
          <CompatibilityHint config={config} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs sm:text-sm" aria-live="polite">
            {issuer && wallet && verifier ? (
              <>
                <span className="font-medium">{issuer.displayName}</span>
                <ArrowRightIcon className="text-muted" />
                <span className="font-medium">{wallet.displayName}</span>
                <ArrowRightIcon className="text-muted" />
                <span className="font-medium">{verifier.displayName}</span>
                {selection.format && <span className="text-muted">· {formatLabel(selection.format)}</span>}
              </>
            ) : (
              <span className="text-muted">Choose an issuer, a wallet and a verifier</span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-3">
            {createRun.isError && <span className="text-xs text-bad">{createRun.error.message}</span>}
            <Button variant="primary" size="lg" className="px-4 sm:px-5" onClick={start} disabled={!config || createRun.isPending}>
              {createRun.isPending ? <Spinner /> : <PlayIcon />}
              Run
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
