import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ImplementationDescriptor } from '@playground/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authorizationRequestUri,
  dcqlQueryFor,
  InjiVerifyDcqlAdapter,
  mapErrorDto,
  mapVpVerificationResult,
} from './inji-verify-dcql.ts';
import type { RunContext } from './types.ts';

const CLIENT_ID = 'decentralized_identifier:did:web:injiverify.collab.mosip.net:v1:verify';

const descriptor = {
  id: 'inji-verify-collab',
  role: 'verifier',
  displayName: 'Inji Verify (MOSIP Collab)',
  vendor: 'inji',
  adapter: 'InjiVerifyDcqlAdapter',
  publicUrl: 'https://injiverify.collab.mosip.net',
  clientId: CLIENT_ID,
  capabilities: { formats: ['vc+sd-jwt', 'ldp_vc'], proofSuites: [], deliveryChannels: ['qr'], automation: 'headless', supportsTamper: false },
} as ImplementationDescriptor;

const ok = { valid: true, error: null };
const credential = (over: object = {}) => ({
  allChecksSuccessful: true,
  schemaAndSignatureCheck: ok,
  expiryCheck: ok,
  statusCheck: [],
  holderProofCheck: ok,
  ...over,
});

describe('DCQL query', () => {
  it('asks by vct for SD-JWT and by type for JSON-LD, with a valid query id', () => {
    expect(dcqlQueryFor({ id: 'FarmerCredentialSdJwt', format: 'vc+sd-jwt', credentialType: 'FarmerCredentialSdJwt', purpose: '' })).toEqual({
      credentials: [{ id: 'FarmerCredentialSdJwt', format: 'vc+sd-jwt', meta: { vct_values: ['FarmerCredentialSdJwt'] } }],
    });
    expect(dcqlQueryFor({ id: 'Farmer.Credential', format: 'ldp_vc', credentialType: 'FarmerCredential', purpose: '' })).toEqual({
      credentials: [{ id: 'Farmer_Credential', format: 'ldp_vc', meta: { type_values: [['FarmerCredential']] } }],
    });
  });

  it('refuses a format Inji Verify 1.0 does not take', () => {
    expect(() => dcqlQueryFor({ id: 'm', format: 'mso_mdoc', credentialType: 'org.iso.18013.5.1.mDL', purpose: '' })).toThrow(
      'Inji Verify 1.0 does not accept mso_mdoc',
    );
  });

  it('builds the openid4vp:// URI by reference for a did client and by value otherwise', () => {
    expect(
      authorizationRequestUri(CLIENT_ID, { requestId: 'req_1', transactionId: 't', requestUri: 'https://v.test/v1/verify/v2/vp-request/req_1' }),
    ).toBe(
      `openid4vp://authorize?client_id=${encodeURIComponent(CLIENT_ID)}&request_uri=${encodeURIComponent('https://v.test/v1/verify/v2/vp-request/req_1')}`,
    );
    const byValue = new URL(
      authorizationRequestUri('pre_registered:v.test', {
        requestId: 'req_2',
        transactionId: 't',
        authorizationDetails: { clientId: 'pre_registered:v.test', nonce: 'n', responseUri: 'https://v.test/post', dcqlQuery: { credentials: [] } },
      }),
    ).searchParams;
    expect(Object.fromEntries(byValue)).toMatchObject({ state: 'req_2', nonce: 'n', response_mode: 'direct_post', dcql_query: '{"credentials":[]}' });
  });
});

