// Headless mock wallet (plan §8.5): a holder that runs without a phone, for CI, tamper runs and
// repeatable demos. The BFF's MockWalletAdapter drives it over this REST API; the wallet itself
// talks to issuers and verifiers on their public URLs, through the Protocol Tap.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  AcceptOfferRequestSchema,
  RespondRequestSchema,
  type HeldCredential,
} from '@playground/shared';
import type { z } from 'zod';
import { WalletError } from './http.ts';
import { createHolderKey } from './keys.ts';
import { acceptOffer } from './oid4vci.ts';
import { respond } from './oid4vp.ts';

const PORT = Number(process.env.PORT ?? 7003);
const holder = await createHolderKey();
const credentials = new Map<string, HeldCredential>();

function send(res: ServerResponse, statusCode: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(statusCode).end();
    return;
  }
  res.writeHead(statusCode, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson<S extends z.ZodType>(req: IncomingMessage, schema: S): Promise<z.infer<S>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new WalletError('request', 'Body is not JSON', 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new WalletError('request', parsed.error.issues[0]?.message ?? 'Invalid body', 400);
  return parsed.data;
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://wallet').pathname;
  try {
    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, { status: 'up', holderDid: holder.did, credentials: credentials.size });
    }
    if (req.method === 'GET' && path === '/credentials')
      return send(res, 200, [...credentials.values()]);

    const del = path.match(/^\/credentials\/([^/]+)$/);
    if (req.method === 'DELETE' && del) {
      return credentials.delete(decodeURIComponent(del[1]!))
        ? send(res, 204)
        : send(res, 404, { message: 'Unknown credential', statusCode: 404 });
    }

    if (req.method === 'POST' && path === '/offers/accept') {
      const held = await acceptOffer(await readJson(req, AcceptOfferRequestSchema), holder);
      credentials.set(held.id, held);
      console.log(
        `[wallet] stored ${held.format} ${held.credentialConfigurationId} from ${held.issuer}`,
      );
      return send(res, 201, held);
    }

    if (req.method === 'POST' && path === '/presentations/respond') {
      const result = await respond(await readJson(req, RespondRequestSchema), holder, [
        ...credentials.values(),
      ]);
      console.log(
        `[wallet] presented ${result.credentialId} → ${result.responseUri} (HTTP ${result.status})${result.tamper ? ` tamper=${result.tamper}` : ''}`,
      );
      for (const w of result.warnings) console.warn(`[wallet] warning: ${w}`);
      return send(res, 200, result);
    }

    send(res, 404, { message: 'Not found', statusCode: 404 });
  } catch (e) {
    if (e instanceof WalletError) {
      console.warn(`[wallet] ${e.step}: ${e.message}`);
      return send(res, e.statusCode, {
        message: e.message,
        statusCode: e.statusCode,
        step: e.step,
        ...(e.upstreamStatus !== undefined ? { upstreamStatus: e.upstreamStatus } : {}),
        ...(e.upstreamBody !== undefined ? { upstreamBody: e.upstreamBody } : {}),
      });
    }
    console.error('[wallet] unexpected error', e);
    send(res, 500, { message: (e as Error).message, statusCode: 500 });
  }
});

server.listen(PORT, () =>
  console.log(`[wallet] mock wallet on :${PORT} as ${holder.did.slice(0, 40)}…`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
