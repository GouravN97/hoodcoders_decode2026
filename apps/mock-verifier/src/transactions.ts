// Presentation transactions, in memory with a time-to-live. A status long poll waits on a
// transaction until it changes or the poll times out.
import type { PresentationDefinition } from '@playground/protocol-core';
import type { DcqlQuery, MockVerifierResult } from '@playground/shared';

export type TransactionStatus = 'ACTIVE' | 'VP_SUBMITTED' | 'EXPIRED';

export interface Transaction {
  requestId: string;
  transactionId: string;
  nonce: string;
  responseMode: 'direct_post' | 'dc_api';
  /** draft 23 direct_post requests (Presentation Exchange). */
  presentationDefinition?: PresentationDefinition;
  /** OpenID4VP 1.0 requests (DCQL): over direct_post, or over the Digital Credentials API. */
  dcqlQuery?: DcqlQuery;
  createdAt: number;
  expiresAt: number;
  submitted: boolean;
  result?: MockVerifierResult;
}

/** An openid4vp:// request in the OpenID4VP 1.0 dialect: direct_post with a DCQL query. */
export const isOid4vp1 = (tx: Pick<Transaction, 'responseMode' | 'dcqlQuery'>) =>
  tx.responseMode === 'direct_post' && Boolean(tx.dcqlQuery);

export class TransactionStore {
  private readonly byRequest = new Map<string, Transaction>();
  private readonly waiters = new Map<string, Set<() => void>>();

  add(tx: Transaction) {
    this.byRequest.set(tx.requestId, tx);
  }

  byRequestId = (id: string) => this.byRequest.get(id);

  byTransactionId(id: string): Transaction | undefined {
    for (const tx of this.byRequest.values()) if (tx.transactionId === id) return tx;
    return undefined;
  }

  status(tx: Transaction, now = Date.now()): TransactionStatus {
    if (tx.submitted) return 'VP_SUBMITTED';
    return now > tx.expiresAt ? 'EXPIRED' : 'ACTIVE';
  }

  submit(tx: Transaction, result: MockVerifierResult) {
    tx.submitted = true;
    tx.result = result;
    this.waiters.get(tx.requestId)?.forEach((wake) => wake());
  }

  /** Resolves when the transaction's status changes, or after `timeoutMs`, with its status then. */
  waitForChange(tx: Transaction, timeoutMs: number): Promise<TransactionStatus> {
    const before = this.status(tx);
    if (before !== 'ACTIVE') return Promise.resolve(before);
    return new Promise((resolve) => {
      const set = this.waiters.get(tx.requestId) ?? new Set();
      const done = () => {
        clearTimeout(timer);
        set.delete(done);
        resolve(this.status(tx));
      };
      const timer = setTimeout(done, Math.min(timeoutMs, Math.max(0, tx.expiresAt - Date.now()) + 50));
      set.add(done);
      this.waiters.set(tx.requestId, set);
    });
  }

  /** Drops transactions that expired more than an hour ago. */
  prune(now = Date.now()) {
    for (const [id, tx] of this.byRequest) if (now - tx.expiresAt > 3_600_000) this.byRequest.delete(id);
  }
}
