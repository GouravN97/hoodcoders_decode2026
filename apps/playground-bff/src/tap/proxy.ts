// Protocol Tap: a reverse proxy that forwards every request to one upstream (Inji Certify or
// Inji Verify) unchanged while recording the exchange for the Protocol Inspector.
//
//   wallet / Mimoto / BFF → gateway (nginx, public HTTPS host) → Protocol Tap → upstream
//                                                                     ↓
//                                       classify → extract keys → correlate → redact → ExchangeStore
//
// The gateway passes the public URL (X-Forwarded-Proto, Host, X-Original-URI), so exchanges show
// the address the wallet used, not the internal one. The BFF tags its own calls with
// `x-playground-run-id` / `x-playground-caller`; the tap strips both before forwarding.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ProtocolStep, type Exchange } from '@playground/shared';
import { addExchange, assignExchange, nextSeq } from '../store/exchange-store.ts';
import { artifactKindsFor, classifyStep } from './classifier.ts';
import { extractKeys, register, resolve, tryBindArmed } from './correlator.ts';
import { redactExchangeUrl, redactMessage } from './redact.ts';

export const RUN_HEADER = 'x-playground-run-id';
export const CALLER_HEADER = 'x-playground-caller';

export interface TapConfig {
  /** Component name stored on every exchange: 'certify' or 'verify' (matches the inspector's labels). */
  component: string;
  port: number;
  /** e.g. http://certify:8090 */
  upstream: string;
  /** Public origin used when a request arrives without gateway headers (e.g. from the BFF itself). */
  publicOrigin?: string;
  /** Larger bodies are forwarded in full but stored truncated. */
  maxBodyBytes?: number;
}

/** Called for exchanges bound by the armed-window heuristic, so the run can be marked heuristic. */
export type HeuristicListener = (runId: string) => void;
let onHeuristic: HeuristicListener = () => {};
export const onHeuristicBinding = (fn: HeuristicListener) => {
  onHeuristic = fn;
};

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  RUN_HEADER,
  CALLER_HEADER,
  'x-original-uri',
]);

function flattenHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers))
    if (v !== undefined) out[k] = Array.isArray(v) ? v.join(', ') : v;
  return out;
}

const forwardable = (headers: Record<string, string>) =>
  Object.fromEntries(Object.entries(headers).filter(([k]) => !HOP_BY_HOP.has(k.toLowerCase())));

async function readBody(msg: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of msg) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** Who sent the request, in the inspector's vocabulary (bff, wallet, mimoto). */
function inferCaller(headers: Record<string, string>): string {
  if (headers[CALLER_HEADER]) return headers[CALLER_HEADER];
  const ua = headers['user-agent'] ?? '';
  if (/playground-mock-wallet/i.test(ua)) return 'wallet';
  if (
    /mimoto/i.test(ua) ||
    /^(Java|Apache-HttpClient|ReactorNetty|okhttp\/3)/.test(ua) ||
    ua === ''
  )
    return 'mimoto';
  return 'wallet';
}

// ── Adjacency ─────────────────────────────────────────────────────────────
// Metadata and DID document fetches carry no correlation key. A keyless fetch from the same client
// (address + user agent) within ADJACENCY_MS of that client's last correlated request joins its run;
// one made just before a correlated request is adopted when that request arrives.
const ADJACENCY_MS = 30_000;
const KEYLESS_STEPS: ProtocolStep[] = [
  ProtocolStep.VCI_ISSUER_METADATA,
  ProtocolStep.VCI_AS_METADATA,
  ProtocolStep.DID_RESOLUTION,
  ProtocolStep.CONTEXT_FETCH,
  ProtocolStep.STATUS_LIST_FETCH,
];
const lastRunByClient = new Map<string, { runId: string; at: number }>();
const pendingByClient = new Map<string, Array<{ id: string; at: number }>>();

function clientKey(headers: Record<string, string>, remote: string | undefined): string {
  const ip =
    headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || remote || '?';
  return `${ip}|${headers['user-agent'] ?? ''}`;
}

/** The run a keyless exchange belongs to by adjacency, or undefined (it is then kept for adoption). */
function adjacentRun(
  client: string,
  step: ProtocolStep,
  exchangeId: string,
  now: number,
): string | undefined {
  if (!KEYLESS_STEPS.includes(step)) return undefined;
  const last = lastRunByClient.get(client);
  if (last && now - last.at < ADJACENCY_MS) return last.runId;
  const pending = (pendingByClient.get(client) ?? []).filter((p) => now - p.at < ADJACENCY_MS);
  pending.push({ id: exchangeId, at: now });
  pendingByClient.set(client, pending);
  return undefined;
}

function noteCorrelated(client: string, runId: string, now: number) {
  lastRunByClient.set(client, { runId, at: now });
  for (const p of pendingByClient.get(client) ?? [])
    if (now - p.at < ADJACENCY_MS) assignExchange(p.id, runId);
  pendingByClient.delete(client);
}

function truncate(body: string, max: number): string {
  return Buffer.byteLength(body) > max
    ? `${body.slice(0, max)}\n… [truncated by the Protocol Tap at ${max} bytes]`
    : body;
}

