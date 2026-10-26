// InjiVerifyDcqlAdapter for Inji Verify's 1.0 API (OpenID4VP 1.0 with DCQL), as the MOSIP Collab
// sandbox runs it. Same flow as the 0.18 adapter: create the request, long-poll its status, fetch
// the result. The endpoints and payloads differ (verify-service 1.0.0-alpha.1, VPRequestController
// and VPResultController):
//   POST /v1/verify/v2/vp-request           { clientId, transactionId, dcqlQuery } → { requestId, transactionId, requestUri | authorizationDetails }
//   GET  /v1/verify/vp-request/{id}/status  long poll, as in 0.18
//   POST /v1/verify/v2/vp-results/{txn}     { skipStatusChecks, includeClaims } → per-credential checks
// A `decentralized_identifier:` client gets a signed request object by reference; the wallet's
// key-binding `aud` (SD-JWT) or proof `domain` (ldp_vp) must be that client_id, prefix included.
import {
  ProtocolStep,
  type CredentialFormat,
  type ImplementationDescriptor,
  type VerificationOutcome,
  type VerificationStage,
} from '@playground/shared';
import { AdapterError, probeHealth, staticVersion, upstream } from './http.ts';
import { mapVcVerification, transactionIdFor, vcVerificationContentType } from './inji-verify.ts';
import type {
  PresentationRequestHandle,
  PresentationSpec,
  RequestStatus,
  RunContext,
  VerifierAdapter,
  VerifierResult,
} from './types.ts';

/** Formats Inji Verify 1.0 accepts in a DCQL query (DcqlValidator SUPPORTED_FORMATS). */
const DCQL_FORMATS: readonly CredentialFormat[] = ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt'];

export const DEFAULT_DCQL_CLIENT_ID = 'decentralized_identifier:did:web:injiverify.collab.mosip.net:v1:verify';

/** A DCQL credential query id: letters, digits, `_` and `-` only. */
const queryId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');

/** The DCQL query for the run's credential: `vct_values` for SD-JWT, `type_values` for JSON-LD. */
export function dcqlQueryFor(spec: PresentationSpec) {
  if (!DCQL_FORMATS.includes(spec.format))
    throw new AdapterError(
      'request_created',
      `Inji Verify 1.0 does not accept ${spec.format} in a DCQL query (it takes ${DCQL_FORMATS.join(', ')})`,
    );
  const sdJwt = spec.format !== 'ldp_vc';
  return {
    credentials: [
      {
        id: queryId(spec.id),
        format: spec.format,
        meta: sdJwt ? { vct_values: [spec.credentialType] } : { type_values: [[spec.credentialType]] },
      },
    ],
  };
}

interface CreateResponse {
  requestId: string;
  transactionId: string;
  requestUri?: string;
  authorizationDetails?: {
    clientId: string;
    responseType?: string;
    responseMode?: string;
    nonce: string;
    responseUri: string;
    dcqlQuery?: object;
  };
}

/** openid4vp:// as Inji Verify's UI builds it: by reference for a did client, by value otherwise. */
export function authorizationRequestUri(clientId: string, data: CreateResponse): string {
  const params = new URLSearchParams({ client_id: clientId });
  if (data.requestUri) {
    params.set('request_uri', data.requestUri);
  } else if (data.authorizationDetails) {
    const d = data.authorizationDetails;
    params.set('response_type', d.responseType ?? 'vp_token');
    params.set('response_mode', d.responseMode ?? 'direct_post');
    params.set('nonce', d.nonce);
    params.set('state', data.requestId);
    params.set('response_uri', d.responseUri);
    if (d.dcqlQuery) params.set('dcql_query', JSON.stringify(d.dcqlQuery));
  }
  return `openid4vp://authorize?${params.toString()}`;
}

interface Check {
  valid?: boolean;
  error?: { errorCode?: string; errorMessage?: string } | null;
}

