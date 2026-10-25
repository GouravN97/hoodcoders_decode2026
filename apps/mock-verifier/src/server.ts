// Mock verifier HTTP API (plan §8.4), all under the base path (/mock-verifier):
//   POST api/requests                  create a transaction → openid4vp:// URI (BFF)
//   GET  api/requests/:id/status       long poll: ACTIVE | VP_SUBMITTED | EXPIRED (BFF)
//   GET  api/results/:transactionId    outcome and every check (BFF)
//   POST api/verify-credential         a credential on its own (the BFF's second opinion)
//   GET|POST oid4vp/request/:id        signed request object (wallet)
//   POST oid4vp/response/:id           direct_post (wallet)
//   GET  did.json                      the verifier's did:web document (wallet)
//   GET  health
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { PresentationDefinition } from '@playground/protocol-core';
import {
  MockVerifierCreateRequestSchema,
  MockVerifierVerifyCredentialSchema,
  type MockVerifierCreateResponse,
} from '@playground/shared';
import type { z } from 'zod';
import type { VerifierConfig } from './config.ts';
import { signRequestObject, type VerifierKey } from './keys.ts';
import { TransactionStore } from './transactions.ts';
import { verifyCredentialOnly, verifyResponse } from './verify.ts';

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    /** OAuth error code for wallet-facing endpoints. */
    readonly error?: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, statusCode: number, body: unknown, contentType = 'application/json') {
  res.writeHead(statusCode, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson<S extends z.ZodType>(req: IncomingMessage, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = JSON.parse((await readBody(req)) || '{}');
  } catch {
    throw new HttpError(400, 'Body is not JSON');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid body');
  return parsed.data;
}

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

export function createVerifierServer(config: VerifierConfig, key: VerifierKey, store = new TransactionStore()): Server {
  const ctx = { clientId: config.clientId, trustedIssuers: config.trustedIssuers };

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://verifier');
    if (!url.pathname.startsWith(config.basePath)) throw new HttpError(404, 'Not found');
    const path = url.pathname.slice(config.basePath.length) || '/';
    const method = req.method ?? 'GET';
    let m: RegExpMatchArray | null;

    if (method === 'GET' && path === '/health') return send(res, 200, { status: 'up', clientId: config.clientId });
    if (method === 'GET' && path === '/did.json') return send(res, 200, key.didDocument);

    if (method === 'POST' && path === '/api/requests') {
      const body = await readJson(req, MockVerifierCreateRequestSchema);
      const requestId = `req_${crypto.randomUUID()}`;
      const now = Date.now();
      store.add({
        requestId,
        transactionId: body.transactionId ?? `txn_${randomHex(16)}`,
        nonce: randomHex(16),
        presentationDefinition: body.presentationDefinition as unknown as PresentationDefinition,
        createdAt: now,
        expiresAt: now + config.requestTtlMs,
        submitted: false,
      });
      const requestUri = `${config.publicUrl}/oid4vp/request/${requestId}`;
      const params = new URLSearchParams({ client_id: config.clientId, request_uri: requestUri });
      const answer: MockVerifierCreateResponse = {
        requestId,
        transactionId: store.byRequestId(requestId)!.transactionId,
        authorizationRequestUri: `openid4vp://authorize?${params}`,
        requestUri,
        clientId: config.clientId,
        expiresAt: new Date(now + config.requestTtlMs).toISOString(),
      };
      return send(res, 201, answer);
    }

    if (method === 'GET' && (m = path.match(/^\/api\/requests\/([^/]+)\/status$/))) {
      const tx = store.byRequestId(decodeURIComponent(m[1]!));
      if (!tx) throw new HttpError(404, 'Unknown request');
      const wait = Math.min(Number(url.searchParams.get('wait') ?? 20_000), 55_000);
      return send(res, 200, { status: await store.waitForChange(tx, wait) });
    }

    if (method === 'GET' && (m = path.match(/^\/api\/results\/([^/]+)$/))) {
      const tx = store.byTransactionId(decodeURIComponent(m[1]!));
      if (!tx) throw new HttpError(404, 'Unknown transaction');
      if (!tx.result) throw new HttpError(404, 'No presentation has been submitted for this transaction');
      return send(res, 200, tx.result);
    }

    if (method === 'POST' && path === '/api/verify-credential') {
      const body = await readJson(req, MockVerifierVerifyCredentialSchema);
      return send(res, 200, await verifyCredentialOnly(body.credential, ctx));
    }

    // Wallet-facing: request object by reference. Some wallets POST their metadata here (request_uri_method=post).
    if ((method === 'GET' || method === 'POST') && (m = path.match(/^\/oid4vp\/request\/([^/]+)$/))) {
      const tx = store.byRequestId(decodeURIComponent(m[1]!));
      if (!tx) throw new HttpError(404, 'Unknown request', 'invalid_request_uri');
      if (store.status(tx) === 'EXPIRED') throw new HttpError(400, 'The request has expired', 'invalid_request_uri');
      if (method === 'POST') await readBody(req);
      const jwt = await signRequestObject(key, {
        iss: config.clientId,
        client_id: config.clientId,
        response_type: 'vp_token',
        response_mode: 'direct_post',
        response_uri: `${config.publicUrl}/oid4vp/response/${tx.requestId}`,
        nonce: tx.nonce,
        state: tx.requestId,
        presentation_definition: tx.presentationDefinition,
        client_metadata: {
          client_name: 'Playground mock verifier',
          vp_formats: {
            'vc+sd-jwt': { 'sd-jwt_alg_values': ['ES256', 'EdDSA'], 'kb-jwt_alg_values': ['ES256', 'EdDSA'] },
            'dc+sd-jwt': { 'sd-jwt_alg_values': ['ES256', 'EdDSA'], 'kb-jwt_alg_values': ['ES256', 'EdDSA'] },
          },
        },
      });
      return send(res, 200, jwt, 'application/oauth-authz-req+jwt');
    }

    if (method === 'POST' && (m = path.match(/^\/oid4vp\/response\/([^/]+)$/))) {
      const tx = store.byRequestId(decodeURIComponent(m[1]!));
      if (!tx) throw new HttpError(404, 'Unknown request', 'invalid_request');
      if (tx.submitted) throw new HttpError(400, 'A response was already submitted for this request', 'invalid_request');
      if (store.status(tx) === 'EXPIRED') throw new HttpError(400, 'The request has expired', 'invalid_request');
      const result = await verifyResponse(tx, new URLSearchParams(await readBody(req)), ctx);
      store.submit(tx, result);
      // A response that cannot be used at all is refused here; every other result is fetched by the BFF.
      if (result.outcome === 'REJECTED' && !result.stages.some((s) => s.message.startsWith('The wallet answered with error'))) {
        const reason = result.stages.find((s) => s.status === 'fail')?.message ?? 'Invalid response';
        throw new HttpError(400, reason, 'invalid_request');
      }
      return send(res, 200, {});
    }

    throw new HttpError(404, `No route for ${method} ${path}`);
  };

  return createServer((req, res) => {
    route(req, res).catch((e: unknown) => {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) {
        return send(res, e.statusCode, e.error ? { error: e.error, error_description: e.message } : { message: e.message, statusCode: e.statusCode });
      }
      console.error('[verifier] unexpected error', e);
      send(res, 500, { message: (e as Error).message, statusCode: 500 });
    });
  });
}
