// InjiVerifyServiceAdapter for Inji Verify 0.18.x (Presentation Exchange): create the VP request
// with a run-derived transactionId, build the openid4vp:// URI the way the Inji Verify SDK does,
// long-poll the status and fetch the result. All calls go through the Protocol Tap.
import {
  ProtocolStep,
  type ImplementationDescriptor,
  type VerificationOutcome,
} from '@playground/shared';
import { AdapterError, probeHealth, staticVersion, upstream } from './http.ts';
import type {
  PresentationRequestHandle,
  PresentationSpec,
  RequestStatus,
  RunContext,
  VerifierAdapter,
  VerifierResult,
} from './types.ts';

/** Inji Verify's per-credential statuses (plan §6). */
const OUTCOMES: Record<string, VerificationOutcome> = {
  SUCCESS: 'VALID',
  INVALID: 'INVALID',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
};

/** Error codes that mean the presentation itself was rejected, not that the verifier broke. */
const INVALID_PRESENTATION_CODES = [
  'TOKEN_MATCHING_FAILED',
  'INVALID_VP_TOKEN',
  'VP_WITHOUT_PROOF',
];

export function presentationDefinitionFor(spec: PresentationSpec): object {
  const isSdJwt = spec.format !== 'ldp_vc';
  return {
    id: spec.id,
    purpose: spec.purpose,
    input_descriptors: [
      isSdJwt
        ? {
            id: spec.id,
            format: { [spec.format]: { 'sd-jwt_alg_values': ['ES256'] } },
            constraints: {
              fields: [
                { path: ['$.vct'], filter: { type: 'string', pattern: spec.credentialType } },
              ],
            },
          }
        : {
            id: spec.id,
            format: { ldp_vc: { proof_type: ['Ed25519Signature2020'] } },
            // Same filter shape as Inji Verify's own config: a pattern over the `type` array.
            constraints: {
              fields: [
                { path: ['$.type'], filter: { type: 'object', pattern: spec.credentialType } },
              ],
            },
          },
    ],
  };
}

interface CreateResponse {
  transactionId: string;
  requestId: string;
  requestUri?: string;
  authorizationDetails?: {
    clientId: string;
    nonce: string;
    responseUri: string;
    responseType?: string;
    responseMode?: string;
    presentationDefinition?: object;
    presentationDefinitionUri?: string;
  };
}

/** The QR payload Inji Verify's SDK builds (OpenID4VPVerification.getPresentationDefinitionParams). */
export function authorizationRequestUri(clientId: string, data: CreateResponse): string {
  const params = new URLSearchParams({ client_id: clientId });
  if (data.requestUri) params.set('request_uri', data.requestUri);
  else if (data.authorizationDetails) {
    const d = data.authorizationDetails;
    params.set('state', data.requestId);
    params.set('response_mode', d.responseMode ?? 'direct_post');
    params.set('response_type', d.responseType ?? 'vp_token');
    params.set('nonce', d.nonce);
    params.set('response_uri', d.responseUri);
    if (d.presentationDefinitionUri)
      params.set('presentation_definition_uri', d.presentationDefinitionUri);
    else params.set('presentation_definition', JSON.stringify(d.presentationDefinition));
    params.set('client_metadata', JSON.stringify({ client_name: clientId }));
  }
  return `openid4vp://authorize?${params.toString()}`;
}

/** Inji Verify's transactionId column is varchar(40). */
export const transactionIdFor = (runId: string) => `txn_${runId.replaceAll('-', '')}`;

