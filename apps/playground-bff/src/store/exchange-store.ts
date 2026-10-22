// In-memory store for Exchange records captured by the Protocol Tap proxy.
// Keyed two ways: by exchangeId (for direct lookup) and by runId (for listing a run's messages).
// Sequence numbers are global and monotonically increasing.

import type { ProtocolStep } from './classifier.ts';

export interface HttpMessage {
  headers: Record<string, string>;
  body?: string;
  contentType?: string;
}

export interface Exchange {
  id: string;
  runId?: string;
  seq: number;
  ts: string; // ISO-8601
  component: string; // 'certify-tap' | 'verify-tap'
  from?: string; // originating IP/host
  method: string;
  url: string;
  status?: number;
  latencyMs?: number;
  step: ProtocolStep;
  request: HttpMessage;
  response?: HttpMessage;
  correlationKeys: string[];
  outOfBand: boolean;
}

let _seq = 0;

// exchangeId → Exchange
const byId = new Map<string, Exchange>();

// runId → Exchange[] (in insertion order = seq order)
const byRun = new Map<string, Exchange[]>();

// Exchanges not yet assigned to a run
const unassigned: Exchange[] = [];

/** Generate the next global sequence number. */
export function nextSeq(): number {
  return ++_seq;
}

/** Persist a new exchange. Call correlator.assignRun() before this if runId is known. */
export function addExchange(exchange: Exchange): void {
  byId.set(exchange.id, exchange);

  if (exchange.runId) {
    const list = byRun.get(exchange.runId) ?? [];
    list.push(exchange);
    byRun.set(exchange.runId, list);
  } else {
    unassigned.push(exchange);
  }
}

/** Return all exchanges for a run, sorted by seq ascending. */
export function getExchangesByRun(runId: string): Exchange[] {
  return (byRun.get(runId) ?? []).slice().sort((a, b) => a.seq - b.seq);
}

/** Return a single exchange by id. */
export function getExchangeById(id: string): Exchange | undefined {
  return byId.get(id);
}

/**
 * Assign a runId to all unassigned exchanges that contain any of the given
 * correlation keys. Called by the correlator when a key→runId mapping is registered.
 */
export function backfillRunId(runId: string, keys: string[]): void {
  const keySet = new Set(keys);
  const remaining: Exchange[] = [];

  for (const ex of unassigned) {
    if (ex.correlationKeys.some((k) => keySet.has(k))) {
      ex.runId = runId;
      const list = byRun.get(runId) ?? [];
      list.push(ex);
      byRun.set(runId, list);
    } else {
      remaining.push(ex);
    }
  }

  // Replace unassigned array in-place
  unassigned.length = 0;
  unassigned.push(...remaining);
}

/** For tests / dev: wipe everything. */
export function clearStore(): void {
  byId.clear();
  byRun.clear();
  unassigned.length = 0;
  _seq = 0;
}
