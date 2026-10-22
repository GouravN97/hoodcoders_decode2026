// Orchestrator evidence logic with fake adapters: the fake wallet "sends" its protocol messages
// by adding correlated exchanges, exactly as the Protocol Tap would.
import { randomUUID } from 'node:crypto';
import {
  ProtocolStep,
  type CatalogEntry,
  type Exchange,
  type ImplementationDescriptor,
  type RunConfig,
  type RunDetail,
  type RunEvent,
} from '@playground/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IssuerAdapter, VerifierAdapter, WalletAdapter } from '../adapters/types.ts';
import type { ImplementationRegistry } from '../catalog/registry.ts';
import { addExchange, clearStore, nextSeq } from '../store/exchange-store.ts';
import { RunOrchestrator } from './orchestrator.ts';
import { RunStore, runEvents } from './store.ts';

function exchange(
  runId: string,
  step: ProtocolStep,
  opts: {
    status?: number;
    from?: string;
    method?: string;
    resBody?: string;
    reqBody?: string;
  } = {},
): void {
  const ex: Exchange = {
    id: randomUUID(),
    runId,
    seq: nextSeq(),
    ts: new Date().toISOString(),
    component: step.startsWith('oid4vci') ? 'certify' : 'verify',
    from: opts.from ?? 'wallet',
    method: opts.method ?? 'POST',
    url: `https://test/${step}`,
    status: opts.status ?? 200,
    step,
    request: {
      headers: {},
      ...(opts.reqBody
        ? { body: opts.reqBody, contentType: 'application/x-www-form-urlencoded' }
        : {}),
    },
    response: { headers: {}, ...(opts.resBody ? { body: opts.resBody } : {}) },
    correlationKeys: [],
    outOfBand: false,
  };
  addExchange(ex);
}

const descriptor = (
  id: string,
  role: 'issuer' | 'wallet' | 'verifier',
  automation: 'headless' | 'human-in-the-loop' = 'headless',
): ImplementationDescriptor => ({
  id,
  role,
  displayName: id,
  vendor: 'mock',
  adapter: 'X',
  publicUrl: 'https://test',
  capabilities: {
    formats: ['vc+sd-jwt'],
    proofSuites: ['ES256'],
    deliveryChannels: ['api'],
    automation,
    supportsTamper: true,
  },
});

interface Scenario {
  tokenStatus?: number;
  walletSilent?: boolean;
  human?: boolean;
  outcome?: 'VALID' | 'INVALID';
}

function setup(s: Scenario) {
  const issuer: IssuerAdapter = {
    descriptor: descriptor('issuer', 'issuer'),
    healthCheck: async () => 'up',
    version: async () => '1',
    listCredentialConfigurations: async () => [
      {
        id: 'Farmer',
        format: 'vc+sd-jwt',
        displayName: 'Farmer',
        credentialType: 'FarmerVct',
        proofSuites: ['ES256'],
      },
    ],
    prepareIssuance: async (ctx) => {
      exchange(ctx.runId, ProtocolStep.VCI_CREDENTIAL_OFFER, { from: 'bff' });
      return {
        offerUri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Ftest%2Foffer%2F1',
        offerId: '1',
      };
    },
  };
  let respondedAt = 0;
  const wallet: WalletAdapter = {
    descriptor: descriptor('wallet', 'wallet', s.human ? 'human-in-the-loop' : 'headless'),
    healthCheck: async () => 'up',
    version: async () => '1',
    issuanceDelivery: () =>
      s.human
        ? { kind: 'qr', payload: 'x', bytes: 1, qrVersion: 1, hint: '' }
        : { kind: 'automated' },
    presentationDelivery: () => ({ kind: 'automated' }),
    ...(s.human
      ? {}
      : {
          acceptOffer: async (ctx) => {
            if (s.walletSilent) return new Promise<never>(() => {});
            exchange(ctx.runId, ProtocolStep.VCI_CREDENTIAL_OFFER, { method: 'GET' });
            exchange(ctx.runId, ProtocolStep.VCI_TOKEN, {
              status: s.tokenStatus ?? 200,
              resBody: '{"error":"invalid_grant"}',
            });
            if ((s.tokenStatus ?? 200) >= 400) throw new Error('token failed');
            exchange(ctx.runId, ProtocolStep.VCI_CREDENTIAL, {
              resBody: '{"credential":"eyJhbGciOiJFUzI1NiJ9.e30.sig~"}',
            });
            return {
              id: 'c1',
              format: 'vc+sd-jwt',
              credentialConfigurationId: 'Farmer',
              issuer: 'https://test',
              raw: 'x',
              receivedAt: '',
              holderDid: 'did:jwk:x',
            };
          },
          respond: async (ctx) => {
            exchange(ctx.runId, ProtocolStep.VP_REQUEST_OBJECT, {
              method: 'GET',
              resBody:
                'eyJhbGciOiJFZERTQSJ9.eyJwcmVzZW50YXRpb25fZGVmaW5pdGlvbiI6eyJpZCI6InBkIn19.sig',
            });
            exchange(ctx.runId, ProtocolStep.VP_RESPONSE, {
              reqBody: 'vp_token=TOKEN&presentation_submission=%7B%7D&state=req_1',
            });
            respondedAt = Date.now();
            return { credentialId: 'c1', responseUri: 'https://test', status: 200, warnings: [] };
          },
        }),
  };
  const verifier: VerifierAdapter = {
    descriptor: descriptor('verifier', 'verifier'),
    healthCheck: async () => 'up',
    version: async () => '1',
    createPresentationRequest: async (ctx) => {
      exchange(ctx.runId, ProtocolStep.VERIFY_CREATE_REQUEST, { from: 'bff' });
      return {
        requestId: 'req_1',
        transactionId: 'txn_1',
        authorizationRequestUri: 'openid4vp://authorize?request_uri=https%3A%2F%2Ftest',
        presentationDefinition: { id: 'pd' },
      };
    },
    pollStatus: async () => {
      await new Promise((r) => setTimeout(r, 20));
      return respondedAt ? 'VP_SUBMITTED' : 'ACTIVE';
    },
    fetchResult: async () => ({
      outcome: s.outcome ?? 'VALID',
      perCredential: [],
      verifierRaw: { vpResultStatus: 'SUCCESS' },
    }),
  };
  const entries = [issuer, wallet, verifier].map(
    (a) => ({ ...a.descriptor, health: 'up', version: '1' }) as CatalogEntry,
  );
  const registry = {
    issuer: (id: string) => (id === 'issuer' ? issuer : undefined),
    wallet: (id: string) => (id === 'wallet' ? wallet : undefined),
    verifier: (id: string) => (id === 'verifier' ? verifier : undefined),
    list: async () => entries,
  } as unknown as ImplementationRegistry;
  const store = new RunStore();
  const orchestrator = new RunOrchestrator(registry, store, {
    headlessTimeoutMs: 400,
    humanTimeoutMs: 400,
    manualTimeoutMs: 400,
  });
  return { orchestrator, store };
}

