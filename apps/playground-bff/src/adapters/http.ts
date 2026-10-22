// Outbound HTTP for adapters. Calls are tagged with the run id and `bff` as caller, so when they
// go through the Protocol Tap they correlate exactly and show up as the Playground's messages.
import type { HealthStatus } from '@playground/shared';
import { CALLER_HEADER, RUN_HEADER } from '../tap/proxy.ts';

export class AdapterError extends Error {
  constructor(
    /** Run step (ProtocolStep or machine step id) that failed. */
    readonly step: string,
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface UpstreamResponse {
  status: number;
  text: string;
  json<T = Record<string, unknown>>(): T;
}

export async function upstream(
  step: string,
  url: string,
  init: RequestInit & { runId?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<UpstreamResponse> {
  const { runId, timeoutMs = 20_000, signal, ...rest } = init;
  const signals = [AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])];
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: {
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
        [CALLER_HEADER]: 'bff',
        ...(runId ? { [RUN_HEADER]: runId } : {}),
        ...rest.headers,
      },
      signal: AbortSignal.any(signals),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    throw new AdapterError(
      step,
      `${rest.method ?? 'GET'} ${url} failed: ${cause?.code ?? cause?.message ?? (e as Error).message}`,
    );
  }
  const text = await res.text();
  if (!res.ok)
    throw new AdapterError(
      step,
      `${rest.method ?? 'GET'} ${url} answered HTTP ${res.status}`,
      res.status,
      text,
    );
  return {
    status: res.status,
    text,
    json<T>() {
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new AdapterError(step, `${url} did not return JSON`, res.status, text);
      }
    },
  };
}

/** GET a health URL directly (not through the tap, so probes do not clutter the inspector). */
export async function probeHealth(
  url: string | undefined,
  timeoutMs = 3000,
): Promise<HealthStatus> {
  if (!url) return 'unknown';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel();
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

export const staticVersion = (d: { versionProbe?: { kind: string; value: string } }) =>
  d.versionProbe?.kind === 'static' ? d.versionProbe.value : undefined;
