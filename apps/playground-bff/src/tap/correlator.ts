// Correlator: links captured HTTP exchanges to the run that produced them.
//
// The wallet talks directly to Certify — the BFF never sees those messages.
// Instead the proxy captures them and the correlator figures out which run they belong to
// by following the token chain:
//
//   Run created  → BFF registers  pre_authorized_code → runId
//   Proxy sees token request → extracts pre_authorized_code → finds runId
//   Proxy sees credential request → extracts access_token → same runId
//   VP side: nonce / state → runId
//
// Keys are stored case-insensitively (JWT claims are case-sensitive but query params are not).

import { backfillRunId } from '../store/exchange-store.ts';

// correlationKey (lower-cased) → runId
const keyToRun = new Map<string, string>();

/**
 * Register one or more correlation keys for a run.
 * Called by the BFF when it creates a credential offer or presentation request.
 * Also triggers a backfill of any exchanges already captured with these keys.
 */
export function register(runId: string, ...keys: string[]): void {
  const normalised = keys.map((k) => k.trim()).filter(Boolean);
  for (const key of normalised) {
    keyToRun.set(key.toLowerCase(), runId);
  }
  if (normalised.length > 0) {
    backfillRunId(runId, normalised.map((k) => k.toLowerCase()));
  }
}

/**
 * Resolve a list of correlation keys to a runId.
 * Returns the first match found, or undefined.
 */
export function resolve(keys: string[]): string | undefined {
  for (const key of keys) {
    const runId = keyToRun.get(key.toLowerCase());
    if (runId) return runId;
  }
  return undefined;
}

/**
 * Extract all useful correlation keys from a captured HTTP request/response.
 * Keys come from query parameters, request bodies (form + JSON), and Authorization headers.
 */
export function extractKeys(
  method: string,
  url: string,
  requestBody: string | undefined,
  requestContentType: string | undefined,
  responseBody: string | undefined,
): string[] {
  const keys: string[] = [];

  // ── URL query parameters ────────────────────────────────────────────────
  try {
    const parsed = new URL(url, 'http://tap');
    for (const name of ['pre-authorized_code', 'state', 'nonce', 'code']) {
      const v = parsed.searchParams.get(name);
      if (v) keys.push(v);
    }
  } catch {
    // ignore malformed URLs
  }

  // ── Request body ─────────────────────────────────────────────────────────
  if (requestBody) {
    // application/x-www-form-urlencoded  (token endpoint)
    if (requestContentType?.includes('application/x-www-form-urlencoded')) {
      try {
        const params = new URLSearchParams(requestBody);
        for (const name of ['pre-authorized_code', 'code', 'refresh_token']) {
          const v = params.get(name);
          if (v) keys.push(v);
        }
      } catch {
        // ignore
      }
    }

    // application/json
    if (requestContentType?.includes('application/json')) {
      try {
        const json = JSON.parse(requestBody) as Record<string, unknown>;
        for (const name of ['pre_authorized_code', 'pre-authorized_code', 'nonce', 'state']) {
          const v = json[name];
          if (typeof v === 'string') keys.push(v);
        }
      } catch {
        // ignore
      }
    }
  }

  // ── Response body (token endpoint returns access_token) ─────────────────
  if (responseBody) {
    try {
      const json = JSON.parse(responseBody) as Record<string, unknown>;
      for (const name of ['access_token', 'c_nonce', 'nonce']) {
        const v = json[name];
        if (typeof v === 'string') keys.push(v);
      }
    } catch {
      // ignore
    }
  }

  return [...new Set(keys.filter(Boolean))];
}

/** For tests / dev: wipe all registered keys. */
export function clearCorrelator(): void {
  keyToRun.clear();
}
