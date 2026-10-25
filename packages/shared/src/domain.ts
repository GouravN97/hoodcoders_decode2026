// Domain model shared by UI, BFF, mocks and CLI (implementation plan §6).
import { z } from 'zod';

// ---------- roles & capabilities ----------
export const RoleSchema = z.enum(['issuer', 'wallet', 'verifier']);
export type Role = z.infer<typeof RoleSchema>;
export const ROLES: readonly Role[] = RoleSchema.options;

export const CredentialFormatSchema = z.enum([
  'ldp_vc',
  'vc+sd-jwt',
  'dc+sd-jwt',
  'mso_mdoc',
  'jwt_vc_json',
]);
export type CredentialFormat = z.infer<typeof CredentialFormatSchema>;

/** Every credential format the selector and inspector can exercise. */
export const PLAYGROUND_FORMATS: readonly CredentialFormat[] = CredentialFormatSchema.options;

/** Formats the mandatory tasks cover end-to-end (Task 6). */
export const MANDATORY_FORMATS: readonly CredentialFormat[] = ['ldp_vc', 'vc+sd-jwt'];

export const ProofSuiteSchema = z.enum([
  'Ed25519Signature2020',
  'Ed25519Signature2018',
  'RsaSignature2018',
  'EcdsaSecp256k1Signature2019',
  'DataIntegrityProof:eddsa-rdfc-2022',
  'ES256',
  'EdDSA',
  'RS256',
]);
export type ProofSuite = z.infer<typeof ProofSuiteSchema>;

export const VciProfileSchema = z.enum(['oid4vci-draft13', 'oid4vci-1.0']);
export type VciProfile = z.infer<typeof VciProfileSchema>;

export const VpProfileSchema = z.enum(['oid4vp-draft21', 'oid4vp-draft23', 'oid4vp-1.0']);
export type VpProfile = z.infer<typeof VpProfileSchema>;

export const QueryLanguageSchema = z.enum(['presentation_exchange', 'dcql']);
export type QueryLanguage = z.infer<typeof QueryLanguageSchema>;

export const ResponseModeSchema = z.enum(['direct_post', 'direct_post.jwt', 'dc_api']);
export type ResponseMode = z.infer<typeof ResponseModeSchema>;

export const ClientIdSchemeSchema = z.enum([
  'redirect_uri',
  'pre-registered',
  'did',
  'x509_san_dns',
]);
export type ClientIdScheme = z.infer<typeof ClientIdSchemeSchema>;

export const PresentationFlowSchema = z.enum(['cross-device-qr', 'same-device-deeplink', 'dc-api']);
export type PresentationFlow = z.infer<typeof PresentationFlowSchema>;

export const DeliveryChannelSchema = z.enum(['qr', 'deeplink', 'open-url', 'api']);
export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>;

export const AutomationSchema = z.enum(['headless', 'human-in-the-loop']);
export type Automation = z.infer<typeof AutomationSchema>;

export const GrantTypeSchema = z.enum(['pre-authorized_code', 'authorization_code']);
export type GrantType = z.infer<typeof GrantTypeSchema>;

