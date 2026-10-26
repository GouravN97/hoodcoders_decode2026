// Thin client for the BFF's REST API (plan §11.2). Every response is parsed with the shared zod
// schemas, so a BFF that drifts from the contract fails here with the field that changed.
import {
  CatalogEntrySchema,
  CredentialConfigurationSummarySchema,
  RunDetailSchema,
  RunReportSchema,
  type CatalogEntry,
  type CredentialConfigurationSummary,
  type RunConfig,
  type RunDetail,
  type RunReport,
} from '@playground/shared';
import { z } from 'zod';

export class BffError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type RunTrigger = RunDetail['trigger'];

export class BffClient {
  private readonly base: string;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/$/, '');
  }

  private async call<S extends z.ZodType>(
    schema: S,
    path: string,
    init: RequestInit & { timeoutMs?: number } = {},
  ): Promise<z.infer<S>> {
    const { timeoutMs = 30_000, ...rest } = init;
    const res = await fetch(`${this.base}${path}`, {
      ...rest,
      headers: { accept: 'application/json', ...(rest.body ? { 'content-type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        /* not JSON */
      }
      throw new BffError(res.status, `${init.method ?? 'GET'} ${path}: ${res.status} ${message}`);
    }
    const parsed = schema.safeParse(text ? JSON.parse(text) : undefined);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`${path}: unexpected response at ${issue?.path.join('.') || 'body'}: ${issue?.message}`);
    }
    return parsed.data;
  }

  catalog(): Promise<CatalogEntry[]> {
    return this.call(z.array(CatalogEntrySchema), '/api/catalog');
  }

  credentialConfigurations(issuerId: string): Promise<CredentialConfigurationSummary[]> {
    return this.call(
      z.array(CredentialConfigurationSummarySchema),
      `/api/catalog/${encodeURIComponent(issuerId)}/credential-configurations`,
    );
  }

  async createRun(config: RunConfig, trigger: RunTrigger): Promise<string> {
    const { id } = await this.call(z.object({ id: z.string() }), `/api/runs?trigger=${trigger}`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
    return id;
  }

  run(id: string): Promise<RunDetail> {
    return this.call(RunDetailSchema, `/api/runs/${encodeURIComponent(id)}`);
  }

  report(id: string): Promise<RunReport> {
    return this.call(RunReportSchema, `/api/runs/${encodeURIComponent(id)}/report`);
  }

  async cancel(id: string): Promise<void> {
    await this.call(z.unknown(), `/api/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  }
}
