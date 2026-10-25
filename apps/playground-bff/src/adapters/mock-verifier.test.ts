// MockVerifierAdapter against the real apps/mock-verifier server, answered by the real mock
// wallet code, in process. No Protocol Tap: the adapter calls the verifier directly.
import type { AddressInfo } from 'node:net';
import type { HeldCredential, ImplementationDescriptor } from '@playground/shared';
import { base64url, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVerifierKey } from '../../../mock-verifier/src/keys.ts';
import { createVerifierServer } from '../../../mock-verifier/src/server.ts';
import { createHolderKey, type HolderKey } from '../../../mock-wallet/src/keys.ts';
import { respond } from '../../../mock-wallet/src/oid4vp.ts';
import { MockVerifierAdapter } from './mock-verifier.ts';
import type { RunContext } from './types.ts';

const ISSUER = 'https://certify.test';
const descriptor: ImplementationDescriptor = {
  id: 'mock-verifier',
  role: 'verifier',
  displayName: 'Mock verifier',
  vendor: 'mock',
  adapter: 'MockVerifierAdapter',
  publicUrl: 'https://verify.test/mock-verifier',
  capabilities: {
    formats: ['vc+sd-jwt', 'dc+sd-jwt'],
    proofSuites: ['ES256'],
    deliveryChannels: ['qr'],
    automation: 'headless',
    supportsTamper: false,
  },
};

let server: ReturnType<typeof createVerifierServer>;
let adapter: MockVerifierAdapter;
let holder: HolderKey;
let issuerKeys: Awaited<ReturnType<typeof generateKeyPair>>;

beforeAll(async () => {
  const config = {
    port: 0,
    basePath: '/mock-verifier',
    publicUrl: '',
    clientId: 'did:web:verify.test:mock-verifier',
    trustedIssuers: [ISSUER],
    trustedMdocCertFiles: [],
    requestTtlMs: 60_000,
  };
  server = createVerifierServer(config, await createVerifierKey(config.clientId));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.publicUrl = `${origin}/mock-verifier`;
  adapter = new MockVerifierAdapter({ ...descriptor, internalUrl: origin }, origin);
  holder = await createHolderKey();
  issuerKeys = await generateKeyPair('ES256', { extractable: true });
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const ctx = (): RunContext => ({
  runId: crypto.randomUUID(),
  signal: new AbortController().signal,
  config: {
    mode: 'full',
    issuerId: 'inji-certify',
    walletId: 'mock-wallet',
    verifierId: 'mock-verifier',
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'FarmerCredentialSdJwt',
    grantType: 'pre-authorized_code',
    presentationFlow: 'cross-device-qr',
    expectedOutcome: 'VALID',
  },
});

async function issue(): Promise<HeldCredential> {
  const disclosure = base64url.encode(JSON.stringify(['salt-1234', 'fullName', 'Ramesh Kumar']));
  const digest = base64url.encode(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(disclosure))),
  );
  const jwt = await new SignJWT({ vct: 'FarmerCredentialSdJwt', _sd: [digest], _sd_alg: 'sha-256', cnf: { kid: holder.kid } })
    .setProtectedHeader({ alg: 'ES256', typ: 'vc+sd-jwt', jwk: await exportJWK(issuerKeys.publicKey) })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .sign(issuerKeys.privateKey);
  return {
    id: crypto.randomUUID(),
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'FarmerCredentialSdJwt',
    issuer: ISSUER,
    raw: `${jwt}~${disclosure}~`,
    receivedAt: new Date().toISOString(),
    holderDid: holder.did,
  };
}

describe('MockVerifierAdapter', () => {
  it('reports up from the verifier health endpoint', async () => {
    expect(await adapter.healthCheck()).toBe('up');
  });

  it('runs a presentation request to a Valid result with every stage', async () => {
    const run = ctx();
    const spec = { id: 'FarmerCredentialSdJwt', format: 'vc+sd-jwt' as const, credentialType: 'FarmerCredentialSdJwt', purpose: 'test' };
    const handle = await adapter.createPresentationRequest(run, spec);
    expect(handle.transactionId).toBe(`txn_${run.runId.replaceAll('-', '')}`);
    expect(handle.authorizationRequestUri).toMatch(/^openid4vp:\/\/authorize\?client_id=did%3Aweb%3Averify\.test%3Amock-verifier&request_uri=/);

    await respond({ authorizationRequestUri: handle.authorizationRequestUri }, holder, [await issue()]);
    expect(await adapter.pollStatus(run, handle)).toBe('VP_SUBMITTED');
    const result = await adapter.fetchResult(run, handle);
    expect(result.outcome).toBe('VALID');
    expect(result.stages?.map((s) => s.id)).toEqual(
      expect.arrayContaining(['response-shape', 'state', 'submission', 'requested-credential', 'issuer-signature', 'disclosures', 'holder-binding', 'validity']),
    );
    expect(result.reason).toBeUndefined();
  });

  it('names the failing stage of an Invalid result', async () => {
    const run = ctx();
    const handle = await adapter.createPresentationRequest(run, {
      id: 'FarmerCredentialSdJwt',
      format: 'vc+sd-jwt',
      credentialType: 'FarmerCredentialSdJwt',
      purpose: 'test',
    });
    await respond({ authorizationRequestUri: handle.authorizationRequestUri, tamper: 'T-SIG-FLIP' }, holder, [await issue()]);
    const result = await adapter.fetchResult(run, handle);
    expect(result.outcome).toBe('INVALID');
    expect(result.reason).toMatch(/^Issuer signature: /);
  });

  it('gives a second opinion on a credential alone', async () => {
    const result = await adapter.verifyCredential(ctx(), (await issue()).raw, 'vc+sd-jwt');
    expect(result.outcome).toBe('VALID');
    expect(result.stages?.find((s) => s.id === 'holder-binding')?.status).toBe('skip');
  });
});
