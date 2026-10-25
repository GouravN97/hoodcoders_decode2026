// In-memory store for Exchange records captured by the Protocol Tap and recorded by the BFF.
// Keyed two ways: by exchange id and by run id. Sequence numbers are global and increasing.
// Every exchange that becomes part of a run is announced on `exchangeEvents` ('run-exchange'),
// whether it was correlated when captured or backfilled later; the orchestrator waits on these
// for evidence and the realtime gateway forwards them as `run.exchange`.
import { EventEmitter } from 'node:events';
import type { Exchange } from '@playground/shared';

export type { Exchange };

let seq = 0;
const byId = new Map<string, Exchange>();
const byRun = new Map<string, Exchange[]>();
const unassigned: Exchange[] = [];
/** Unassigned exchanges kept for backfill; older ones are dropped. */
const MAX_UNASSIGNED = 2000;

export const exchangeEvents = new EventEmitter();
exchangeEvents.setMaxListeners(0);

export const nextSeq = () => ++seq;

function attach(runId: string, ex: Exchange) {
  ex.runId = runId;
  const list = byRun.get(runId) ?? [];
  list.push(ex);
  list.sort((a, b) => a.seq - b.seq);
  byRun.set(runId, list);
  exchangeEvents.emit('run-exchange', ex);
}

export function addExchange(ex: Exchange): void {
  byId.set(ex.id, ex);
  if (ex.runId) attach(ex.runId, ex);
  else {
    unassigned.push(ex);
    if (unassigned.length > MAX_UNASSIGNED) {
      const dropped = unassigned.shift();
      if (dropped) byId.delete(dropped.id);
    }
  }
}

export const getExchangesByRun = (runId: string): Exchange[] => (byRun.get(runId) ?? []).slice();
export const getExchangeById = (id: string): Exchange | undefined => byId.get(id);
export const getUnassigned = (): Exchange[] => unassigned.slice();

/** Assigns unassigned exchanges carrying any of these keys to the run. */
export function backfillRunId(runId: string, keys: string[]): void {
  const keySet = new Set(keys);
  for (let i = unassigned.length - 1; i >= 0; i--) {
    const ex = unassigned[i]!;
    if (ex.correlationKeys.some((k) => keySet.has(k))) {
      unassigned.splice(i, 1);
      attach(runId, ex);
    }
  }
}

/**
 * Records that an exchange carried a tampered payload (plan §13) and announces the change
 * ('exchange-updated'), so the inspector shows the before/after view.
 */
export function markTampered(id: string, tampered: NonNullable<Exchange['tampered']>): void {
  const ex = byId.get(id);
  if (!ex) return;
  ex.tampered = tampered;
  exchangeEvents.emit('exchange-updated', ex);
}

/** Moves one unassigned exchange into a run (adjacency correlation in the tap). */
export function assignExchange(id: string, runId: string): void {
  const i = unassigned.findIndex((ex) => ex.id === id);
  if (i === -1) return;
  const [ex] = unassigned.splice(i, 1);
  attach(runId, ex!);
}

/** Replaces a run's exchanges, e.g. when a finished run is loaded from disk. */
export function restoreRun(runId: string, exchanges: Exchange[]): void {
  for (const ex of exchanges) {
    byId.set(ex.id, ex);
    seq = Math.max(seq, ex.seq);
  }
  byRun.set(
    runId,
    exchanges.slice().sort((a, b) => a.seq - b.seq),
  );
}

export function clearStore(): void {
  byId.clear();
  byRun.clear();
  unassigned.length = 0;
  seq = 0;
}
