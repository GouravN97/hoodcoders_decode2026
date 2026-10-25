// MockVerifierAdapter for apps/mock-verifier (plan §8.4): the playground's own non-Inji OpenID4VP
// draft-23 verifier. Same flow as Inji Verify (create, long-poll, fetch), but its result lists
// every check it made. All calls go through the Protocol Tap's mock-verifier listener.
import {
  MockVerifierCreateResponseSchema,
  MockVerifierResultSchema,
  MockVerifierStatusResponseSchema,
  ProtocolStep,
  type CredentialFormat,
  type ImplementationDescriptor,
  type MockVerifierResult,
} from '@playground/shared';
import type { z } from 'zod';
import { AdapterError, probeHealth, staticVersion, upstream, type UpstreamResponse } from './http.ts';
import { presentationDefinitionFor, transactionIdFor } from './inji-verify.ts';
import type {
  PresentationRequestHandle,
  PresentationSpec,
  RequestStatus,
  RunContext,
  VerifierAdapter,
  VerifierResult,
} from './types.ts';

/** The path the mock verifier serves under, on its own port and on the Verify host. */
export const MOCK_VERIFIER_BASE_PATH = '/mock-verifier';

function parsed<S extends z.ZodType>(step: string, res: UpstreamResponse, schema: S): z.infer<S> {
  const result = schema.safeParse(res.json());
  if (!result.success) throw new AdapterError(step, 'The mock verifier answered with an unexpected body', res.status, res.text);
  return result.data;
}

/** The mock verifier's result → the playground's VerifierResult, keeping every stage. */
export function mapMockVerifierResult(r: MockVerifierResult): VerifierResult {
  const failed = r.stages.find((s) => s.status === 'fail');
  return {
    outcome: r.outcome,
    perCredential: [{ index: 0, outcome: r.outcome, ...(failed ? { reason: failed.message } : {}) }],
    verifierRaw: r,
    stages: r.stages,
    ...(failed ? { reason: `${failed.label}: ${failed.message}` } : {}),
  };
}

export class MockVerifierAdapter implements VerifierAdapter {
  readonly component = 'mock-verifier';
  private readonly base: string;

  constructor(
    readonly descriptor: ImplementationDescriptor,
    /** Origin to call: the tap listener, or the verifier's own address without one. */
    apiUrl: string,
  ) {
    this.base = `${apiUrl.replace(/\/$/, '')}${MOCK_VERIFIER_BASE_PATH}`;
  }

  healthCheck() {
    return probeHealth(
      this.descriptor.internalUrl && `${this.descriptor.internalUrl}${MOCK_VERIFIER_BASE_PATH}/health`,
    );
  }

  async version() {
    return staticVersion(this.descriptor);
  }

  async createPresentationRequest(ctx: RunContext, spec: PresentationSpec): Promise<PresentationRequestHandle> {
    const presentationDefinition = presentationDefinitionFor(spec);
    const res = await upstream('request_created', `${this.base}/api/requests`, {
      method: 'POST',
      runId: ctx.runId,
      signal: ctx.signal,
      body: JSON.stringify({ transactionId: transactionIdFor(ctx.runId), presentationDefinition }),
    });
    const data = parsed('request_created', res, MockVerifierCreateResponseSchema);
    return {
      requestId: data.requestId,
      transactionId: data.transactionId,
      authorizationRequestUri: data.authorizationRequestUri,
      presentationDefinition,
    };
  }

  async pollStatus(ctx: RunContext, handle: PresentationRequestHandle): Promise<RequestStatus> {
    const res = await upstream(
      ProtocolStep.VERIFY_STATUS,
      `${this.base}/api/requests/${encodeURIComponent(handle.requestId)}/status?wait=50000`,
      { runId: ctx.runId, signal: ctx.signal, timeoutMs: 60_000 },
    );
    return parsed(ProtocolStep.VERIFY_STATUS, res, MockVerifierStatusResponseSchema).status;
  }

  async fetchResult(ctx: RunContext, handle: PresentationRequestHandle): Promise<VerifierResult> {
    const res = await upstream(
      ProtocolStep.VERIFY_RESULT,
      `${this.base}/api/results/${encodeURIComponent(handle.transactionId)}`,
      { runId: ctx.runId, signal: ctx.signal },
    );
    return mapMockVerifierResult(parsed(ProtocolStep.VERIFY_RESULT, res, MockVerifierResultSchema));
  }

  async verifyCredential(ctx: RunContext, credential: string, format: CredentialFormat): Promise<VerifierResult> {
    const res = await upstream(ProtocolStep.VC_DIRECT_VERIFY, `${this.base}/api/verify-credential`, {
      method: 'POST',
      runId: ctx.runId,
      signal: ctx.signal,
      body: JSON.stringify({ credential, format }),
    });
    return mapMockVerifierResult(parsed(ProtocolStep.VC_DIRECT_VERIFY, res, MockVerifierResultSchema));
  }
}
