// BFF: health check for Inji services + Protocol Tap + exchanges API.
// Node runs this file directly with type stripping (Node 22+); no build step needed.
import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createTapServer } from './tap/proxy.ts';
import { register } from './tap/correlator.ts';
import { getExchangesByRun, getExchangeById } from './store/exchange-store.ts';
import { decodeExchange } from './decoder/payload-decoder.ts';

// ── Config ────────────────────────────────────────────────────────────────────
interface Target {
  name: string;
  url: string;
  optional?: boolean;
}

type ServiceStatus = 'up' | 'down' | 'not-running';

interface ServiceHealth {
  name: string;
  url: string;
  optional: boolean;
  status: ServiceStatus;
  httpStatus?: number;
  latencyMs: number;
  error?: string;
}

const PORT = Number(process.env.PORT ?? 3001);
const TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS ?? 3000);
const TARGETS: Target[] = JSON.parse(process.env.INJI_HEALTH_TARGETS ?? '[]');

// Protocol Tap config — override via env vars in docker-compose or .env
const TAP_CERTIFY_PORT = Number(process.env.TAP_CERTIFY_PORT ?? 3002);
const TAP_VERIFY_PORT = Number(process.env.TAP_VERIFY_PORT ?? 3003);
const TAP_UPSTREAM_CERTIFY = process.env.TAP_UPSTREAM_CERTIFY ?? '';
const TAP_UPSTREAM_VERIFY = process.env.TAP_UPSTREAM_VERIFY ?? '';

// ── Health probe ──────────────────────────────────────────────────────────────
async function probe(t: Target): Promise<ServiceHealth> {
  const started = performance.now();
  const base = { name: t.name, url: t.url, optional: Boolean(t.optional) };
  try {
    const res = await fetch(t.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel();
    const latencyMs = Math.round(performance.now() - started);
    return { ...base, status: res.ok ? 'up' : 'down', httpStatus: res.status, latencyMs };
  } catch (e) {
    const latencyMs = Math.round(performance.now() - started);
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    const status: ServiceStatus =
      cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN' ? 'not-running' : 'down';
    return { ...base, status, latencyMs, error: cause?.code ?? cause?.message ?? (e as Error).message };
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function send(res: ServerResponse, statusCode: number, body: unknown) {
  res.writeHead(statusCode, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ── BFF HTTP server ───────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://bff').pathname;

  // ── GET /api/health ──────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/health') {
    const services = await Promise.all(TARGETS.map(probe));
    const required = services.filter((s) => !s.optional);
    const status = required.every((s) => s.status === 'up')
      ? 'up'
      : required.some((s) => s.status === 'up')
        ? 'degraded'
        : 'down';
    return send(res, 200, { status, checkedAt: new Date().toISOString(), services });
  }

  // ── GET /api/runs/:id/exchanges ──────────────────────────────────────────
  // Returns all captured Exchange records for a run.
  // Add ?decode=true to include decoded JWT / SD-JWT / JSON-LD payloads.
  const exchangesMatch = path.match(/^\/api\/runs\/([^/]+)\/exchanges$/);
  if (req.method === 'GET' && exchangesMatch) {
    const runId = decodeURIComponent(exchangesMatch[1]!);
    const shouldDecode = new URL(req.url ?? '/', 'http://bff').searchParams.get('decode') === 'true';

    const exchanges = getExchangesByRun(runId);

    if (!shouldDecode) {
      return send(res, 200, exchanges);
    }

    // Attach decoded payloads when ?decode=true
    const withDecoded = exchanges.map((ex) => ({
      ...ex,
      decoded: decodeExchange(
        ex.request.body,
        ex.request.contentType,
        ex.response?.body,
        ex.response?.contentType,
      ),
    }));
    return send(res, 200, withDecoded);
  }

  // ── GET /api/exchanges/:id ────────────────────────────────────────────────
  const singleExchangeMatch = path.match(/^\/api\/exchanges\/([^/]+)$/);
  if (req.method === 'GET' && singleExchangeMatch) {
    const id = decodeURIComponent(singleExchangeMatch[1]!);
    const ex = getExchangeById(id);
    if (!ex) return send(res, 404, { message: 'Exchange not found', statusCode: 404 });
    return send(res, 200, ex);
  }

  // ── POST /api/tap/correlate ───────────────────────────────────────────────
  // Internal: the BFF calls this when it creates a credential offer or presentation
  // request, so the correlator can map the one-time code → runId.
  // Body: { runId: string, keys: string[] }
  if (req.method === 'POST' && path === '/api/tap/correlate') {
    try {
      const body = await readBody(req);
      const { runId, keys } = JSON.parse(body) as { runId: string; keys: string[] };
      if (!runId || !Array.isArray(keys)) {
        return send(res, 400, { message: 'runId (string) and keys (string[]) are required', statusCode: 400 });
      }
      register(runId, ...keys);
      return send(res, 200, { registered: keys.length });
    } catch {
      return send(res, 400, { message: 'Invalid JSON body', statusCode: 400 });
    }
  }

  // ── POST /api/runs ────────────────────────────────────────────────────────
  // Stub: creates a run record and returns its id.
  // (Full run orchestration is Person C's BFF work; this just gives us a runId to test with.)
  if (req.method === 'POST' && path === '/api/runs') {
    const runId = randomUUID();
    console.log(`[bff] Created stub run ${runId}`);
    return send(res, 201, { id: runId });
  }

  // ── Catch-all 501 for unbuilt /api routes ─────────────────────────────────
  if (path.startsWith('/api/')) {
    return send(res, 501, {
      message:
        'Not built yet — this BFF currently serves /api/health, /api/runs/:id/exchanges, /api/tap/correlate.',
      statusCode: 501,
    });
  }

  send(res, 404, { message: 'Not found', statusCode: 404 });
});

// ── Start Protocol Tap proxies ────────────────────────────────────────────────
async function startTaps() {
  if (TAP_UPSTREAM_CERTIFY) {
    const certifyTap = createTapServer({
      component: 'certify-tap',
      port: TAP_CERTIFY_PORT,
      upstream: TAP_UPSTREAM_CERTIFY,
    });
    await certifyTap.listen();
  } else {
    console.log('[tap] TAP_UPSTREAM_CERTIFY not set — Certify tap disabled');
  }

  if (TAP_UPSTREAM_VERIFY) {
    const verifyTap = createTapServer({
      component: 'verify-tap',
      port: TAP_VERIFY_PORT,
      upstream: TAP_UPSTREAM_VERIFY,
    });
    await verifyTap.listen();
  } else {
    console.log('[tap] TAP_UPSTREAM_VERIFY not set — Verify tap disabled');
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
await startTaps();

server.listen(PORT, () =>
  console.log(
    `[bff] playground-bff listening on :${PORT} — checking ${TARGETS.length} services\n` +
    `[bff] tap ports: certify=:${TAP_CERTIFY_PORT} verify=:${TAP_VERIFY_PORT}`,
  ),
);

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