/** Inji Verify's /vp-result body → outcome (plan §6: SUCCESS → VALID, INVALID → INVALID, EXPIRED → EXPIRED). */
export function mapVpResult(raw: {
  vpResultStatus?: string;
  vcResults?: Array<{ verificationStatus?: string }>;
}): VerifierResult {
  const perCredential = (raw.vcResults ?? []).map((v, index) => ({
    index,
    outcome: OUTCOMES[v.verificationStatus ?? ''] ?? ('ERROR' as const),
    ...(v.verificationStatus && v.verificationStatus !== 'SUCCESS'
      ? { reason: v.verificationStatus }
      : {}),
  }));
  const bad = perCredential.find((p) => p.outcome !== 'VALID');
  // vpResultStatus FAILED with every credential SUCCESS means the holder proof failed.
  const outcome: VerificationOutcome =
    bad?.outcome ??
    (perCredential.length > 0 && raw.vpResultStatus === 'SUCCESS' ? 'VALID' : 'INVALID');
  return {
    outcome,
    perCredential,
    verifierRaw: raw,
    ...(raw.vpResultStatus !== 'SUCCESS' && !bad
      ? { reason: `vpResultStatus ${raw.vpResultStatus}` }
      : {}),
  };
}

/** An ErrorDto from /vp-result: the wallet sent an error, or the VP failed basic checks. Undefined if not an ErrorDto. */
export function mapVpResultError(body: string | undefined): VerifierResult | undefined {
  if (!body) return undefined;
  let dto: { errorCode?: string; errorMessage?: string };
  try {
    dto = JSON.parse(body) as typeof dto;
  } catch {
    return undefined;
  }
  if (!dto.errorCode) return undefined;
  const outcome: VerificationOutcome = INVALID_PRESENTATION_CODES.includes(dto.errorCode)
    ? 'INVALID'
    : 'REJECTED';
  return {
    outcome,
    perCredential: [],
    verifierRaw: dto,
    reason: `${dto.errorCode}: ${dto.errorMessage ?? ''}`.trim(),
  };
}

export class InjiVerifyServiceAdapter implements VerifierAdapter {
  constructor(
    readonly descriptor: ImplementationDescriptor,
    private readonly apiUrl: string,
    /** client_id for requests; a did: client gets a signed request object by reference. */
    private readonly clientId: string,
  ) {}

  healthCheck() {
    return probeHealth(
      this.descriptor.internalUrl && `${this.descriptor.internalUrl}/v1/verify/actuator/health`,
    );
  }

  async version() {
    return staticVersion(this.descriptor);
  }

  async createPresentationRequest(
    ctx: RunContext,
    spec: PresentationSpec,
  ): Promise<PresentationRequestHandle> {
    const presentationDefinition = presentationDefinitionFor(spec);
    const res = await upstream('request_created', `${this.apiUrl}/v1/verify/vp-request`, {
      method: 'POST',
      runId: ctx.runId,
      signal: ctx.signal,
      body: JSON.stringify({
        clientId: this.clientId,
        transactionId: transactionIdFor(ctx.runId),
        presentationDefinition,
      }),
    });
    const data = res.json<CreateResponse>();
    return {
      requestId: data.requestId,
      transactionId: data.transactionId,
      authorizationRequestUri: authorizationRequestUri(this.clientId, data),
      presentationDefinition,
    };
  }

  async pollStatus(ctx: RunContext, handle: PresentationRequestHandle): Promise<RequestStatus> {
    const res = await upstream(
      ProtocolStep.VERIFY_STATUS,
      `${this.apiUrl}/v1/verify/vp-request/${handle.requestId}/status`,
      {
        runId: ctx.runId,
        signal: ctx.signal,
        // Inji Verify holds the request open for up to INJI_VP_REQUEST_LONG_POLLING_TIMEOUT (55 s).
        timeoutMs: 70_000,
      },
    );
    return res.json<{ status: RequestStatus }>().status;
  }

  async fetchResult(ctx: RunContext, handle: PresentationRequestHandle): Promise<VerifierResult> {
    const url = `${this.apiUrl}/v1/verify/vp-result/${handle.transactionId}`;
    try {
      return mapVpResult(
        (
          await upstream(ProtocolStep.VERIFY_RESULT, url, { runId: ctx.runId, signal: ctx.signal })
        ).json(),
      );
    } catch (e) {
      const mapped = e instanceof AdapterError ? mapVpResultError(e.body) : undefined;
      if (!mapped) throw e;
      return mapped;
    }
  }
}
