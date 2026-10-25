// Playground BFF: catalog, run orchestration, reports, live run events (socket.io) and the
// Protocol Tap, in one Node process. REST API as in plan §11.2, events as in §11.3; every body
// crossing the boundary is validated with the zod schemas in packages/shared.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canReplayFrom,
  CreateRunRequestSchema,
  ManualEvidenceRequestSchema,
  predict,
  PredictRequestSchema,
  renderReportMarkdown,
  type HeldCredentialsResponse,
  type RunConfig,
} from '@playground/shared';
import { z } from 'zod';
import { AdapterError } from './adapters/http.ts';
import { ImplementationRegistry } from './catalog/registry.ts';
import { decodeExchange } from './decoder/payload-decoder.ts';
import { attachGateway, broadcastHealth } from './realtime/gateway.ts';
import { RunConfigError, RunOrchestrator } from './runs/orchestrator.ts';
import { buildRunReport } from './runs/report.ts';
import { RunStore } from './runs/store.ts';
import { register } from './tap/correlator.ts';
import { createTapServer, onHeuristicBinding } from './tap/proxy.ts';
import { getExchangeById, getExchangesByRun } from './store/exchange-store.ts';

// ── Config ────────────────────────────────────────────────────────────────────
const env = process.env;
const PORT = Number(env.PORT ?? 3001);
const here = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = env.CATALOG_DIR ?? resolvePath(here, '../../../catalog');
const DATA_DIR = env.DATA_DIR || undefined;
const UI_ORIGIN = env.PUBLIC_UI_URL ?? 'http://localhost:8100';
const CORS_ORIGINS: string[] | '*' = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : '*';
const HEALTH_TIMEOUT_MS = Number(env.HEALTH_TIMEOUT_MS ?? 3000);
const HEALTH_TARGETS: Array<{ name: string; url: string; optional?: boolean }> = JSON.parse(
  env.INJI_HEALTH_TARGETS ?? '[]',
);

// Protocol Tap: one listener per upstream. Unset upstream = that tap is off.
const TAPS = [
  {
    component: 'certify',
    port: Number(env.TAP_CERTIFY_PORT ?? 3002),
    upstream: env.TAP_UPSTREAM_CERTIFY ?? '',
    publicOrigin: env.CERTIFY_PUBLIC_URL,
  },
  {
    component: 'verify',
    port: Number(env.TAP_VERIFY_PORT ?? 3003),
    upstream: env.TAP_UPSTREAM_VERIFY ?? '',
    publicOrigin: env.VERIFY_PUBLIC_URL,
  },
];
const tapUrl = (component: string) => {
  const t = TAPS.find((x) => x.component === component && x.upstream);
  return t ? `http://127.0.0.1:${t.port}` : '';
};

const registry = new ImplementationRegistry(CATALOG_DIR, {
  // The BFF's own protocol calls go through its tap, so they appear in the inspector.
  certifyApiUrl: env.CERTIFY_API_URL || tapUrl('certify'),
  verifyApiUrl: env.VERIFY_API_URL || tapUrl('verify'),
  verifyClientId: env.VERIFY_CLIENT_ID ?? 'did:web:verify.localhost%3A8443:v1:verify',
  // Optional stable overrides. Without them the Hovi adapter discovers the public browser-client
  // values from playground.hovi.id, where they are intentionally exposed to every visitor.
  hoviSupabaseUrl: env.HOVI_SUPABASE_URL,
  hoviSupabaseAnonKey: env.HOVI_SUPABASE_ANON_KEY,
});
const runs = new RunStore(DATA_DIR);
const orchestrator = new RunOrchestrator(registry, runs, {
  headlessTimeoutMs: Number(env.HEADLESS_STEP_TIMEOUT_MS ?? 60_000),
  humanTimeoutMs: Number(env.HUMAN_STEP_TIMEOUT_MS ?? 300_000),
  manualTimeoutMs: Number(env.MANUAL_EVIDENCE_TIMEOUT_MS ?? 600_000),
});
onHeuristicBinding((runId) => orchestrator.markHeuristic(runId));

// ── HTTP helpers ──────────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (CORS_ORIGINS === '*' || CORS_ORIGINS.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-expose-headers', 'content-disposition');
  }
}

