import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { ProtocolStep } from '@playground/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStore, getExchangesByRun, getUnassigned } from '../store/exchange-store.ts';
import { artifactKindsFor, classifyStep } from './classifier.ts';
import { clearCorrelator, extractKeys, hashKey, register, resolve } from './correlator.ts';
import { createTapServer, RUN_HEADER } from './proxy.ts';
import { mask, redactBody, redactMessage } from './redact.ts';

const jwt = (payload: object) =>
  `${Buffer.from('{"alg":"EdDSA"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

describe('classifyStep', () => {
  it.each([
    [
      'GET',
      'https://certify.localhost:8443/.well-known/openid-credential-issuer',
      ProtocolStep.VCI_ISSUER_METADATA,
    ],
    ['POST', '/v1/certify/pre-authorized-data', ProtocolStep.VCI_CREDENTIAL_OFFER],
    ['GET', '/v1/certify/credential-offer-data/7383bfb7', ProtocolStep.VCI_CREDENTIAL_OFFER],
    ['POST', '/v1/certify/oauth/token', ProtocolStep.VCI_TOKEN],
    ['POST', '/v1/certify/issuance/credential', ProtocolStep.VCI_CREDENTIAL],
    ['POST', '/v1/verify/vp-request', ProtocolStep.VERIFY_CREATE_REQUEST],
    ['GET', '/v1/verify/vp-request/req_123', ProtocolStep.VP_REQUEST_OBJECT],
    ['GET', '/v1/verify/vp-request/req_123/status', ProtocolStep.VERIFY_STATUS],
    ['POST', '/v1/verify/vp-submission/direct-post', ProtocolStep.VP_RESPONSE],
    ['GET', '/v1/verify/vp-result/txn_1', ProtocolStep.VERIFY_RESULT],
    ['GET', '/v1/verify/did.json', ProtocolStep.DID_RESOLUTION],
    ['POST', '/v1/verify/vc-verification', ProtocolStep.VC_DIRECT_VERIFY],
    ['GET', '/v1/certify/actuator/health', ProtocolStep.UNKNOWN],
    // The mock verifier, published under /mock-verifier on the Verify host.
    ['POST', '/mock-verifier/api/requests', ProtocolStep.VERIFY_CREATE_REQUEST],
    ['GET', '/mock-verifier/api/requests/req_1/status?wait=50000', ProtocolStep.VERIFY_STATUS],
    ['GET', '/mock-verifier/api/results/txn_1', ProtocolStep.VERIFY_RESULT],
    ['POST', '/mock-verifier/api/verify-credential', ProtocolStep.VC_DIRECT_VERIFY],
    ['GET', '/mock-verifier/oid4vp/request/req_1', ProtocolStep.VP_REQUEST_OBJECT],
    ['POST', '/mock-verifier/oid4vp/request/req_1', ProtocolStep.VP_REQUEST_OBJECT],
    ['POST', '/mock-verifier/oid4vp/response/req_1', ProtocolStep.VP_RESPONSE],
    ['GET', 'https://verify.localhost:8443/mock-verifier/did.json', ProtocolStep.DID_RESOLUTION],
  ])('%s %s → %s', (method, url, step) => {
    expect(classifyStep(method, url)).toBe(step);
  });

  it('names the artifacts of successful exchanges only', () => {
    expect(artifactKindsFor(ProtocolStep.VCI_CREDENTIAL, 200, '', '{}')).toEqual(['credential']);
    expect(artifactKindsFor(ProtocolStep.VCI_CREDENTIAL, 400, '', '{}')).toBeUndefined();
    expect(artifactKindsFor(ProtocolStep.VP_RESPONSE, 200, 'vp_token=x&state=y', '')).toEqual([
      'vp_token',
      'presentation_submission',
    ]);
  });
});

describe('correlator', () => {
  beforeEach(() => {
    clearCorrelator();
    clearStore();
  });

  it('follows offer → token → credential through the code and the bearer token', () => {
    register('run-1', 'offer-1');
    // Wallet fetches the offer: the path id matches, the response introduces the pre-authorized code.
    const offerKeys = extractKeys({
      url: 'https://certify.localhost:8443/v1/certify/credential-offer-data/offer-1',
      requestHeaders: {},
      responseBody: JSON.stringify({
        grants: {
          'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
            'pre-authorized_code': 'CODE123',
          },
        },
      }),
      responseContentType: 'application/json',
    });
    expect(offerKeys).toContain('offer-1');
    expect(offerKeys).toContain(hashKey('CODE123'));
    expect(offerKeys).not.toContain('CODE123');
    expect(resolve(offerKeys)).toBe('run-1');
    register('run-1', ...offerKeys);

    // Token request carries the code; its response introduces the access token.
    const tokenKeys = extractKeys({
      url: '/v1/certify/oauth/token',
      requestHeaders: {},
      requestBody:
        'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code&pre-authorized_code=CODE123',
      requestContentType: 'application/x-www-form-urlencoded',
      responseBody: '{"access_token":"AT-SECRET-VALUE","c_nonce":"n-1"}',
    });
    expect(resolve(tokenKeys)).toBe('run-1');
    register('run-1', ...tokenKeys);

    // Credential request: only the Authorization header links it.
    const credKeys = extractKeys({
      url: '/v1/certify/issuance/credential',
      requestHeaders: { authorization: 'Bearer AT-SECRET-VALUE' },
      requestBody: '{"format":"vc+sd-jwt"}',
      requestContentType: 'application/json',
    });
    expect(credKeys).toEqual([hashKey('AT-SECRET-VALUE')]);
    expect(resolve(credKeys)).toBe('run-1');
  });

  it('links presentation traffic by request id, state and the request object', () => {
    register('run-2', 'req_abcdef12', 'txn_abcdef12');
    expect(
      resolve(extractKeys({ url: '/v1/verify/vp-request/req_abcdef12', requestHeaders: {} })),
    ).toBe('run-2');
    expect(
      resolve(
        extractKeys({
          url: '/v1/verify/vp-submission/direct-post',
          requestHeaders: {},
          requestBody: 'vp_token=x&presentation_submission=%7B%7D&state=req_abcdef12',
          requestContentType: 'application/x-www-form-urlencoded',
        }),
      ),
    ).toBe('run-2');
    expect(
      extractKeys({
        url: '/x',
        requestHeaders: {},
        responseBody: jwt({ state: 'S1', nonce: 'N1' }),
      }),
    ).toEqual(['S1', 'N1']);
  });
});

describe('redaction', () => {
  it('masks secret headers and fields but keeps the body layout', () => {
    const body = '{\n  "access_token": "abcdefghijklmnopqrstuvwxyz",\n  "c_nonce": "keep-me"\n}';
    expect(redactBody(body, 'application/json')).toBe(
      '{\n  "access_token": "abcd…wxyz",\n  "c_nonce": "keep-me"\n}',
    );
    const form = redactBody(
      'grant_type=x&pre-authorized_code=0123456789abcdef',
      'application/x-www-form-urlencoded',
    );
    expect(new URLSearchParams(form).get('pre-authorized_code')).toBe(mask('0123456789abcdef'));
    const msg = redactMessage({
      headers: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz', accept: '*/*' },
    });
    expect(msg.headers).toEqual({ authorization: 'Bearer abcd…wxyz', accept: '*/*' });
  });

  it('reveals secrets when TAP_REVEAL_SECRETS=true', () => {
    process.env.TAP_REVEAL_SECRETS = 'true';
    try {
      expect(
        redactMessage({ headers: { authorization: 'Bearer abcdefghijklmnop' } }).headers
          .authorization,
      ).toBe('Bearer abcdefghijklmnop');
    } finally {
      delete process.env.TAP_REVEAL_SECRETS;
    }
  });
});

describe('Protocol Tap proxy', () => {
  let upstream: Server;
  let tap: ReturnType<typeof createTapServer>;
  const seen: Array<{ url?: string; headers: Record<string, unknown> }> = [];

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      seen.push({ url: req.url, headers: req.headers });
      if (req.url === '/v1/certify/oauth/token') {
        res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
        res.end(gzipSync('{"access_token":"0123456789abcdefXYZ","token_type":"Bearer"}'));
      } else if (req.url === '/redirect') {
        res.writeHead(302, { location: '/elsewhere' }).end();
      } else
        res
          .writeHead(400, { 'content-type': 'application/json' })
          .end('{"error":"invalid_request"}');
    });
    await new Promise<void>((r) => upstream.listen(0, r));
    const port = (upstream.address() as { port: number }).port;
    tap = createTapServer({
      component: 'certify',
      port: 0,
      upstream: `http://127.0.0.1:${port}`,
      publicOrigin: 'https://certify.test',
    });
    await new Promise<void>((r) => tap.server.listen(0, r));
  });
  afterAll(async () => {
    await tap.close();
    await new Promise((r) => upstream.close(r));
  });
  beforeEach(() => {
    clearCorrelator();
    clearStore();
  });

  const tapUrl = (path: string) =>
    `http://127.0.0.1:${(tap.server.address() as { port: number }).port}${path}`;

  it('forwards unchanged, records the exchange masked and correlates by the run header', async () => {
    const res = await fetch(tapUrl('/v1/certify/oauth/token'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', [RUN_HEADER]: 'run-9' },
      body: 'pre-authorized_code=0123456789abcdef',
    });
    // The upstream gzip body arrives decoded and readable (no stale content-encoding).
    expect(await res.json()).toEqual({ access_token: '0123456789abcdefXYZ', token_type: 'Bearer' });
    expect(seen.at(-1)!.headers[RUN_HEADER]).toBeUndefined();

    const [ex] = getExchangesByRun('run-9');
    expect(ex).toMatchObject({
      component: 'certify',
      step: ProtocolStep.VCI_TOKEN,
      status: 200,
      url: 'https://certify.test/v1/certify/oauth/token',
    });
    expect(ex!.response!.body).toContain('"access_token":"0123…fXYZ"');
    expect(ex!.request.body).not.toContain('0123456789abcdef');
    // The access token it introduced is now linked to the run.
    expect(resolve([hashKey('0123456789abcdefXYZ')])).toBe('run-9');
  });

  it('does not follow redirects and keeps error responses', async () => {
    const res = await fetch(tapUrl('/redirect'), { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/elsewhere');
    const bad = await fetch(tapUrl('/v1/certify/issuance/credential'), {
      method: 'POST',
      body: '{}',
    });
    expect(bad.status).toBe(400);
    expect(getUnassigned().map((e) => e.status)).toEqual([302, 400]);
  });
});