const config: RunConfig = {
  mode: 'full',
  issuerId: 'issuer',
  walletId: 'wallet',
  verifierId: 'verifier',
  format: 'vc+sd-jwt',
  credentialConfigurationId: 'Farmer',
  grantType: 'pre-authorized_code',
  presentationFlow: 'cross-device-qr',
  expectedOutcome: 'VALID',
};

const events: RunEvent[] = [];
const onEvent = (e: RunEvent) => events.push(e);
beforeEach(() => {
  clearStore();
  events.length = 0;
  runEvents.on('event', onEvent);
});
afterEach(() => {
  runEvents.off('event', onEvent);
});

async function finished(store: RunStore, id: string): Promise<RunDetail> {
  for (let i = 0; i < 200; i++) {
    const run = store.get(id)!.run;
    if (['Reported', 'Aborted', 'Cancelled'].includes(run.state)) return run;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('run did not finish');
}

const statusOf = (run: RunDetail, step: string) => run.steps.find((s) => s.step === step);

describe('RunOrchestrator', () => {
  it('completes a headless run on tap evidence and passes', async () => {
    const { orchestrator, store } = setup({});
    const run = await finished(store, (await orchestrator.create(config)).id);
    expect(run.verdict).toBe('PASS');
    expect(run.observedOutcome).toBe('VALID');
    expect(statusOf(run, ProtocolStep.VCI_TOKEN)).toMatchObject({
      status: 'done',
      evidenceKind: 'tap',
    });
    expect(statusOf(run, ProtocolStep.VP_RESPONSE)).toMatchObject({
      status: 'done',
      evidenceKind: 'tap',
    });
    expect(statusOf(run, 'credential_held')).toMatchObject({
      status: 'done',
      evidenceKind: 'adapter',
    });
    expect(run.artifacts.map((a) => a.kind).sort()).toEqual(
      [
        'auth_request',
        'credential',
        'offer',
        'presentation_definition',
        'presentation_submission',
        'verification_result',
        'vp_token',
      ].sort(),
    );
    expect(run.artifacts.find((a) => a.kind === 'vp_token')?.raw).toBe('TOKEN');
    expect(events.map((e) => e.type)).toContain('run.completed');
  });

  it('fails the token step with the upstream error body', async () => {
    const { orchestrator, store } = setup({ tokenStatus: 400 });
    const run = await finished(store, (await orchestrator.create(config)).id);
    expect(statusOf(run, ProtocolStep.VCI_TOKEN)).toMatchObject({
      status: 'failed',
      error: { status: 400, body: '{"error":"invalid_grant"}' },
    });
    expect(statusOf(run, ProtocolStep.VERIFY_RESULT)?.status).toBe('skipped');
    expect(run.verdict).toBe('FAIL');
  });

  it('fails a headless step that sees no evidence in time', async () => {
    const { orchestrator, store } = setup({ walletSilent: true });
    const run = await finished(store, (await orchestrator.create(config)).id);
    expect(statusOf(run, 'offer_delivered')).toMatchObject({ status: 'failed' });
    expect(run.verdict).toBe('FAIL');
  });

  it('marks a human-in-the-loop run inconclusive when nobody scans the offer', async () => {
    const { orchestrator, store } = setup({ human: true });
    const run = await finished(
      store,
      (await orchestrator.create({ ...config, walletId: 'wallet' })).id,
    );
    expect(statusOf(run, 'offer_delivered')).toMatchObject({ status: 'inconclusive' });
    expect(run.verdict).toBe('INCONCLUSIVE');
  });

  it('passes an Invalid run when the verifier says Invalid', async () => {
    const { orchestrator, store } = setup({ outcome: 'INVALID' });
    const run = await finished(
      store,
      (await orchestrator.create({ ...config, expectedOutcome: 'INVALID' })).id,
    );
    expect(run.verdict).toBe('PASS');
  });

  it('cancels a running run', async () => {
    const { orchestrator, store } = setup({ walletSilent: true });
    const { id } = await orchestrator.create(config);
    await new Promise((r) => setTimeout(r, 50));
    orchestrator.cancel(id);
    const run = await finished(store, id);
    expect(run.state).toBe('Cancelled');
    expect(run.steps.filter((s) => s.status === 'skipped').length).toBeGreaterThan(0);
  });
});
