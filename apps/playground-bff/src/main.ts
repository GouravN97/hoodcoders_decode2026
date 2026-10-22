// Placeholder BFF: reports the health of the Inji services in the sandbox and answers every other
// /api route with 501 until the real BFF (catalog, runs, protocol tap) exists. No dependencies; Node
// runs this file directly by stripping the types.
import { createServer, type ServerResponse } from 'node:http';

interface Target {
  name: string;
  url: string;
  /** Services from optional compose profiles (eSignet, wallet) do not make the stack "degraded". */
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
    // No DNS entry on the compose network means the container is not running (e.g. its profile is off).
    const status: ServiceStatus = cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN' ? 'not-running' : 'down';
    return { ...base, status, latencyMs, error: cause?.code ?? cause?.message ?? (e as Error).message };
  }
}

function send(res: ServerResponse, statusCode: number, body: unknown) {
  res.writeHead(statusCode, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://bff').pathname;

  if (req.method === 'GET' && path === '/api/health') {
    const services = await Promise.all(TARGETS.map(probe));
    const required = services.filter((s) => !s.optional);
    const status = required.every((s) => s.status === 'up') ? 'up' : required.some((s) => s.status === 'up') ? 'degraded' : 'down';
    return send(res, 200, { status, checkedAt: new Date().toISOString(), services });
  }

  if (path.startsWith('/api/')) {
    return send(res, 501, {
      message: 'Not built yet: this placeholder BFF only serves /api/health. The playground UI runs in mock mode until the real BFF exists.',
      statusCode: 501,
    });
  }

  send(res, 404, { message: 'Not found', statusCode: 404 });
});

server.listen(PORT, () => console.log(`playground-bff placeholder listening on :${PORT}, checking ${TARGETS.length} services`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
