// Protocol Tap: an HTTP reverse proxy that transparently forwards requests to an upstream
// service (Certify or Inji Verify) while capturing every exchange for the Protocol Inspector.
//
// Architecture:
//   wallet/browser → Protocol Tap (this file) → real Certify/Verify upstream
//                           ↓
//                    ExchangeStore (in-memory)
//                           ↓
//                    GET /api/runs/:id/exchanges
//
// One TapServer instance handles one upstream. The BFF main.ts starts two: one for Certify
// and one for Verify. Env vars control which ports and upstreams to use.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { classifyStep } from './classifier.ts';
import { extractKeys, resolve } from './correlator.ts';
import { addExchange, nextSeq, type Exchange } from '../store/exchange-store.ts';

export interface TapConfig {
  /** Label for this tap, e.g. 'certify-tap' or 'verify-tap'. Stored on every Exchange. */
  component: string;
  /** Port this tap server listens on. */
  port: number;
  /** Full URL of the upstream to forward to, e.g. 'http://certify:8090' */
  upstream: string;
}

/** Read the full body of an IncomingMessage as a string. */
async function readBody(msg: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    msg.on('data', (chunk: Buffer) => chunks.push(chunk));
    msg.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    msg.on('error', reject);
  });
}

/** Flatten Node's multi-value headers into a simple string→string record. */
function flattenHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

/** Remove hop-by-hop headers before forwarding. */
function stripHopByHop(headers: Record<string, string>): Record<string, string> {
  const HOP_BY_HOP = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade',
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([k]) => !HOP_BY_HOP.has(k.toLowerCase())),
  );
}

export function createTapServer(config: TapConfig) {
  const upstreamUrl = new URL(config.upstream);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const startMs = performance.now();
    const exchangeId = randomUUID();
    const ts = new Date().toISOString();

    // ── 1. Read incoming request ─────────────────────────────────────────
    const reqBody = await readBody(req);
    const reqHeaders = flattenHeaders(req.headers);
    const reqContentType = reqHeaders['content-type'];
    const method = req.method ?? 'GET';
    const incomingUrl = req.url ?? '/';

    // ── 2. Forward to upstream ──────────────────────────────────────────
    const forwardUrl = `${config.upstream}${incomingUrl}`;
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(forwardUrl, {
        method,
        headers: stripHopByHop(reqHeaders),
        body: ['GET', 'HEAD'].includes(method) ? undefined : reqBody || undefined,
        // @ts-ignore — Node 18+ fetch supports this
        duplex: 'half',
      });
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startMs);
      // Save the failed exchange
      const exchange: Exchange = {
        id: exchangeId,
        seq: nextSeq(),
        ts,
        component: config.component,
        from: req.socket.remoteAddress,
        method,
        url: forwardUrl,
        step: classifyStep(method, incomingUrl),
        request: { headers: reqHeaders, body: reqBody || undefined, contentType: reqContentType },
        correlationKeys: [],
        outOfBand: false,
        latencyMs,
      };
      saveExchange(exchange, reqBody, undefined, incomingUrl);

      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream_error', message: String(err) }));
      return;
    }

    // ── 3. Read upstream response ─────────────────────────────────────────
    const resBody = await upstreamRes.text();
    const latencyMs = Math.round(performance.now() - startMs);
    const resHeaders: Record<string, string> = {};
    upstreamRes.headers.forEach((v, k) => { resHeaders[k] = v; });
    const resContentType = resHeaders['content-type'];

    // ── 4. Build & save Exchange ──────────────────────────────────────────
    const exchange: Exchange = {
      id: exchangeId,
      seq: nextSeq(),
      ts,
      component: config.component,
      from: req.socket.remoteAddress,
      method,
      url: forwardUrl,
      status: upstreamRes.status,
      latencyMs,
      step: classifyStep(method, incomingUrl),
      request: { headers: reqHeaders, body: reqBody || undefined, contentType: reqContentType },
      response: { headers: resHeaders, body: resBody || undefined, contentType: resContentType },
      correlationKeys: [],
      outOfBand: false,
    };

    saveExchange(exchange, reqBody, resBody, incomingUrl);

    // ── 5. Return upstream response to the original caller ───────────────
    const forwardHeaders = stripHopByHop(resHeaders);
    res.writeHead(upstreamRes.status, forwardHeaders);
    res.end(resBody);
  });

  return {
    listen: () =>
      new Promise<void>((resolve) => {
        server.listen(config.port, () => {
          console.log(
            `[tap] ${config.component} listening on :${config.port} → ${config.upstream}`,
          );
          resolve();
        });
      }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Extract correlation keys and save the exchange to the store. */
function saveExchange(
  exchange: Exchange,
  reqBody: string | undefined,
  resBody: string | undefined,
  incomingUrl: string,
): void {
  const keys = extractKeys(
    exchange.method,
    incomingUrl,
    reqBody,
    exchange.request.contentType,
    resBody,
  );

  exchange.correlationKeys = keys;
  exchange.runId = resolve(keys);

  addExchange(exchange);

  const label = `[${exchange.component}] ${exchange.method} ${incomingUrl} → ${exchange.status ?? 'ERR'} (${exchange.latencyMs}ms) [${exchange.step}]`;
  if (exchange.runId) {
    console.log(`${label} run=${exchange.runId}`);
  } else {
    console.log(`${label} (unassigned)`);
  }
}
