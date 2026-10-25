// The mock verifier end to end, in process: the real mock wallet code answers its requests over
// HTTP, so these tests also show the two playground mocks interoperate.
import type { AddressInfo } from 'node:net';
import { ed25519MultibaseToJwk, sha256b64url } from '@playground/protocol-core';
import type { HeldCredential, MockVerifierResult } from '@playground/shared';
import { base64url, compactVerify, decodeJwt, exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Test-only: the wallet side of the conversation.
import { createHolderKey, type HolderKey } from '../../mock-wallet/src/keys.ts';
import { respond } from '../../mock-wallet/src/oid4vp.ts';
import { presentSdJwt } from '../../mock-wallet/src/sdjwt.ts';
import type { VerifierConfig } from './config.ts';
import { createVerifierKey, type VerifierKey } from './keys.ts';
import { createVerifierServer } from './server.ts';

const ISSUER = 'https://certify.test';
const config: VerifierConfig = {
  port: 0,
  basePath: '/mock-verifier',
  publicUrl: '',
  clientId: 'did:web:verifier.test:mock-verifier',
  trustedIssuers: [ISSUER],
  requestTtlMs: 60_000,
};
let base = '';
let key: VerifierKey;
let holder: HolderKey;
let issuerKeys: Awaited<ReturnType<typeof generateKeyPair>>;
let server: ReturnType<typeof createVerifierServer>;

beforeAll(async () => {
  key = await createVerifierKey(config.clientId);
  holder = await createHolderKey();
  issuerKeys = await generateKeyPair('ES256', { extractable: true });
  server = createVerifierServer(config, key);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mock-verifier`;
  config.publicUrl = base;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const disclosure = (name: string, value: string) =>
  base64url.encode(JSON.stringify([base64url.encode(crypto.getRandomValues(new Uint8Array(9))), name, value]));

async function issue(opts: { vct?: string; typ?: string; exp?: number } = {}): Promise<HeldCredential> {
  const disclosures = [disclosure('fullName', 'Ramesh Kumar'), disclosure('farmerID', 'FRM-1')];
  let jwt = new SignJWT({
    vct: opts.vct ?? 'FarmerCredentialSdJwt',
    _sd: await Promise.all(disclosures.map(sha256b64url)),
    _sd_alg: 'sha-256',
    cnf: { kid: holder.kid },
  })
    .setProtectedHeader({ alg: 'ES256', typ: opts.typ ?? 'vc+sd-jwt', jwk: await exportJWK(issuerKeys.publicKey) })
    .setIssuer(ISSUER)
    .setIssuedAt();
  if (opts.exp) jwt = jwt.setExpirationTime(opts.exp);
  return {
    id: crypto.randomUUID(),
    format: (opts.typ ?? 'vc+sd-jwt') as HeldCredential['format'],
    credentialConfigurationId: 'FarmerCredentialSdJwt',
    issuer: ISSUER,
    raw: `${await jwt.sign(issuerKeys.privateKey)}~${disclosures.join('~')}~`,
    receivedAt: new Date().toISOString(),
    holderDid: holder.did,
  };
}

async function createRequest(vct = 'FarmerCredentialSdJwt', format = 'vc+sd-jwt') {
  const res = await fetch(`${base}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      presentationDefinition: {
        id: 'pd-1',
        input_descriptors: [
          {
            id: 'farmer',
            format: { [format]: { 'sd-jwt_alg_values': ['ES256'] } },
            constraints: { fields: [{ path: ['$.vct'], filter: { type: 'string', pattern: vct } }] },
          },
        ],
      },
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { requestId: string; transactionId: string; authorizationRequestUri: string };
}

const resultOf = async (txn: string) => (await (await fetch(`${base}/api/results/${txn}`)).json()) as MockVerifierResult;
const stageStatus = (r: MockVerifierResult) => Object.fromEntries(r.stages.map((s) => [s.id, s.status]));

describe('mock verifier', () => {
  it('serves an EdDSA-signed request object that its DID document key verifies', async () => {
    const req = await createRequest();
    const requestUri = new URL(req.authorizationRequestUri).searchParams.get('request_uri')!;
    const jwt = await (await fetch(requestUri)).text();
    const did = (await (await fetch(`${base}/did.json`)).json()) as { verificationMethod: Array<{ id: string; publicKeyMultibase: string }> };
    const { protectedHeader } = await compactVerify(jwt, await importJWK(ed25519MultibaseToJwk(did.verificationMethod[0]!.publicKeyMultibase), 'EdDSA'));
    expect(protectedHeader).toMatchObject({ alg: 'EdDSA', typ: 'oauth-authz-req+jwt', kid: `${config.clientId}#key-0` });
    expect(decodeJwt(jwt)).toMatchObject({ client_id: config.clientId, response_mode: 'direct_post', state: req.requestId });
  });

  it('accepts the mock wallet’s presentation: every check passes and the status long poll sees it', async () => {
    const req = await createRequest();
    const status = fetch(`${base}/api/requests/${req.requestId}/status?wait=5000`).then((r) => r.json());
    const answer = await respond({ authorizationRequestUri: req.authorizationRequestUri }, holder, [await issue()]);
    expect(answer.status).toBe(200);
    expect(await status).toEqual({ status: 'VP_SUBMITTED' });
    const result = await resultOf(req.transactionId);
    expect(result).toMatchObject({ outcome: 'VALID', format: 'vc+sd-jwt', credentialType: 'FarmerCredentialSdJwt', issuer: ISSUER });
    expect(Object.values(stageStatus(result)).every((s) => s === 'pass')).toBe(true);
  });

  it('accepts dc+sd-jwt', async () => {
    const req = await createRequest('FarmerCredentialSdJwt', 'dc+sd-jwt');
    await respond({ authorizationRequestUri: req.authorizationRequestUri }, holder, [await issue({ typ: 'dc+sd-jwt' })]);
    expect((await resultOf(req.transactionId)).outcome).toBe('VALID');
  });

  it.each([
    ['T-SIG-FLIP', 'issuer-signature'],
    ['T-CLAIM-EDIT', 'disclosures'],
  ] as const)('rejects %s as Invalid at the %s check', async (tamper, failing) => {
    const req = await createRequest();
    await respond({ authorizationRequestUri: req.authorizationRequestUri, tamper }, holder, [await issue()]);
    const result = await resultOf(req.transactionId);
    expect(result.outcome).toBe('INVALID');
    expect(stageStatus(result)[failing]).toBe('fail');
  });

  it('rejects a credential of the wrong type, the check Inji Verify 0.18.2 skips', async () => {
    const req = await createRequest('PlaygroundWrongTypeCredential');
    await respond({ authorizationRequestUri: req.authorizationRequestUri, tamper: 'T-WRONG-TYPE' }, holder, [await issue()]);
    const result = await resultOf(req.transactionId);
    expect(result.outcome).toBe('INVALID');
    expect(result.stages.find((s) => s.id === 'requested-credential')).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('PlaygroundWrongTypeCredential'),
    });
  });

  it('rejects a replayed vp_token and one signed over a stale nonce at holder binding', async () => {
    const credential = await issue();
    const first = await createRequest();
    await respond({ authorizationRequestUri: first.authorizationRequestUri }, holder, [credential]);
    expect((await resultOf(first.transactionId)).outcome).toBe('VALID');
    const requestObject = await (await fetch(new URL(first.authorizationRequestUri).searchParams.get('request_uri')!)).text();
    const oldNonce = (decodeJwt(requestObject) as { nonce: string }).nonce;

    // Resubmitted: a vp_token bound to the first request, sent to a second one.
    const oldVp = await presentSdJwt({ raw: credential.raw, holder, nonce: oldNonce, audience: config.clientId });
    const second = await createRequest();
    await respond(
      { authorizationRequestUri: second.authorizationRequestUri, tamper: 'T-NONCE-REPLAY', replay: { variant: 'resubmit-vp', vpToken: oldVp, presentationSubmission: JSON.stringify({ id: 's', definition_id: 'pd-1', descriptor_map: [{ id: 'farmer', format: 'vc+sd-jwt', path: '$' }] }) } },
      holder,
      [credential],
    );
    // Stale nonce: a fresh presentation, signed over the first request's nonce.
    const third = await createRequest();
    await respond(
      { authorizationRequestUri: third.authorizationRequestUri, tamper: 'T-NONCE-REPLAY', replay: { variant: 'stale-nonce', nonce: oldNonce } },
      holder,
      [credential],
    );
    for (const txn of [second.transactionId, third.transactionId]) {
      const result = await resultOf(txn);
      expect(result.outcome).toBe('INVALID');
      expect(result.stages.find((s) => s.id === 'holder-binding')?.message).toContain(`nonce is "${oldNonce}"`);
    }
  });

  it('reports a genuinely signed but expired credential as Expired', async () => {
    const req = await createRequest();
    await respond({ authorizationRequestUri: req.authorizationRequestUri }, holder, [await issue({ exp: Math.floor(Date.now() / 1000) - 3600 })]);
    expect((await resultOf(req.transactionId)).outcome).toBe('EXPIRED');
  });

  it('records a wallet that declines as Rejected, and refuses a wrong state', async () => {
    const declined = await createRequest();
    const post = (id: string, body: Record<string, string>) =>
      fetch(`${base}/oid4vp/response/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
      });
    expect((await post(declined.requestId, { error: 'access_denied', state: declined.requestId })).status).toBe(200);
    expect((await resultOf(declined.transactionId)).outcome).toBe('REJECTED');

    const wrongState = await createRequest();
    const res = await post(wrongState.requestId, { vp_token: 'x~', presentation_submission: '{}', state: 'other' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_request' });
    expect((await resultOf(wrongState.transactionId)).outcome).toBe('REJECTED');
    // One response per request.
    expect((await post(wrongState.requestId, { error: 'access_denied' })).status).toBe(400);
  });

  it('checks a credential on its own for the BFF’s second opinion', async () => {
    const credential = await issue();
    const res = await fetch(`${base}/api/verify-credential`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: credential.raw }),
    });
    const result = (await res.json()) as MockVerifierResult;
    expect(result.outcome).toBe('VALID');
    expect(stageStatus(result)['holder-binding']).toBe('skip');
  });
});