describe('result mapping', () => {
  it('reads each check: valid, invalid signature, failed holder proof, expired, revoked', () => {
    expect(mapVpVerificationResult({ allChecksSuccessful: true, credentialResults: [credential()] })).toMatchObject({ outcome: 'VALID' });
    expect(
      mapVpVerificationResult({
        allChecksSuccessful: false,
        credentialResults: [credential({ allChecksSuccessful: false, schemaAndSignatureCheck: { valid: false, error: { errorCode: 'ERR_SIGNATURE_VERIFICATION_FAILED' } } })],
      }),
    ).toMatchObject({ outcome: 'INVALID', reason: 'Signature: ERR_SIGNATURE_VERIFICATION_FAILED' });
    expect(
      mapVpVerificationResult({ allChecksSuccessful: false, credentialResults: [credential({ holderProofCheck: { valid: false, error: { errorMessage: 'nonce mismatch' } } })] }),
    ).toMatchObject({ outcome: 'INVALID', reason: 'Holder proof: nonce mismatch' });
    expect(mapVpVerificationResult({ allChecksSuccessful: false, credentialResults: [credential({ expiryCheck: { valid: false } })] })).toMatchObject({ outcome: 'EXPIRED' });
    expect(
      mapVpVerificationResult({ allChecksSuccessful: false, credentialResults: [credential({ statusCheck: [{ purpose: 'revocation', valid: false }] })] }),
    ).toMatchObject({ outcome: 'REVOKED' });
    expect(mapVpVerificationResult({ allChecksSuccessful: false, credentialResults: [] })).toMatchObject({ outcome: 'INVALID', reason: 'No credential results' });
  });

  it('lists every check as a stage', () => {
    const stages = mapVpVerificationResult({ allChecksSuccessful: true, credentialResults: [credential({ holderProofCheck: null })] }).stages!;
    expect(stages.map((s) => [s.label, s.status])).toEqual([
      ['Schema and signature', 'pass'],
      ['Holder proof (nonce, audience, key binding)', 'skip'],
      ['Validity period', 'pass'],
    ]);
  });

  it('reads a refused presentation from an ErrorDto', () => {
    expect(mapErrorDto('{"errorCode":"invalid_request","errorMessage":"vp_token SD-JWT credential vct claim does not match"}')).toMatchObject({
      outcome: 'INVALID',
    });
    expect(mapErrorDto('{"errorCode":"INVALID_TRANSACTION_ID","errorMessage":"x"}')).toMatchObject({ outcome: 'REJECTED' });
    expect(mapErrorDto('not json')).toBeUndefined();
  });
});

describe('InjiVerifyDcqlAdapter against a stand-in for the 1.0 API', () => {
  const seen: Array<{ method: string; path: string; body: string }> = [];
  let server: Server;
  let base = '';
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c));
      req.on('end', () => {
        seen.push({ method: req.method!, path: req.url!, body });
        const json = (status: number, o: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(o));
        if (req.url === '/v1/verify/v2/vp-request')
          return json(201, { requestId: 'req_1', transactionId: JSON.parse(body).transactionId, requestUri: `${base}/v1/verify/v2/vp-request/req_1` });
        if (req.url === '/v1/verify/vp-request/req_1/status') return json(200, { status: 'VP_SUBMITTED' });
        if (req.url?.startsWith('/v1/verify/v2/vp-results/txn_ok'))
          return json(200, { transactionId: 'txn_ok', allChecksSuccessful: true, credentialResults: [credential()] });
        return json(400, { errorCode: 'invalid_request', errorMessage: 'vp_token does not satisfy the DCQL query' });
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const ctx = { runId: 'run-1', config: {}, signal: new AbortController().signal } as unknown as RunContext;

  it('creates a DCQL request, polls and fetches the v2 result', async () => {
    const adapter = new InjiVerifyDcqlAdapter(descriptor, base);
    const handle = await adapter.createPresentationRequest(ctx, { id: 'Farmer', format: 'vc+sd-jwt', credentialType: 'FarmerCredentialSdJwt', purpose: 'p' });
    expect(JSON.parse(seen[0]!.body)).toEqual({
      clientId: CLIENT_ID,
      transactionId: 'txn_run1',
      dcqlQuery: { credentials: [{ id: 'Farmer', format: 'vc+sd-jwt', meta: { vct_values: ['FarmerCredentialSdJwt'] } }] },
    });
    expect(handle.authorizationRequestUri).toContain('request_uri=');
    expect(await adapter.pollStatus(ctx, handle)).toBe('VP_SUBMITTED');
    expect(await adapter.fetchResult(ctx, { ...handle, transactionId: 'txn_ok' })).toMatchObject({ outcome: 'VALID' });
    expect(seen.at(-1)).toMatchObject({ method: 'POST', path: '/v1/verify/v2/vp-results/txn_ok' });
    expect(await adapter.fetchResult(ctx, { ...handle, transactionId: 'txn_bad' })).toMatchObject({
      outcome: 'INVALID',
      reason: 'invalid_request: vp_token does not satisfy the DCQL query',
    });
  });
});
