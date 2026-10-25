import { formatLabel, runUsesPhase, verdictLabel } from '@playground/shared';
import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useCatalog, useExchanges, useRun } from '../api/queries';
import { CredentialIcon, MessagesIcon, ReportIcon } from '../components/icons';
import { Card, EmptyState, ErrorNote, Spinner } from '../components/ui';
import { USE_MOCKS } from '../config';
import { ProtocolInspector } from '../features/inspector/ProtocolInspector';
import { RunReportView } from '../features/report/RunReportView';
import { CredentialCard } from '../features/run/CredentialCard';
import { DeliveryPanel } from '../features/run/DeliveryPanel';
import { HoldConfirmCard } from '../features/run/HoldConfirmCard';
import { PhaseStepper } from '../features/run/PhaseStepper';
import { RunHeader } from '../features/run/RunHeader';
import { RunSections, type RunSectionId } from '../features/run/RunSections';
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
  const viewParam = params.get('view');
  const pinnedView = viewParam === 'credential' || viewParam === 'inspector' || viewParam === 'report' ? viewParam : null;

  const showSection = useCallback(
    (view: RunSectionId) =>
      setParams((p) => {
        p.set('view', view);
        return p;
      }, { replace: true }),
    [setParams],
  );
  const selectExchange = useCallback(
    (exchangeId: string, scroll = false) => {
      setParams((p) => {
        p.set('ex', exchangeId);
        if (scroll) p.set('view', 'inspector');
        return p;
      }, { replace: true });
      // After the inspector panel is shown.
      if (scroll) requestAnimationFrame(() => document.getElementById('run-sections')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
  const issuing = runUsesPhase(data.config.mode, 'issuing');
  const awaitingHold =
    wallet?.capabilities.automation === 'human-in-the-loop' &&
    data.steps.some((s) => s.step === 'credential_held' && s.status === 'active');

  // Until the user picks a section: the inspector while the run is live, the report once it has finished.
  const view: RunSectionId = pinnedView ?? (terminal ? 'report' : 'inspector');
  const messageCount = exchanges.data?.length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <RunHeader run={data} catalog={catalog.data ?? []} />
      <RunStats run={data} exchanges={exchanges.data ?? []} />
      <PhaseStepper run={data} selectedExchangeId={selectedExchangeId} onSelectExchange={jumpToExchange} />

      {/* What needs attention right now: the verdict, failures, and anything the person has to do. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <VerificationResultCard
          run={data}
          verifierName={catalog.data?.find((c) => c.id === data.config.verifierId)?.displayName ?? 'Verifier'}
        />
        <StepErrorPanel steps={data.steps} onSelectExchange={jumpToExchange} />
        {awaitingHold && (
          <HoldConfirmCard
            runId={data.id}
            walletName={wallet?.displayName ?? 'the wallet'}
            alreadyHeld={!issuing}
          />
        )}
        {data.delivery && !terminal && (
          <DeliveryPanel runId={data.id} purpose={data.delivery.purpose} instruction={data.delivery.instruction} />
        )}
        {issuing && !credential && !data.delivery && !terminal && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-[13px] text-muted">
            <Spinner /> Preparing the credential offer…
          </div>
        )}
      </div>

      <RunSections
        value={view}
        onChange={showSection}
        sections={[
          {
            id: 'credential',
            label: issuing ? 'Issued credential' : 'Held credential',
            shortLabel: 'Credential',
            meta: credential
              ? credential.format
                ? formatLabel(credential.format)
                : issuing
                  ? 'Issued'
                  : 'Held'
              : issuing
                ? 'Not issued yet'
                : 'Not shown yet',
            Icon: CredentialIcon,
            content: credential ? (
              <CredentialCard artifact={credential} />
            ) : (
              <Card>
                <EmptyState title="No credential yet">
                  {!issuing
                    ? 'This run presents a credential the wallet already holds. It shows here when the playground can read it from the wallet.'
                    : terminal
                      ? 'The run ended before the issuer sent a credential.'
                      : 'The credential shows here as soon as the issuer sends it.'}
                </EmptyState>
              </Card>
            ),
          },
          {
            id: 'inspector',
            label: 'Protocol inspector',
            shortLabel: 'Inspector',
            meta: `${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`,
            Icon: MessagesIcon,
            content: (
              <ProtocolInspector
                exchanges={exchanges.data ?? []}
                selectedId={selectedExchangeId}
                onSelect={selectExchange}
                loading={exchanges.isPending}
                run={data}
                catalog={catalog.data ?? []}
              />
            ),
          },
          {
            id: 'report',
            label: 'Report',
            shortLabel: 'Report',
            meta: data.verdict ? verdictLabel(data.verdict) : terminal ? 'Ready' : 'After the run finishes',
            Icon: ReportIcon,
            content: <RunReportView runId={data.id} ready={terminal} />,
          },
        ]}
      />
    </div>
  );
}
