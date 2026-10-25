// Human-readable labels used by the UI and the report renderers.
import type {
  ArtifactKind,
  CredentialFormat,
  InteropVerdict,
  PresentationFlow,
  Role,
  RunMode,
  VerificationOutcome,
} from './domain';
import { ProtocolStep } from './domain';
import { RUN_STEP_TEMPLATE, type RunPhase } from './run';

const FORMAT_LABELS: Record<CredentialFormat, string> = {
  ldp_vc: 'JSON-LD VC',
  'vc+sd-jwt': 'SD-JWT VC',
  'dc+sd-jwt': 'SD-JWT VC (dc+sd-jwt)',
  mso_mdoc: 'mDoc / mDL',
  jwt_vc_json: 'JWT VC',
};
export const formatLabel = (f: CredentialFormat) => FORMAT_LABELS[f];

const OUTCOME_LABELS: Record<VerificationOutcome, string> = {
  VALID: 'Valid',
  INVALID: 'Invalid',
  EXPIRED: 'Valid but expired',
  REVOKED: 'Revoked',
  REJECTED: 'Rejected',
  ERROR: 'Error',
};
export const outcomeLabel = (o: VerificationOutcome) => OUTCOME_LABELS[o];

const VERDICT_LABELS: Record<InteropVerdict, string> = {
  PASS: 'Pass',
  PASS_WITH_WARNINGS: 'Pass with warnings',
  FAIL: 'Fail',
  INCONCLUSIVE: 'Inconclusive',
  NOT_APPLICABLE: 'Known unsupported',
};
export const verdictLabel = (v: InteropVerdict) => VERDICT_LABELS[v];

const ROLE_LABELS: Record<Role, string> = { issuer: 'Issuer', wallet: 'Wallet', verifier: 'Verifier' };
export const roleLabel = (r: Role) => ROLE_LABELS[r];

const PHASE_LABELS: Record<RunPhase, string> = {
  issuing: 'Issue',
  holding: 'Hold',
  presenting: 'Present',
  verifying: 'Verify',
};
export const phaseLabel = (p: RunPhase) => PHASE_LABELS[p];

const MODE_LABELS: Record<RunMode, string> = {
  full: 'Full cycle',
  'issue-only': 'Issue only',
  'present-only': 'Present & verify only',
  'direct-verify': 'Direct verify',
};
export const modeLabel = (m: RunMode) => MODE_LABELS[m];

const FLOW_LABELS: Record<PresentationFlow, string> = {
  'cross-device-qr': 'QR code on another device',
  'same-device-deeplink': 'Link on the same device',
  'dc-api': 'Digital Credentials API',
};
export const flowLabel = (f: PresentationFlow) => FLOW_LABELS[f];

const PROTOCOL_STEP_LABELS: Record<ProtocolStep, string> = {
  [ProtocolStep.VCI_ISSUER_METADATA]: 'Issuer metadata',
  [ProtocolStep.VCI_AS_METADATA]: 'Authorization server metadata',
  [ProtocolStep.VCI_CREDENTIAL_OFFER]: 'Credential offer',
  [ProtocolStep.VCI_AUTHORIZE]: 'Authorization',
  [ProtocolStep.VCI_TOKEN]: 'Token exchange',
  [ProtocolStep.VCI_NONCE]: 'Nonce',
  [ProtocolStep.VCI_CREDENTIAL]: 'Credential request',
  [ProtocolStep.VP_AUTH_REQUEST]: 'Authorization request',
  [ProtocolStep.VP_REQUEST_OBJECT]: 'Request object',
  [ProtocolStep.VP_RESPONSE]: 'Presentation response',
  [ProtocolStep.VERIFY_CREATE_REQUEST]: 'Create VP request',
  [ProtocolStep.VERIFY_STATUS]: 'Status poll',
  [ProtocolStep.VERIFY_RESULT]: 'Verification result',
  [ProtocolStep.VC_DIRECT_VERIFY]: 'Direct VC verification',
  [ProtocolStep.DID_RESOLUTION]: 'DID resolution',
  [ProtocolStep.CONTEXT_FETCH]: 'JSON-LD context fetch',
  [ProtocolStep.STATUS_LIST_FETCH]: 'Status list fetch',
  [ProtocolStep.WALLET_BACKEND]: 'Mimoto API',
  [ProtocolStep.UNKNOWN]: 'Other',
};
export const protocolStepLabel = (s: ProtocolStep) => PROTOCOL_STEP_LABELS[s];

/** Label for a run sub-step id (machine state or ProtocolStep). */
export function stepLabel(step: string): string {
  const fromTemplate = RUN_STEP_TEMPLATE.find((t) => t.step === step);
  if (fromTemplate) return fromTemplate.label;
  return PROTOCOL_STEP_LABELS[step as ProtocolStep] ?? step;
}

/** The five messages Task 5 names explicitly, plus the issuance messages it asks for. */
const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  offer: 'Credential offer',
  credential: 'Credential',
  auth_request: 'Authorization request',
  presentation_definition: 'Presentation definition',
  dcql_query: 'DCQL query',
  vp_token: 'vp_token',
  presentation_submission: 'Presentation submission',
  verification_result: 'Verification result',
  tampered_credential: 'Tampered credential',
  tampered_vp: 'Tampered VP',
};
export const artifactLabel = (k: ArtifactKind) => ARTIFACT_LABELS[k];