interface CredentialResult {
  allChecksSuccessful?: boolean;
  schemaAndSignatureCheck?: Check | null;
  expiryCheck?: Check | null;
  statusCheck?: Array<Check & { purpose?: string }> | null;
  holderProofCheck?: Check | null;
}

export interface VpVerificationResult {
  transactionId?: string;
  allChecksSuccessful?: boolean;
  credentialResults?: CredentialResult[] | null;
}

const why = (c: Check | null | undefined) =>
  c?.error ? [c.error.errorCode, c.error.errorMessage].filter(Boolean).join(': ') : '';

/** One credential's checks → outcome: signature first, then holder proof, expiry and status. */
function credentialOutcome(c: CredentialResult): { outcome: VerificationOutcome; reason?: string } {
  if (c.schemaAndSignatureCheck && !c.schemaAndSignatureCheck.valid)
    return { outcome: 'INVALID', reason: `Signature: ${why(c.schemaAndSignatureCheck) || 'invalid'}` };
  if (c.holderProofCheck && !c.holderProofCheck.valid)
    return { outcome: 'INVALID', reason: `Holder proof: ${why(c.holderProofCheck) || 'invalid'}` };
  if (c.expiryCheck && !c.expiryCheck.valid) return { outcome: 'EXPIRED', reason: 'Expiry: the credential has expired' };
  const revoked = (c.statusCheck ?? []).find((s) => !s.valid);
  if (revoked)
    return {
      outcome: revoked.purpose === 'revocation' ? 'REVOKED' : 'INVALID',
      reason: `Status (${revoked.purpose ?? 'unknown'}): ${why(revoked) || 'not valid'}`,
    };
  if (c.allChecksSuccessful === false) return { outcome: 'INVALID', reason: 'allChecksSuccessful is false' };
  return { outcome: 'VALID' };
}

/** The checks Inji Verify 1.0 reports, as stages for the result card. */
function stagesOf(c: CredentialResult, index: number): VerificationStage[] {
  const stage = (id: string, label: string, check: Check | null | undefined): VerificationStage =>
    check
      ? {
          id: `${id}-${index}`,
          label,
          status: check.valid ? 'pass' : 'fail',
          message: check.valid ? 'Valid' : why(check) || 'Not valid',
        }
      : { id: `${id}-${index}`, label, status: 'skip', message: 'Not reported' };
  return [
    stage('signature', 'Schema and signature', c.schemaAndSignatureCheck),
    stage('holder-proof', 'Holder proof (nonce, audience, key binding)', c.holderProofCheck),
    stage('expiry', 'Validity period', c.expiryCheck),
    ...(c.statusCheck ?? []).map((s, i) => stage(`status-${i}`, `Status (${s.purpose ?? 'unknown'})`, s)),
  ];
}

/** POST /v2/vp-results → the playground's VerifierResult, keeping every check as a stage. */
export function mapVpVerificationResult(raw: VpVerificationResult): VerifierResult {
  const results = raw.credentialResults ?? [];
  const perCredential = results.map((c, index) => ({ index, ...credentialOutcome(c) }));
  const bad = perCredential.find((p) => p.outcome !== 'VALID');
  const outcome: VerificationOutcome =
    bad?.outcome ?? (results.length > 0 && raw.allChecksSuccessful !== false ? 'VALID' : 'INVALID');
  return {
    outcome,
    perCredential,
    verifierRaw: raw,
    stages: results.flatMap(stagesOf),
    ...(bad?.reason
      ? { reason: bad.reason }
      : outcome !== 'VALID'
        ? { reason: results.length ? 'allChecksSuccessful is false' : 'No credential results' }
        : {}),
  };
}

/**
 * An ErrorDto from the result or submission: `invalid_request` and the token errors mean the
 * presentation was refused (Invalid); anything else is the verifier refusing to answer (Rejected).
 */
