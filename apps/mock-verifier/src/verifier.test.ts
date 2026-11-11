// The mock verifier end to end, in process: the real mock wallet code answers its requests over
// HTTP, so these tests also show the two playground mocks interoperate.
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDeviceResponse,
  createMdoc,
  ed25519MultibaseToJwk,
  pemToDer,
  sha256b64url,
  TEST_MDOC_ISSUER_CERT_PEM,
  TEST_MDOC_ISSUER_KEY_PEM,
} from '@playground/protocol-core';
import type { HeldCredential, MockVerifierResult } from '@playground/shared';
import { base64url, compactVerify, decodeJwt, exportJWK, generateKeyPair, importJWK, importPKCS8, SignJWT, type CryptoKey } from 'jose';
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
  trustedMdocCertFiles: [join(mkdtempSync(join(tmpdir(), 'mdoc-trust-')), 'issuer.crt')],
  requestTtlMs: 60_000,
};
let base = '';
let key: VerifierKey;
let holder: HolderKey;
let issuerKeys: Awaited<ReturnType<typeof generateKeyPair>>;
let server: ReturnType<typeof createVerifierServer>;

beforeAll(async () => {
  writeFileSync(config.trustedMdocCertFiles[0]!, TEST_MDOC_ISSUER_CERT_PEM);
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

/** An OpenID4VP 1.0 request: direct_post with one DCQL credential query. */
async function dcqlRequest(credentialQuery: object) {
  const res = await fetch(`${base}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dcqlQuery: { credentials: [credentialQuery] } }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { requestId: string; transactionId: string; authorizationRequestUri: string; clientId: string };
}

/** The request object behind an openid4vp:// URI, decoded. */
const requestObjectOf = async (authorizationRequestUri: string) =>
  decodeJwt(await (await fetch(new URL(authorizationRequestUri).searchParams.get('request_uri')!)).text()) as {
    client_id: string;
    nonce: string;
    response_uri: string;
    state: string;
    dcql_query?: unknown;
    presentation_definition?: unknown;
    client_metadata: Record<string, unknown>;
  };

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

  it('reads a JSON-encoded vp_token, as Inji Wallet sends it, and says so', async () => {
    const req = await createRequest();
    const requestObject = decodeJwt(await (await fetch(new URL(req.authorizationRequestUri).searchParams.get('request_uri')!)).text()) as { nonce: string };
    const vp = await presentSdJwt({ raw: (await issue()).raw, holder, nonce: requestObject.nonce, audience: config.clientId });
    const res = await fetch(`${base}/oid4vp/response/${req.requestId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        vp_token: JSON.stringify(vp),
        presentation_submission: JSON.stringify({ id: 's', definition_id: 'pd-1', descriptor_map: [{ id: 'farmer', format: 'vc+sd-jwt', path: '$' }] }),
        state: req.requestId,
      }),
    });
    expect(res.status).toBe(200);
    const result = await resultOf(req.transactionId);
    expect(result.outcome).toBe('VALID');
    expect(stageStatus(result)['response-shape']).toBe('warn');
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

  describe('mso_mdoc', () => {
    const MDL = 'org.iso.18013.5.1.mDL';
    const issueMdoc = async (validUntil = new Date(Date.now() + 86_400_000)): Promise<HeldCredential> => ({
      id: crypto.randomUUID(),
      format: 'mso_mdoc',
      credentialConfigurationId: 'MockMDL',
      issuer: 'https://certify.test/mdoc',
      raw: await createMdoc({
        docType: MDL,
        // An element the request does not ask for comes first, as in Certify's mDL: tampers must
        // still change what is disclosed.
        nameSpaces: { 'org.iso.18013.5.1': { issue_date: '2026-10-25', family_name: 'Kumar', given_name: 'Ramesh', birth_date: '1984-03-12' } },
        issuerKey: (await importPKCS8(TEST_MDOC_ISSUER_KEY_PEM, 'ES256')) as CryptoKey,
        issuerCertificate: pemToDer(TEST_MDOC_ISSUER_CERT_PEM)[0]!,
        deviceJwk: holder.publicJwk,
        validFrom: new Date(Date.now() - 86_400_000),
        validUntil,
        wrapped: true,
      }),
      receivedAt: new Date().toISOString(),
      holderDid: holder.did,
    });
    const mdocRequest = async (docType = MDL) => {
      const res = await fetch(`${base}/api/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          presentationDefinition: {
            id: 'pd-mdoc',
            input_descriptors: [
              {
                id: docType,
                format: { mso_mdoc: { alg: ['ES256'] } },
                constraints: {
                  limit_disclosure: 'required',
                  fields: [{ path: ["$['org.iso.18013.5.1']['family_name']"], intent_to_retain: false }],
                },
              },
            ],
          },
        }),
      });
      return (await res.json()) as { requestId: string; transactionId: string; authorizationRequestUri: string };
    };

    it('verifies the mock wallet’s DeviceResponse: issuer signature, trust, digests, device signature', async () => {
      const req = await mdocRequest();
      expect((await respond({ authorizationRequestUri: req.authorizationRequestUri }, holder, [await issueMdoc()])).status).toBe(200);
      const result = await resultOf(req.transactionId);
      expect(result).toMatchObject({ outcome: 'VALID', format: 'mso_mdoc', credentialType: MDL });
      // The wrapper Certify issues is reported, not failed.
      expect(stageStatus(result)).toMatchObject({ 'requested-credential': 'pass', 'issuer-signature': 'pass', 'issuer-trust': 'pass', digests: 'pass', 'holder-binding': 'pass', validity: 'pass' });
    });

    it.each([
      ['T-SIG-FLIP', 'issuer-signature'],
      ['T-CLAIM-EDIT', 'digests'],
    ] as const)('rejects %s mDocs at the %s check', async (tamper, failing) => {
      const req = await mdocRequest();
      await respond({ authorizationRequestUri: req.authorizationRequestUri, tamper }, holder, [await issueMdoc()]);
      const result = await resultOf(req.transactionId);
      expect(result.outcome).toBe('INVALID');
      expect(stageStatus(result)[failing]).toBe('fail');
    });

    it('rejects an mDoc of another docType and reports an expired one as Expired', async () => {
      const wrong = await mdocRequest('org.example.other.1');
      await respond({ authorizationRequestUri: wrong.authorizationRequestUri, tamper: 'T-WRONG-TYPE' }, holder, [await issueMdoc()]);
      expect((await resultOf(wrong.transactionId)).stages.find((s) => s.id === 'requested-credential')).toMatchObject({ status: 'fail', message: expect.stringContaining('org.example.other.1') });
      const expired = await mdocRequest();
      await respond({ authorizationRequestUri: expired.authorizationRequestUri }, holder, [await issueMdoc(new Date(Date.now() - 3_600_000))]);
      expect((await resultOf(expired.transactionId)).outcome).toBe('EXPIRED');
    });

    it('checks an mDoc credential on its own for the second opinion', async () => {
      const res = await fetch(`${base}/api/verify-credential`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: (await issueMdoc()).raw, format: 'mso_mdoc' }),
      });
      const result = (await res.json()) as MockVerifierResult;
      expect(result.outcome).toBe('VALID');
      expect(stageStatus(result)['holder-binding']).toBe('skip');
    });

    describe('over OpenID4VP 1.0 (DCQL), as Paradym asks for it', () => {
      const mdlQuery = (doctype = MDL) => ({
        id: 'mdl',
        format: 'mso_mdoc',
        meta: { doctype_value: doctype },
        claims: [{ path: ['org.iso.18013.5.1', 'family_name'], intent_to_retain: false }],
      });

      it('verifies a DeviceResponse signed over the 1.0 OpenID4VPHandover', async () => {
        const req = await dcqlRequest(mdlQuery());
        expect((await respond({ authorizationRequestUri: req.authorizationRequestUri }, holder, [await issueMdoc()])).status).toBe(200);
        const result = await resultOf(req.transactionId);
        expect(result).toMatchObject({ outcome: 'VALID', format: 'mso_mdoc', credentialType: MDL });
        expect(stageStatus(result)).toMatchObject({
          'response-shape': 'pass',
          state: 'pass',
          submission: 'skip',
          'requested-credential': 'pass',
          'issuer-signature': 'pass',
          digests: 'pass',
          'holder-binding': 'pass',
          validity: 'pass',
        });
      });

      it('fails holder binding for a device signature over the draft-23 (ISO 18013-7 Annex B) transcript', async () => {
        const req = await dcqlRequest(mdlQuery());
        const ro = await requestObjectOf(req.authorizationRequestUri);
        const vpToken = await buildDeviceResponse({
          credential: (await issueMdoc()).raw,
          deviceKey: holder.privateKey,
          handover: { clientId: ro.client_id, responseUri: ro.response_uri, nonce: ro.nonce },
        });
        await fetch(ro.response_uri, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ vp_token: JSON.stringify({ mdl: [vpToken] }), state: ro.state }),
        });
        expect(stageStatus(await resultOf(req.transactionId))['holder-binding']).toBe('fail');
      });

      it('rejects an mDoc of another docType', async () => {
        const req = await dcqlRequest(mdlQuery('org.example.other.1'));
        await respond({ authorizationRequestUri: req.authorizationRequestUri, tamper: 'T-WRONG-TYPE' }, holder, [await issueMdoc()]);
        const result = await resultOf(req.transactionId);
        expect(result.outcome).toBe('INVALID');
        expect(result.stages.find((s) => s.id === 'requested-credential')).toMatchObject({ status: 'fail', message: expect.stringContaining('org.example.other.1') });
      });
    });
  });

  describe('OpenID4VP 1.0 over openid4vp:// (DCQL, direct_post)', () => {
    const sdJwtQuery = { id: 'farmer', format: 'dc+sd-jwt', meta: { vct_values: ['FarmerCredentialSdJwt'] } };

    it('signs a 1.0 request object: prefixed client_id, dcql_query, vp_formats_supported', async () => {
      const req = await dcqlRequest(sdJwtQuery);
      const prefixed = `decentralized_identifier:${config.clientId}`;
      expect(req.clientId).toBe(prefixed);
      expect(new URL(req.authorizationRequestUri).searchParams.get('client_id')).toBe(prefixed);
      const requestUri = new URL(req.authorizationRequestUri).searchParams.get('request_uri')!;
      const jwt = await (await fetch(requestUri)).text();
      const did = (await (await fetch(`${base}/did.json`)).json()) as { verificationMethod: Array<{ publicKeyMultibase: string }> };
      const { protectedHeader } = await compactVerify(jwt, await importJWK(ed25519MultibaseToJwk(did.verificationMethod[0]!.publicKeyMultibase), 'EdDSA'));
      // The kid's DID is the client_id without its prefix.
      expect(protectedHeader.kid).toBe(`${config.clientId}#key-0`);
      const ro = decodeJwt(jwt);
      expect(ro).toMatchObject({ client_id: prefixed, response_mode: 'direct_post', state: req.requestId, dcql_query: { credentials: [sdJwtQuery] } });
      expect(ro.presentation_definition).toBeUndefined();
      expect(ro.client_metadata).toHaveProperty('vp_formats_supported.mso_mdoc');
    });

    it('accepts a presentation keyed by the credential query id, bound to the prefixed client_id', async () => {
      const req = await dcqlRequest(sdJwtQuery);
      expect((await respond({ authorizationRequestUri: req.authorizationRequestUri }, holder, [await issue({ typ: 'dc+sd-jwt' })])).status).toBe(200);
      const result = await resultOf(req.transactionId);
      expect(result.outcome).toBe('VALID');
      expect(stageStatus(result)).toMatchObject({ 'response-shape': 'pass', state: 'pass', submission: 'skip', 'requested-credential': 'pass', 'holder-binding': 'pass' });
    });

    it('fails holder binding when the key-binding aud is the bare DID', async () => {
      const req = await dcqlRequest(sdJwtQuery);
      const ro = await requestObjectOf(req.authorizationRequestUri);
      const vp = await presentSdJwt({ raw: (await issue({ typ: 'dc+sd-jwt' })).raw, holder, nonce: ro.nonce, audience: config.clientId });
      await fetch(ro.response_uri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ vp_token: JSON.stringify({ farmer: [vp] }), state: ro.state }),
      });
      expect(stageStatus(await resultOf(req.transactionId))['holder-binding']).toBe('fail');
    });

    it('refuses a wrong state at direct_post and records a declining wallet as Rejected', async () => {
      const req = await dcqlRequest(sdJwtQuery);
      const ro = await requestObjectOf(req.authorizationRequestUri);
      const bad = await fetch(ro.response_uri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ vp_token: JSON.stringify({ farmer: ['x~'] }), state: 'other' }),
      });
      expect(bad.status).toBe(400);
      const declined = await dcqlRequest(sdJwtQuery);
      const ro2 = await requestObjectOf(declined.authorizationRequestUri);
      await fetch(ro2.response_uri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ error: 'access_denied', state: ro2.state }),
      });
      expect((await resultOf(declined.transactionId)).outcome).toBe('REJECTED');
    });
  });

  describe('Digital Credentials API (OpenID4VP 1.0, DCQL)', () => {
    const ORIGIN = 'https://playground.test';
    const dcRequest = async () => {
      const res = await fetch(`${base}/api/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          responseMode: 'dc_api',
          dcqlQuery: {
            credentials: [{ id: 'farmer', format: 'vc+sd-jwt', meta: { vct_values: ['FarmerCredentialSdJwt'] }, claims: [{ path: ['fullName'] }] }],
          },
        }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as { requestId: string; transactionId: string; authorizationRequestUri?: string; dcApiRequest: { protocol: string; data: { nonce: string; response_mode: string } } };
    };
    const answer = (requestId: string, origin: string, vpToken: unknown) =>
      fetch(`${base}/api/dc-api/${requestId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin, data: { vp_token: { farmer: vpToken } } }),
      });

    it('builds an unsigned DCQL request and accepts a presentation bound to the page origin', async () => {
      const req = await dcRequest();
      expect(req.authorizationRequestUri).toBeUndefined();
      expect(req.dcApiRequest).toMatchObject({ protocol: 'openid4vp-v1-unsigned', data: { response_mode: 'dc_api' } });
      const credential = await issue();
      const vp = await presentSdJwt({ raw: credential.raw, holder, nonce: req.dcApiRequest.data.nonce, audience: `origin:${ORIGIN}` });
      expect((await answer(req.requestId, ORIGIN, [vp])).status).toBe(200);
      const result = await resultOf(req.transactionId);
      expect(result.outcome).toBe('VALID');
      expect(stageStatus(result)).toMatchObject({ 'response-shape': 'pass', state: 'skip', 'requested-credential': 'pass', 'holder-binding': 'pass' });
    });

    it('fails holder binding for another origin, and the request has no request object to fetch', async () => {
      const req = await dcRequest();
      const vp = await presentSdJwt({ raw: (await issue()).raw, holder, nonce: req.dcApiRequest.data.nonce, audience: 'origin:https://evil.test' });
      await answer(req.requestId, ORIGIN, [vp]);
      expect(stageStatus(await resultOf(req.transactionId))['holder-binding']).toBe('fail');
      expect((await fetch(`${base}/oid4vp/request/${req.requestId}`)).status).toBe(400);
    });

    it('rejects a response without a presentation for the credential query', async () => {
      const req = await dcRequest();
      await answer(req.requestId, ORIGIN, []);
      expect((await resultOf(req.transactionId)).outcome).toBe('REJECTED');
    });
  });
});
