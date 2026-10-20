import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useCatalog, useExchanges, useRun } from '../api/queries';
import { EmptyState, ErrorNote, Spinner } from '../components/ui';
import { USE_MOCKS } from '../config';
import { ProtocolInspector } from '../features/inspector/ProtocolInspector';
import { RunReportView } from '../features/report/RunReportView';
import { CredentialCard } from '../features/run/CredentialCard';
import { DeliveryPanel } from '../features/run/DeliveryPanel';
import { HoldConfirmCard } from '../features/run/HoldConfirmCard';
import { PhaseStepper } from '../features/run/PhaseStepper';
import { RunHeader } from '../features/run/RunHeader';
import { RunStats } from '../features/run/RunStats';
import { StepErrorPanel } from '../features/run/StepErrorPanel';
import { VerificationResultCard } from '../features/run/VerificationResultCard';
import { isTerminal } from '../realtime/runReducer';
import { useRunEvents } from '../realtime/useRunEvents';

export function RunPage() {
  const { id = '' } = useParams();
  useRunEvents(id);
  const run = useRun(id);
  const exchanges = useExchanges(id);
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const selectedExchangeId = params.get('ex');

  const selectExchange = useCallback(
    (exchangeId: string, scroll = false) => {
      setParams((p) => {
        p.set('ex', exchangeId);
        return p;
      }, { replace: true });
      if (scroll) document.getElementById('inspector')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [setParams],
  );
  const jumpToExchange = useCallback((exchangeId: string) => selectExchange(exchangeId, true), [selectExchange]);

  if (run.isPending) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted">
        <Spinner /> Loading run…
      </div>
    );
  }
  if (run.isError) {
    const notFound = run.error instanceof ApiRequestError && run.error.status === 404;
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        {notFound ? (
          <EmptyState title="Run not found">
            {USE_MOCKS && 'Mock runs live in this browser tab only and are gone after a reload. '}
            <Link className="text-accent underline" to="/">
              Start a new run
            </Link>
          </EmptyState>
        ) : (
          <ErrorNote title="Could not load the run" error={run.error} />
        )}
      </div>
    );
  }

  const data = run.data;
  const terminal = isTerminal(data);
  const wallet = catalog.data?.find((c) => c.id === data.config.walletId);
  const credential = data.artifacts.find((a) => a.kind === 'credential');
  const awaitingHold =
    wallet?.capabilities.automation === 'human-in-the-loop' &&
    data.steps.some((s) => s.step === 'credential_held' && s.status === 'active');

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <RunHeader run={data} catalog={catalog.data ?? []} />
      <RunStats run={data} exchanges={exchanges.data ?? []} />
      <PhaseStepper run={data} selectedExchangeId={selectedExchangeId} onSelectExchange={jumpToExchange} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <VerificationResultCard run={data} />
          <StepErrorPanel steps={data.steps} onSelectExchange={jumpToExchange} />
          {awaitingHold && <HoldConfirmCard runId={data.id} walletName={wallet?.displayName ?? 'the wallet'} />}
          {data.delivery && !terminal && (
            <DeliveryPanel purpose={data.delivery.purpose} instruction={data.delivery.instruction} />
          )}
          {credential && <CredentialCard artifact={credential} />}
          {!credential && !data.delivery && !terminal && (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-[13px] text-muted">
              <Spinner /> Preparing the credential offer…
            </div>
          )}
        </div>
        <ProtocolInspector
          exchanges={exchanges.data ?? []}
          selectedId={selectedExchangeId}
          onSelect={selectExchange}
          loading={exchanges.isPending}
        />
      </div>

      <RunReportView runId={data.id} ready={terminal} />
    </div>
  );
}
