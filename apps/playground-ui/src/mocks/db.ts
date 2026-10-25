// In-memory store shared by the MSW handlers and the run simulator, so REST responses and
// live events always describe the same run.
import type {
  CheckFinding,
  ExchangeWithDecoded,
  HeldCredential,
  RunDetail,
  TamperPlan,
} from '@playground/shared';

export interface MockRunRecord {
  run: RunDetail;
  exchanges: ExchangeWithDecoded[];
  findings: CheckFinding[];
  cancelled: boolean;
  /** Pending manual-evidence waits, keyed by step id. */
  manualWaiters: Map<string, () => void>;
  /** The tamper the run applies, planned when it was created. */
  tamperPlan?: TamperPlan;
}

const runs = new Map<string, MockRunRecord>();
/** What the headless mock wallet holds, oldest first; filled by mock runs that store a credential. */
const heldCredentials: HeldCredential[] = [];

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
  /** Runs newest first, as GET /api/runs returns them. */
  list: () => [...runs.values()].map((r) => r.run).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  heldCredentials,
  clear: () => {
    runs.clear();
    heldCredentials.length = 0;
  },
};