export function createTapServer(config: TapConfig) {
  const maxBody = config.maxBodyBytes ?? 2 * 1024 * 1024;

  const server: Server = createServer(async (req, res) => {
    const started = performance.now();
    const ts = new Date().toISOString();
    const method = req.method ?? 'GET';
    const path = req.url ?? '/';
    const reqHeaders = flattenHeaders(req.headers);
    const reqBuffer = await readBody(req);
    const reqBody = reqBuffer.toString('utf8');

    const host = reqHeaders['x-forwarded-host'] ?? reqHeaders['host'];
    const viaGateway = Boolean(reqHeaders['x-forwarded-proto']);
    const publicPath = reqHeaders['x-original-uri'] ?? path;
    const publicUrl =
      viaGateway && host
        ? `${reqHeaders['x-forwarded-proto']}://${host}${publicPath}`
        : `${config.publicOrigin ?? config.upstream}${publicPath}`;

    let status: number | undefined;
    let resHeaders: Record<string, string> = {};
    let resBody = '';
    let resBuffer: Buffer = Buffer.alloc(0);
    try {
      const upstreamRes = await fetch(`${config.upstream}${path}`, {
        method,
        headers: forwardable(reqHeaders),
        body: ['GET', 'HEAD'].includes(method) || reqBuffer.length === 0 ? undefined : reqBuffer,
        redirect: 'manual',
      });
      resBuffer = Buffer.from(await upstreamRes.arrayBuffer());
      resBody = resBuffer.toString('utf8');
      status = upstreamRes.status;
      upstreamRes.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });
      // fetch() has already decoded the body, so the encoding and length headers no longer apply.
      delete resHeaders['content-encoding'];
      delete resHeaders['content-length'];
      delete resHeaders['transfer-encoding'];
      res.writeHead(status, forwardable(resHeaders));
      res.end(resBuffer);
    } catch (err) {
      const cause = (err as { cause?: { code?: string } }).cause;
      resHeaders = { 'content-type': 'application/json' };
      resBody = JSON.stringify({
        error: 'upstream_unreachable',
        message: `${config.upstream}: ${cause?.code ?? String(err)}`,
      });
      res.writeHead(502, resHeaders);
      res.end(resBody);
    }

    record(config, {
      ts,
      method,
      publicUrl,
      status,
      latencyMs: Math.round(performance.now() - started),
      reqHeaders,
      reqBody,
      resHeaders,
      resBody,
      maxBody,
      remote: req.socket.remoteAddress,
    });
  });

  return {
    listen: () =>
      new Promise<void>((done) =>
        server.listen(config.port, () => {
          console.log(
            `[tap] ${config.component} listening on :${config.port} → ${config.upstream}`,
          );
          done();
        }),
      ),
    close: () => new Promise<void>((done) => server.close(() => done())),
    server,
  };
}

function record(
  config: TapConfig,
  r: {
    ts: string;
    method: string;
    publicUrl: string;
    status: number | undefined;
    latencyMs: number;
    reqHeaders: Record<string, string>;
    reqBody: string;
    resHeaders: Record<string, string>;
    resBody: string;
    maxBody: number;
    remote: string | undefined;
  },
): void {
  const step = classifyStep(r.method, r.publicUrl);
  const reqContentType = r.reqHeaders['content-type'];
  const resContentType = r.resHeaders['content-type'];
  const keys = extractKeys({
    url: r.publicUrl,
    requestHeaders: r.reqHeaders,
    requestBody: r.reqBody,
    requestContentType: reqContentType,
    responseHeaders: r.resHeaders,
    responseBody: r.resBody,
    responseContentType: resContentType,
  });

  const id = randomUUID();
  const now = Date.now();
  const client = clientKey(r.reqHeaders, r.remote);
  let runId = r.reqHeaders[RUN_HEADER] || resolve(keys);
  if (!runId) {
    runId = tryBindArmed(config.component, step);
    if (runId) onHeuristic(runId);
  }
  const keyed = Boolean(runId);
  runId ??= adjacentRun(client, step, id, now);
  // Transitive linking: whatever this exchange introduces now belongs to the same run.
  if (runId) register(runId, ...keys);

  const {
    [RUN_HEADER]: _run,
    [CALLER_HEADER]: _caller,
    'x-original-uri': _uri,
    ...storedHeaders
  } = r.reqHeaders;
  const request = redactMessage({
    headers: storedHeaders,
    ...(r.reqBody ? { body: truncate(r.reqBody, r.maxBody) } : {}),
    ...(reqContentType ? { contentType: reqContentType } : {}),
  });
  const response = redactMessage({
    headers: r.resHeaders,
    ...(r.resBody ? { body: truncate(r.resBody, r.maxBody) } : {}),
    ...(resContentType ? { contentType: resContentType } : {}),
  });
  const artifactKinds = artifactKindsFor(step, r.status, r.reqBody, r.resBody);

  const exchange: Exchange = {
    id,
    ...(runId ? { runId } : {}),
    seq: nextSeq(),
    ts: r.ts,
    component: config.component,
    from: inferCaller(r.reqHeaders),
    method: r.method,
    url: redactExchangeUrl(r.publicUrl),
    ...(r.status !== undefined ? { status: r.status } : {}),
    latencyMs: r.latencyMs,
    step,
    request,
    response,
    correlationKeys: keys,
    outOfBand: false,
    ...(artifactKinds ? { artifactKinds } : {}),
  };
  addExchange(exchange);
  if (keyed && runId && !r.reqHeaders[RUN_HEADER]) noteCorrelated(client, runId, now);

  const label = `[tap] ${config.component} ${r.method} ${r.publicUrl} → ${r.status ?? 'ERR'} (${r.latencyMs}ms) [${step}]`;
  console.log(runId ? `${label} run=${runId}` : `${label} (unassigned)`);
}