function send(
  res: ServerResponse,
  statusCode: number,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  if (body === undefined) {
    res.writeHead(statusCode, headers).end();
    return;
  }
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

async function readJson<S extends z.ZodType>(
  req: IncomingMessage,
  schema: S,
  what: string,
): Promise<z.infer<S>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Body is not JSON');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      `Invalid ${what}: ${issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid'}`,
    );
  }
  return parsed.data;
}

/** What the predictor cannot see in the catalog: whether an earlier run can be replayed. */
const predictContext = (config: RunConfig) =>
  config.tamper?.id === 'T-NONCE-REPLAY'
    ? { replayAvailable: runs.list().some((r) => canReplayFrom(r, config)) }
    : {};

const runOr404 = (id: string) => {
  const record = runs.get(id);
  if (!record) throw new HttpError(404, 'Run not found');
  return record;
};

// ── Health ────────────────────────────────────────────────────────────────────
type ServiceStatus = 'up' | 'down' | 'not-running';

async function probe(t: { name: string; url: string; optional?: boolean }) {
  const started = performance.now();
  const base = { name: t.name, url: t.url, optional: Boolean(t.optional) };
  try {
    const res = await fetch(t.url, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    await res.body?.cancel();
    return {
      ...base,
      status: (res.ok ? 'up' : 'down') as ServiceStatus,
      httpStatus: res.status,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    const status: ServiceStatus =
      cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN' ? 'not-running' : 'down';
    return {
      ...base,
      status,
      latencyMs: Math.round(performance.now() - started),
      error: cause?.code ?? cause?.message ?? (e as Error).message,
    };
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://bff');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  let m: RegExpMatchArray | null;

  if (method === 'OPTIONS' && path.startsWith('/api/')) return send(res, 204);

  if (method === 'GET' && path === '/api/health') {
    const services = await Promise.all(HEALTH_TARGETS.map(probe));
    const required = services.filter((s) => !s.optional);
    const status = required.every((s) => s.status === 'up')
      ? 'up'
      : required.some((s) => s.status === 'up')
        ? 'degraded'
        : 'down';
    return send(res, 200, { status, checkedAt: new Date().toISOString(), services });
  }

  // ── Catalog ──
  if (method === 'GET' && path === '/api/catalog') return send(res, 200, await registry.list());

  if (
    method === 'GET' &&
    (m = path.match(/^\/api\/catalog\/([^/]+)\/credential-configurations$/))
  ) {
    const id = decodeURIComponent(m[1]!);
    const issuer = registry.issuer(id);
    if (!issuer) throw new HttpError(404, `Unknown issuer ${id}`);
    try {
      return send(res, 200, await issuer.listCredentialConfigurations());
    } catch (e) {
      throw new HttpError(
        502,
        `Could not read ${issuer.descriptor.displayName} metadata: ${(e as Error).message}`,
      );
    }
  }

  // What a wallet already holds, so a present-only run can pick a credential from an earlier run.
  if (method === 'GET' && (m = path.match(/^\/api\/catalog\/([^/]+)\/credentials$/))) {
    const id = decodeURIComponent(m[1]!);
    const wallet = registry.wallet(id);
    if (!wallet) throw new HttpError(404, `Unknown wallet ${id}`);
    if (!wallet.listCredentials) {
      const body: HeldCredentialsResponse = { listable: false, credentials: [] };
      return send(res, 200, body);
    }
    try {
      const credentials = await wallet.listCredentials(AbortSignal.timeout(10_000));
      const body: HeldCredentialsResponse = {
        listable: true,
        credentials: credentials.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
      };
      return send(res, 200, body);
    } catch (e) {
      throw new HttpError(
        502,
        `Could not list ${wallet.descriptor.displayName}'s credentials: ${(e as Error).message}`,
      );
    }
  }

  if (method === 'POST' && path === '/api/compatibility/predict') {
    const config = await readJson(req, PredictRequestSchema, 'run config');
    return send(res, 200, predict(config, await registry.list(30_000), predictContext(config)));
  }

  // ── Runs ──
  if (method === 'POST' && path === '/api/runs') {
    const config: RunConfig = await readJson(req, CreateRunRequestSchema, 'run config');
    try {
      const run = await orchestrator.create(config, 'ui');
      return send(res, 201, { id: run.id });
    } catch (e) {
      if (e instanceof RunConfigError) throw new HttpError(400, e.message);
      throw e;
    }
  }

  if (method === 'GET' && path === '/api/runs') {
    const q = url.searchParams;
    const list = runs
      .list()
      .filter(
        (r) =>
          (!q.get('issuer') || r.config.issuerId === q.get('issuer')) &&
          (!q.get('wallet') || r.config.walletId === q.get('wallet')) &&
          (!q.get('verifier') || r.config.verifierId === q.get('verifier')) &&
          (!q.get('format') || r.config.format === q.get('format')) &&
          (!q.get('verdict') || r.verdict === q.get('verdict')),
      );
    return send(res, 200, list);
  }

  if (method === 'GET' && (m = path.match(/^\/api\/runs\/([^/]+)$/)))
    return send(res, 200, runOr404(decodeURIComponent(m[1]!)).run);

  if (method === 'GET' && (m = path.match(/^\/api\/runs\/([^/]+)\/exchanges$/))) {
    const runId = decodeURIComponent(m[1]!);
    runOr404(runId);
    const exchanges = getExchangesByRun(runId);
    if (url.searchParams.get('decode') !== 'true') return send(res, 200, exchanges);
    return send(
      res,
      200,
      exchanges.map((ex) => ({
        ...ex,
        decoded: decodeExchange(
          ex.request.body,
          ex.request.contentType,
          ex.response?.body,
          ex.response?.contentType,
        ),
      })),
    );
  }

  if (method === 'POST' && (m = path.match(/^\/api\/runs\/([^/]+)\/manual-evidence$/))) {
    const runId = decodeURIComponent(m[1]!);
    runOr404(runId);
    const body = await readJson(req, ManualEvidenceRequestSchema, 'manual evidence');
    if (!orchestrator.confirmManual(runId, body.step))
      throw new HttpError(409, `Step ${body.step} is not waiting for confirmation`);
    return send(res, 204);
  }

  if (method === 'POST' && (m = path.match(/^\/api\/runs\/([^/]+)\/cancel$/))) {
    const runId = decodeURIComponent(m[1]!);
    runOr404(runId);
    orchestrator.cancel(runId);
    return send(res, 202);
  }

  if (method === 'GET' && (m = path.match(/^\/api\/runs\/([^/]+)\/report$/))) {
    const record = runOr404(decodeURIComponent(m[1]!));
    const report = buildRunReport(record, await registry.list(60_000), UI_ORIGIN);
    if ((url.searchParams.get('format') ?? 'json') === 'md') {
      res.writeHead(200, {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="run-${report.runId}.md"`,
      });
      res.end(renderReportMarkdown(report));
      return;
    }
    return send(res, 200, report, {
      'content-disposition': `attachment; filename="run-${report.runId}.json"`,
    });
  }

  // ── Exchanges / tap ──
  if (method === 'GET' && (m = path.match(/^\/api\/exchanges\/([^/]+)$/))) {
    const ex = getExchangeById(decodeURIComponent(m[1]!));
    if (!ex) throw new HttpError(404, 'Exchange not found');
    return send(res, 200, ex);
  }

  // Seeds correlation keys for flows started outside the orchestrator (e.g. scripts).
  if (method === 'POST' && path === '/api/tap/correlate') {
    const body = await readJson(
      req,
      z.object({ runId: z.string().min(1), keys: z.array(z.string()) }),
      'correlation',
    );
    register(body.runId, ...body.keys);
    return send(res, 200, { registered: body.keys.length });
  }

  if (path.startsWith('/api/')) throw new HttpError(404, `No route for ${method} ${path}`);
  throw new HttpError(404, 'Not found');
}

const server = createServer((req, res) => {
  cors(req, res);
  route(req, res).catch((e: unknown) => {
    if (res.headersSent) return res.end();
    if (e instanceof HttpError)
      return send(res, e.statusCode, { message: e.message, statusCode: e.statusCode });
    if (e instanceof AdapterError) return send(res, 502, { message: e.message, statusCode: 502 });
    console.error('[bff] unhandled error', e);
    send(res, 500, { message: 'Internal error', statusCode: 500 });
  });
});

const io = attachGateway(server, CORS_ORIGINS);
registry.on('health', (event) => broadcastHealth(io, event));

// ── Boot ──────────────────────────────────────────────────────────────────────
for (const tap of TAPS) {
  if (!tap.upstream) {
    console.log(
      `[tap] TAP_UPSTREAM_${tap.component.toUpperCase()} not set — ${tap.component} tap disabled`,
    );
    continue;
  }
  await createTapServer({
    component: tap.component,
    port: tap.port,
    upstream: tap.upstream,
    ...(tap.publicOrigin ? { publicOrigin: tap.publicOrigin } : {}),
  }).listen();
}

server.listen(PORT, () => {
  console.log(
    `[bff] playground-bff listening on :${PORT} (catalog ${CATALOG_DIR}${DATA_DIR ? `, runs saved in ${DATA_DIR}` : ''})`,
  );
  void registry.refresh();
});
setInterval(() => void registry.refresh(), 15_000).unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
