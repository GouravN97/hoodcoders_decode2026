// Run records as the BFF returns them (plan §11.1–11.2) and the step template the
// UI stepper and the BFF run machine both use.
import { z } from 'zod';
import { PredictionSchema } from './catalog';
import {
  ArtifactKindSchema,
  CredentialFormatSchema,
  ExchangeSchema,
  InteropVerdictSchema,
  ProtocolStep,
  RunConfigSchema,
  VerificationOutcomeSchema,
  VerificationResultSchema,
  type Role,
  type RunMode,
} from './domain';

export const RunPhaseSchema = z.enum(['issuing', 'holding', 'presenting', 'verifying']);
export type RunPhase = z.infer<typeof RunPhaseSchema>;
export const RUN_PHASES: readonly RunPhase[] = RunPhaseSchema.options;

/** Run machine states (plan §4.5), plus `Cancelled`. */
export const RunStateSchema = z.enum([
  'Configured',
  'Preflight',
  'Issuing',
  'Holding',
  'Presenting',
  'Verifying',
  'Evaluating',
  'Reported',
  'Aborted',
  'Cancelled',
]);
export type RunState = z.infer<typeof RunStateSchema>;
export const TERMINAL_RUN_STATES: readonly RunState[] = ['Reported', 'Aborted', 'Cancelled'];

export const StepStatusSchema = z.enum([
  'pending',
  'active',
  'done',
  'failed',
  'skipped',
  'inconclusive',
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const EvidenceKindSchema = z.enum(['adapter', 'tap', 'manual']);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

/** The ordered sub-steps of a full run. `step` is a ProtocolStep or a machine state id. */
export const RUN_STEP_TEMPLATE = [
  { phase: 'issuing', step: 'offer_prepared', label: 'Credential offer created' },
  { phase: 'issuing', step: 'offer_delivered', label: 'Offer delivered to wallet' },
  { phase: 'issuing', step: ProtocolStep.VCI_TOKEN, label: 'Token exchange' },
  { phase: 'issuing', step: ProtocolStep.VCI_CREDENTIAL, label: 'Credential issued' },
  { phase: 'holding', step: 'credential_held', label: 'Credential stored in wallet' },
  { phase: 'presenting', step: 'request_created', label: 'Presentation request created' },
  { phase: 'presenting', step: 'request_delivered', label: 'Request delivered to wallet' },
  { phase: 'presenting', step: ProtocolStep.VP_REQUEST_OBJECT, label: 'Wallet fetched request' },
  { phase: 'presenting', step: ProtocolStep.VP_RESPONSE, label: 'vp_token submitted' },
  { phase: 'verifying', step: ProtocolStep.VERIFY_RESULT, label: 'Verification result' },
] as const satisfies ReadonlyArray<{ phase: RunPhase; step: string; label: string }>;

/**
 * Which phases each run mode goes through (plan §5). Issuing and verifying are separate parties:
 * `issue-only` ends once the credential is in the wallet, `present-only` starts from a credential
 * the wallet already holds, so neither half depends on the other being up.
 */
export const RUN_MODE_PHASES: Record<RunMode, readonly RunPhase[]> = {
  full: ['issuing', 'holding', 'presenting', 'verifying'],
  'issue-only': ['issuing', 'holding'],
  'present-only': ['holding', 'presenting', 'verifying'],
  'direct-verify': ['verifying'],
};

/** Modes the orchestrator runs today; `direct-verify` is planned (plan §5) but not built yet. */
export const SUPPORTED_RUN_MODES: readonly RunMode[] = ['full', 'issue-only', 'present-only'];

export const runUsesPhase = (mode: RunMode, phase: RunPhase) =>
  RUN_MODE_PHASES[mode].includes(phase);

/** Whether a run in this mode talks to the implementation playing `role`. */
export function runUsesRole(mode: RunMode, role: Role): boolean {
  if (role === 'issuer') return runUsesPhase(mode, 'issuing');
  if (role === 'verifier') return runUsesPhase(mode, 'presenting') || runUsesPhase(mode, 'verifying');
  return mode !== 'direct-verify';
}

/** The run's sub-steps for a mode, in template order. */
export function stepTemplateFor(mode: RunMode) {
  return RUN_STEP_TEMPLATE.filter((t) => runUsesPhase(mode, t.phase));
}

export const StepErrorSchema = z.object({
  message: z.string(),
  status: z.number().int().optional(),
  body: z.string().optional(),
});
export type StepError = z.infer<typeof StepErrorSchema>;

export const RunStepSchema = z.object({
  phase: RunPhaseSchema,
  step: z.string(),
  status: StepStatusSchema,
  evidenceKind: EvidenceKindSchema.optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  durationMs: z.number().optional(),
  exchangeId: z.string().optional(),
  error: StepErrorSchema.optional(),
});
export type RunStep = z.infer<typeof RunStepSchema>;

export const DeliveryInstructionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('qr'),
    payload: z.string(),
    bytes: z.number(),
    qrVersion: z.number(),
    hint: z.string(),
    expiresAt: z.string().optional(),
  }),
  z.object({ kind: z.literal('deeplink'), url: z.string(), hint: z.string() }),
  z.object({ kind: z.literal('open-url'), url: z.string(), hint: z.string() }),
  z.object({ kind: z.literal('automated') }),
]);
export type DeliveryInstruction = z.infer<typeof DeliveryInstructionSchema>;

/** What a delivery is for, so the UI can label it ("Scan to receive" vs "Scan to share"). */
export const DeliveryPurposeSchema = z.enum(['issuance', 'presentation']);
export type DeliveryPurpose = z.infer<typeof DeliveryPurposeSchema>;

export const ExchangeSummarySchema = ExchangeSchema.omit({ request: true, response: true }).extend({
  requestBytes: z.number().optional(),
  responseBytes: z.number().optional(),
});
export type ExchangeSummary = z.infer<typeof ExchangeSummarySchema>;

export const ArtifactSchema = z.object({
  id: z.string(),
  kind: ArtifactKindSchema,
  format: CredentialFormatSchema.optional(),
  raw: z.string(),
  decoded: z.unknown().optional(),
  sourceExchangeId: z.string().optional(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const ModuleVersionSchema = z.object({
  implementationId: z.string(),
  version: z.string(),
  imageRef: z.string().optional(),
  gitSha: z.string().optional(),
});
export type ModuleVersion = z.infer<typeof ModuleVersionSchema>;

export const RunDetailSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  trigger: z.enum(['ui', 'cli', 'nightly']),
  config: RunConfigSchema,
  state: RunStateSchema,
  observedOutcome: VerificationOutcomeSchema.optional(),
  verdict: InteropVerdictSchema.optional(),
  prediction: PredictionSchema.optional(),
  correlation: z.enum(['exact', 'heuristic']),
  errorSummary: z.string().optional(),
  steps: z.array(RunStepSchema),
  versions: z.array(ModuleVersionSchema),
  delivery: z
    .object({ purpose: DeliveryPurposeSchema, instruction: DeliveryInstructionSchema })
    .optional(),
  result: VerificationResultSchema.optional(),
  artifacts: z.array(ArtifactSchema),
});
export type RunDetail = z.infer<typeof RunDetailSchema>;
