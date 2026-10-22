import type { RunDetail } from '@playground/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '../api/queries';
import { runEventSource } from './index';
import { applyRunEvent } from './runReducer';

/**
 * Subscribes to a run's live events and folds them into the React Query cache, so every
 * component reading useRun / useExchanges stays live. After subscribing (and on reconnect)
 * the run is refetched, so events sent before the subscription are not lost.
 */
export function useRunEvents(runId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    let exchangeTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshExchanges = () => {
      clearTimeout(exchangeTimer);
      exchangeTimer = setTimeout(
        () => void qc.invalidateQueries({ queryKey: queryKeys.exchanges(runId) }),
        150,
      );
    };
    const resync = () => {
      void qc.invalidateQueries({ queryKey: queryKeys.run(runId), exact: true });
      refreshExchanges();
    };

    const unsubscribe = runEventSource.subscribe(
      runId,
      (event) => {
        const runKey = queryKeys.run(runId);
        qc.setQueryData<RunDetail>(runKey, (prev) => (prev ? applyRunEvent(prev, event) : prev));
        // A refetch already in flight carries a snapshot older than this event and would overwrite it when it
        // lands (e.g. "Holding" after "Cancelled"). Restart it: React Query drops the stale response.
        if (qc.isFetching({ queryKey: runKey, exact: true }) > 0) {
          void qc.invalidateQueries({ queryKey: runKey, exact: true });
        }
        if (event.type === 'run.exchange') refreshExchanges();
        if (event.type === 'run.completed') {
          void qc.invalidateQueries({ queryKey: queryKeys.report(runId) });
          resync();
        }
      },
      resync,
    );
    resync();

    return () => {
      clearTimeout(exchangeTimer);
      unsubscribe();
    };
  }, [qc, runId]);
}
