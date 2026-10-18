// In-memory store shared by the MSW handlers and the run simulator, so REST responses and
// live events always describe the same run.
import type { CheckFinding, ExchangeWithDecoded, RunDetail } from '@playground/shared';

export interface MockRunRecord {
  run: RunDetail;
  exchanges: ExchangeWithDecoded[];
  findings: CheckFinding[];
  cancelled: boolean;
  /** Pending manual-evidence waits, keyed by step id. */
  manualWaiters: Map<string, () => void>;
}

const runs = new Map<string, MockRunRecord>();

export const db = {
  create(run: RunDetail): MockRunRecord {
    const record: MockRunRecord = {
      run,
      exchanges: [],
      findings: [],
      cancelled: false,
      manualWaiters: new Map(),
    };
    runs.set(run.id, record);
    return record;
  },
  get: (id: string) => runs.get(id),
  all: () => [...runs.values()],
  clear: () => runs.clear(),
};
