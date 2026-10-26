// Outbound HTTP for the wallet. Every failure carries the protocol step it happened in, so the
// BFF can fail the matching run step with the upstream status and body.

export const USER_AGENT = 'playground-mock-wallet/0.0.0';
const TIMEOUT_MS = Number(process.env.WALLET_HTTP_TIMEOUT_MS ?? 20_000);

export class WalletError extends Error {
  constructor(
    readonly step: string,
    message: string,
    readonly statusCode = 502,
    readonly upstreamStatus?: number,
    readonly upstreamBody?: string,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

export interface HttpResult {
  status: number;
  contentType: string;
  text: string;
}

/**
 * WALLET_ROUTES="https://public.example=http://tap:3006,…": requests to a public origin go to another
 * origin instead, path unchanged. The BFF's Protocol Tap listener for a remote verifier forwards them
 * there, so the wallet's traffic shows in the inspector like traffic to the local stack does.
 */
const ROUTES: Array<[string, string]> = (process.env.WALLET_ROUTES ?? '')
  .split(',')
  .map((r) => r.trim().split('='))
  .filter((r): r is [string, string] => r.length === 2 && Boolean(r[0]) && Boolean(r[1]))
  .map(([from, to]) => [from.replace(/\/$/, ''), to.replace(/\/$/, '')]);

export function routed(url: string): string {
  for (const [from, to] of ROUTES) if (url === from || url.startsWith(`${from}/`)) return `${to}${url.slice(from.length)}`;
  return url;
}

export async function call(step: string, url: string, init: RequestInit = {}): Promise<HttpResult> {
  let res: Response;
  try {
    res = await fetch(routed(url), {
      ...init,
      headers: { 'user-agent': USER_AGENT, ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    throw new WalletError(
      step,
      `${init.method ?? 'GET'} ${url} failed: ${cause?.code ?? cause?.message ?? (e as Error).message}`,
    );
  }
  const text = await res.text();
  if (!res.ok) {
    throw new WalletError(
      step,
      `${init.method ?? 'GET'} ${url} answered HTTP ${res.status}`,
      502,
      res.status,
      text,
    );
  }
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', text };
}

export function parseJson<T = Record<string, unknown>>(step: string, r: HttpResult): T {
  try {
    return JSON.parse(r.text) as T;
  } catch {
    throw new WalletError(step, 'Response is not JSON', 502, r.status, r.text);
  }
}

export const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});

export const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