export function mapErrorDto(body: string | undefined): VerifierResult | undefined {
  if (!body) return undefined;
  let dto: { errorCode?: string; errorMessage?: string };
  try {
    dto = JSON.parse(body) as typeof dto;
  } catch {
    return undefined;
  }
  if (!dto.errorCode) return undefined;
  const refused = /^(invalid_request|INVALID_VP_TOKEN|TOKEN_MATCHING_FAILED|VP_)/.test(dto.errorCode);
  return {
    outcome: refused ? 'INVALID' : 'REJECTED',
    perCredential: [],
    verifierRaw: dto,
    reason: `${dto.errorCode}: ${dto.errorMessage ?? ''}`.trim(),
  };
}

export class InjiVerifyDcqlAdapter implements VerifierAdapter {
  /** Tap component: the implementation id, so each 1.0 instance has its own listener. */
  readonly component: string;

  constructor(
    readonly descriptor: ImplementationDescriptor,
    /** Origin to call: the tap listener, or the verifier's own address without one. */
    private readonly apiUrl: string,
    private readonly clientId: string = descriptor.clientId ?? DEFAULT_DCQL_CLIENT_ID,
  ) {
    this.component = descriptor.id;
  }

  healthCheck() {
    // The actuator is not public on Collab; the verifier's DID document is.
    return probeHealth(this.descriptor.internalUrl && `${this.descriptor.internalUrl}/v1/verify/did.json`, 10_000);
  }

  async version() {
    return staticVersion(this.descriptor);
  }

  async createPresentationRequest(ctx: RunContext, spec: PresentationSpec): Promise<PresentationRequestHandle> {
    if (spec.responseMode === 'dc_api')
      throw new AdapterError('request_created', `${this.descriptor.displayName} is not set up for the Digital Credentials API here`);
    const dcqlQuery = dcqlQueryFor(spec);
    const res = await upstream('request_created', `${this.apiUrl}/v1/verify/v2/vp-request`, {
      method: 'POST',
      runId: ctx.runId,
      signal: ctx.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: this.clientId, transactionId: transactionIdFor(ctx.runId), dcqlQuery }),
    });
    const data = res.json<CreateResponse>();
    return {
      requestId: data.requestId,
      transactionId: data.transactionId,
      authorizationRequestUri: authorizationRequestUri(this.clientId, data),
      // The inspector's "what was asked" artifact; DCQL takes the place of a presentation definition.
      presentationDefinition: dcqlQuery,
      dcqlQuery,
    };
  }

  async pollStatus(ctx: RunContext, handle: PresentationRequestHandle): Promise<RequestStatus> {
    const res = await upstream(
      ProtocolStep.VERIFY_STATUS,
      `${this.apiUrl}/v1/verify/vp-request/${handle.requestId}/status`,
      { runId: ctx.runId, signal: ctx.signal, timeoutMs: 70_000 },
    );
    return res.json<{ status: RequestStatus }>().status;
  }

  async fetchResult(ctx: RunContext, handle: PresentationRequestHandle): Promise<VerifierResult> {
    try {
      const res = await upstream(ProtocolStep.VERIFY_RESULT, `${this.apiUrl}/v1/verify/v2/vp-results/${handle.transactionId}`, {
        method: 'POST',
        runId: ctx.runId,
        signal: ctx.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skipStatusChecks: false, includeClaims: false }),
      });
      return mapVpVerificationResult(res.json());
    } catch (e) {
      const mapped = e instanceof AdapterError ? mapErrorDto(e.body) : undefined;
      if (!mapped) throw e;
      return mapped;
    }
  }

  async verifyCredential(ctx: RunContext, credential: string, format: CredentialFormat): Promise<VerifierResult> {
    const res = await upstream(ProtocolStep.VC_DIRECT_VERIFY, `${this.apiUrl}/v1/verify/vc-verification`, {
      method: 'POST',
      runId: ctx.runId,
      signal: ctx.signal,
      headers: { 'content-type': vcVerificationContentType(format) },
      body: credential,
    });
    return mapVcVerification(res.json());
  }
}
