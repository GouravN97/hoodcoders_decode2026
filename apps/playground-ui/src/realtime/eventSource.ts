import type { RunEvent } from '@playground/shared';

export type RunEventHandler = (event: RunEvent) => void;

/** Where live run events come from: the BFF's socket.io gateway, or the in-browser simulator. */
export interface RunEventSource {
  /** Subscribe to one run's events. `onReconnect` fires when events may have been missed. */
  subscribe(runId: string, handler: RunEventHandler, onReconnect?: () => void): () => void;
}

/** In-memory pub/sub used by the mock simulator (and tests). */
export class SimulatedEventSource implements RunEventSource {
  private readonly handlers = new Map<string, Set<RunEventHandler>>();

  subscribe(runId: string, handler: RunEventHandler): () => void {
    let set = this.handlers.get(runId);
    if (!set) this.handlers.set(runId, (set = new Set()));
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  publish(event: RunEvent): void {
    for (const h of this.handlers.get(event.runId) ?? []) h(event);
  }
}