export const CapabilitiesSchema = z.object({
  formats: z.array(CredentialFormatSchema),
  proofSuites: z.array(ProofSuiteSchema),
  grantTypes: z.array(GrantTypeSchema).optional(),
  vciProfiles: z.array(VciProfileSchema).optional(),
  vpProfiles: z.array(VpProfileSchema).optional(),
  queryLanguages: z.array(QueryLanguageSchema).optional(),
  responseModes: z.array(ResponseModeSchema).optional(),
  clientIdSchemes: z.array(ClientIdSchemeSchema).optional(),
  didMethods: z.array(z.string()).optional(),
  presentationFlows: z.array(PresentationFlowSchema).optional(),
  deliveryChannels: z.array(DeliveryChannelSchema),
  automation: AutomationSchema,
  supportsTamper: z.boolean(),
  /**
   * Issuers only: credential configuration → a copy of it signed with validity in the past, used
   * by the T-EXPIRED tamper for a genuine Valid-but-expired credential.
   */
  expiredVariants: z.record(z.string(), z.string()).optional(),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const ImplementationDescriptorSchema = z.object({
  id: z.string().min(1),
  role: RoleSchema,
  displayName: z.string().min(1),
  /** One sentence for the selector: what this implementation is and how it runs. */
  description: z.string().optional(),
  vendor: z.enum(['inji', 'mock', 'external']),
  adapter: z.string().min(1),
  publicUrl: z.string(),
  internalUrl: z.string().optional(),
  versionProbe: z
    .object({ kind: z.enum(['actuator', 'static', 'header']), value: z.string() })
    .optional(),
  capabilities: CapabilitiesSchema,
  notes: z.string().optional(),
});
export type ImplementationDescriptor = z.infer<typeof ImplementationDescriptorSchema>;

// ---------- runs ----------
export const RunModeSchema = z.enum(['full', 'issue-only', 'present-only', 'direct-verify']);
export type RunMode = z.infer<typeof RunModeSchema>;

export const VerificationOutcomeSchema = z.enum([
  'VALID',
  'INVALID',
  'EXPIRED',
  'REVOKED',
  'REJECTED',
  'ERROR',
]);
export type VerificationOutcome = z.infer<typeof VerificationOutcomeSchema>;

export const InteropVerdictSchema = z.enum([
  'PASS',
  'PASS_WITH_WARNINGS',
  'FAIL',
  'INCONCLUSIVE',
  'NOT_APPLICABLE',
]);
export type InteropVerdict = z.infer<typeof InteropVerdictSchema>;

export const TamperMechanismSchema = z.enum([
  'wallet-hook',
  'issuance-profile',
  'direct-verify',
  'transit',
]);
export type TamperMechanism = z.infer<typeof TamperMechanismSchema>;

export const TamperSpecSchema = z.object({
  id: z.string(),
  mechanism: TamperMechanismSchema.optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type TamperSpec = z.infer<typeof TamperSpecSchema>;

export const RunConfigSchema = z.object({
  mode: RunModeSchema,
  issuerId: z.string().min(1),
  walletId: z.string().min(1),
  verifierId: z.string().min(1),
  format: CredentialFormatSchema,
  credentialConfigurationId: z.string().min(1),
  proofSuite: ProofSuiteSchema.optional(),
  grantType: GrantTypeSchema,
  issuerProfile: z.string().optional(),
  vpProfile: VpProfileSchema.optional(),
  queryLanguage: QueryLanguageSchema.optional(),
  responseMode: ResponseModeSchema.optional(),
  presentationFlow: PresentationFlowSchema,
  holderDidMethod: z.enum(['did:jwk', 'did:key']).optional(),
  tamper: TamperSpecSchema.optional(),
  /**
   * present-only: the credential the wallet should present, from an earlier run. Only wallets that
   * can list what they hold (the mock wallet) use it; otherwise the newest matching one is used.
   */
  heldCredentialId: z.string().min(1).optional(),
  /** Ignored by issue-only runs, which end once the credential is in the wallet. */
  expectedOutcome: VerificationOutcomeSchema,
  labels: z.record(z.string(), z.string()).optional(),
});
export type RunConfig = z.infer<typeof RunConfigSchema>;

/** One check a verifier reports making (the mock verifier reports every stage it runs). */
export const VerificationStageSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['pass', 'fail', 'warn', 'skip']),
  message: z.string(),
});
export type VerificationStage = z.infer<typeof VerificationStageSchema>;

/**
 * The other verifier's verdict on the same presented credential, checked on its own (no
 * presentation, no holder binding). Recorded as finding VER-002.
 */
export const SecondOpinionSchema = z.object({
  verifierId: z.string(),
  displayName: z.string().optional(),
  outcome: VerificationOutcomeSchema,
  stages: z.array(VerificationStageSchema).optional(),
  reason: z.string().optional(),
  /** False when the run's verdict rests on presentation checks a credential-only check cannot make. */
  comparable: z.boolean(),
  agrees: z.boolean(),
  exchangeId: z.string().optional(),
});
export type SecondOpinion = z.infer<typeof SecondOpinionSchema>;

export const VerificationResultSchema = z.object({
  outcome: VerificationOutcomeSchema,
  perCredential: z.array(
    z.object({
      index: z.number(),
      outcome: VerificationOutcomeSchema,
      reason: z.string().optional(),
    }),
  ),
  verifierRaw: z.unknown(),
  /** Every check the verifier made, when it reports them. */
  stages: z.array(VerificationStageSchema).optional(),
  secondOpinion: SecondOpinionSchema.optional(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const ArtifactKindSchema = z.enum([
  'offer',
  'credential',
  'auth_request',
  'presentation_definition',
  'dcql_query',
  'vp_token',
  'presentation_submission',
  'verification_result',
  'tampered_credential',
  'tampered_vp',
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ProtocolStep = {
  VCI_ISSUER_METADATA: 'oid4vci.issuer_metadata',
  VCI_AS_METADATA: 'oid4vci.as_metadata',
  VCI_CREDENTIAL_OFFER: 'oid4vci.credential_offer',
  VCI_AUTHORIZE: 'oid4vci.authorize',
  VCI_TOKEN: 'oid4vci.token',
  VCI_NONCE: 'oid4vci.nonce',
  VCI_CREDENTIAL: 'oid4vci.credential',
  VP_AUTH_REQUEST: 'oid4vp.authorization_request',
  VP_REQUEST_OBJECT: 'oid4vp.request_object',
  VP_RESPONSE: 'oid4vp.response',
  VERIFY_CREATE_REQUEST: 'verify.create_request',
  VERIFY_STATUS: 'verify.status_poll',
  VERIFY_RESULT: 'verify.result',
  VC_DIRECT_VERIFY: 'verify.vc_verification',
  DID_RESOLUTION: 'did.resolution',
  CONTEXT_FETCH: 'jsonld.context_fetch',
  STATUS_LIST_FETCH: 'status_list.fetch',
  WALLET_BACKEND: 'mimoto.api',
  UNKNOWN: 'unknown',
} as const;
export type ProtocolStep = (typeof ProtocolStep)[keyof typeof ProtocolStep];
export const ProtocolStepSchema = z.enum(
  Object.values(ProtocolStep) as [ProtocolStep, ...ProtocolStep[]],
);

export const HttpMessageSchema = z.object({
  headers: z.record(z.string(), z.string()),
  body: z.string().optional(),
  contentType: z.string().optional(),
});
export type HttpMessage = z.infer<typeof HttpMessageSchema>;

export const ExchangeSchema = z.object({
  id: z.string(),
  runId: z.string().optional(),
  seq: z.number().int(),
  ts: z.string(),
  component: z.string(),
  from: z.string().optional(),
  method: z.string(),
  url: z.string(),
  status: z.number().int().optional(),
  latencyMs: z.number().optional(),
  step: ProtocolStepSchema,
  request: HttpMessageSchema,
  response: HttpMessageSchema.optional(),
  correlationKeys: z.array(z.string()),
  outOfBand: z.boolean(),
  tampered: z
    .object({
      ruleId: z.string(),
      /** Human-readable summary of what changed, one change per line. */
      diff: z.string(),
      /** What was altered: the credential inside the vp_token, the vp_token itself, or neither. */
      target: z.enum(['credential', 'vp_token', 'presentation']).optional(),
      /** The payload before and after tampering, for the inspector's side-by-side view. */
      before: z.string().optional(),
      after: z.string().optional(),
    })
    .optional(),
  /** Artifacts extracted from this exchange (offer, vp_token, ...); set by the BFF's ArtifactExtractor. */
  artifactKinds: z.array(ArtifactKindSchema).optional(),
});
export type Exchange = z.infer<typeof ExchangeSchema>;
