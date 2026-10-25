// Thin fetch wrapper for the BFF. Every JSON response is parsed with the shared zod schema,
// so contract drift between UI and BFF fails loudly at the boundary.
import {
  ApiErrorSchema,
  CatalogResponseSchema,
  CreateRunResponseSchema,
  CredentialConfigurationsResponseSchema,
  ExchangesResponseSchema,
  HeldCredentialsResponseSchema,
  MatrixResponseSchema,
  PredictResponseSchema,
  RunReportSchema,
  RunResponseSchema,
  RunsResponseSchema,
  type ManualEvidenceRequest,
  type RunConfig,
} from '@playground/shared';
import type { z } from 'zod';
import { BFF_URL } from '../config';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BFF_URL}${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => null));
    throw new ApiRequestError(
      parsed.success ? parsed.data.message : `${res.status} ${res.statusText}`,
      res.status,
    );
  }
  return res;
}

async function getJson<S extends z.ZodType>(path: string, schema: S, init?: RequestInit) {
  const res = await send(path, init);
  return schema.parse(await res.json()) as z.infer<S>;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

/** `?a=1&b=2` from the set values, or an empty string. */
function queryString(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams(
    Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])),
  );
  return params.size ? `?${params}` : '';
}

export type ReportFormat = 'md' | 'json';

export const api = {
  catalog: () => getJson('/api/catalog', CatalogResponseSchema),
  credentialConfigurations: (issuerId: string) =>
    getJson(
      `/api/catalog/${encodeURIComponent(issuerId)}/credential-configurations`,
      CredentialConfigurationsResponseSchema,
    ),
  heldCredentials: (walletId: string) =>
    getJson(`/api/catalog/${encodeURIComponent(walletId)}/credentials`, HeldCredentialsResponseSchema),
  predict: (config: RunConfig) =>
    getJson('/api/compatibility/predict', PredictResponseSchema, post(config)),
  createRun: (config: RunConfig) => getJson('/api/runs', CreateRunResponseSchema, post(config)),
  run: (id: string) => getJson(`/api/runs/${encodeURIComponent(id)}`, RunResponseSchema),
  /** Saved runs as summaries, newest first, filtered by RunsQuerySchema (plan §11.2). */
  runs: (query: Record<string, string | undefined> = {}) =>
    getJson(`/api/runs${queryString(query)}`, RunsResponseSchema),
  /** Latest run per issuer × wallet × verifier × format. */
  matrix: (includeNegative: boolean) =>
    getJson(`/api/matrix${queryString({ includeNegative: String(includeNegative) })}`, MatrixResponseSchema),
  /** The matrix as the BFF renders it in Markdown, with links to each run. */
  matrixMarkdown: async (includeNegative: boolean) => {
    const res = await send(`/api/matrix.md${queryString({ includeNegative: String(includeNegative) })}`);
    return res.text();
  },
  exchanges: (id: string) =>
    getJson(`/api/runs/${encodeURIComponent(id)}/exchanges?decode=true`, ExchangesResponseSchema),
  manualEvidence: async (id: string, body: ManualEvidenceRequest) => {
    await send(`/api/runs/${encodeURIComponent(id)}/manual-evidence`, post(body));
  },
  cancel: async (id: string) => {
    await send(`/api/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  },
  report: (id: string) =>
    getJson(`/api/runs/${encodeURIComponent(id)}/report?format=json`, RunReportSchema),
  /** Raw report file for download, exactly as the BFF renders it. */
  reportFile: async (id: string, format: ReportFormat) => {
    const res = await send(`/api/runs/${encodeURIComponent(id)}/report?format=${format}`);
    return res.blob();
  },
};
