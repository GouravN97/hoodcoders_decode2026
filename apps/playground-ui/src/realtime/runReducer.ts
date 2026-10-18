import {
  RUN_STEP_TEMPLATE,
  TERMINAL_RUN_STATES,
  type RunDetail,
  type RunEvent,
  type RunStep,
} from '@playground/shared';

const stepOrder = (step: string) => {
  const i = RUN_STEP_TEMPLATE.findIndex((t) => t.step === step);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

function upsertStep(steps: RunStep[], next: RunStep): RunStep[] {
  const i = steps.findIndex((s) => s.step === next.step);
  const merged = i === -1 ? [...steps, next] : steps.map((s, j) => (j === i ? { ...s, ...next } : s));
  return merged.sort((a, b) => stepOrder(a.step) - stepOrder(b.step));
}

/**
 * Folds one live event into the run record. Pure, so it can run inside React Query's
 * setQueryData and in unit tests. Exchange and check events are not part of RunDetail.
 */
export function applyRunEvent(run: RunDetail, event: RunEvent): RunDetail {
  if (event.runId !== run.id) return run;
  switch (event.type) {
    case 'run.status':
      return {
        ...run,
        state: event.state,
        finishedAt: TERMINAL_RUN_STATES.includes(event.state) ? event.at : run.finishedAt,
      };
    case 'run.step':
      return { ...run, steps: upsertStep(run.steps, event.step) };
    case 'run.delivery':
      return { ...run, delivery: { purpose: event.purpose, instruction: event.instruction } };
    case 'run.artifact': {
      const others = run.artifacts.filter((a) => a.id !== event.artifact.id);
      return { ...run, artifacts: [...others, event.artifact] };
    }
    case 'run.result':
      return {
        ...run,
        observedOutcome: event.outcome,
        result: { outcome: event.outcome, perCredential: run.result?.perCredential ?? [], verifierRaw: event.verifierRaw },
      };
    case 'run.completed':
      return { ...run, verdict: event.verdict };
    case 'run.exchange':
    case 'run.check':
      return run;
  }
}

export const isTerminal = (run: Pick<RunDetail, 'state'>) => TERMINAL_RUN_STATES.includes(run.state);
