import { create } from 'zustand';

export interface RecentRun {
  id: string;
  /** e.g. "Inji Certify → Mock wallet → Inji Verify" */
  title: string;
  wallet: string;
  formatLabel: string;
  startedAt: number;
}

interface RecentRunsState {
  runs: RecentRun[];
  add: (run: RecentRun) => void;
}

const LIMIT = 6;

/** Runs started from this tab, newest first, for the sidebar. In memory only: mock runs vanish on reload anyway. */
export const useRecentRuns = create<RecentRunsState>((set) => ({
  runs: [],
  add: (run) => set((s) => ({ runs: [run, ...s.runs.filter((r) => r.id !== run.id)].slice(0, LIMIT) })),
}));
