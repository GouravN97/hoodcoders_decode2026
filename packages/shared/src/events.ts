// Typed WebSocket contract between RunEventsGateway and the UI's useRunEvents (plan §11.3).
import { z } from 'zod';
import { CatalogEntrySchema } from './catalog';
import { InteropVerdictSchema, VerificationOutcomeSchema, VerificationResultSchema } from './domain';
import {
  ArtifactSchema,
  DeliveryInstructionSchema,
  DeliveryPurposeSchema,
  ExchangeSummarySchema,
  RunStateSchema,
  RunStepSchema,
} from './run';

export const CheckFindingSchema = z.object({
  id: z.string(),
  checkId: z.string(),
  stage: z.enum(['issuance', 'presentation', 'verification', 'transport']),
  severity: z.enum(['PASS', 'INFO', 'WARN', 'FAIL']),
  message: z.string(),
  specRef: z.string(),
  exchangeId: z.string().optional(),
});
export type CheckFinding = z.infer<typeof CheckFindingSchema>;

const runId = z.string();

export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run.status'), runId, state: RunStateSchema, at: z.string() }),
  z.object({ type: z.literal('run.step'), runId, step: RunStepSchema }),
  z.object({
    type: z.literal('run.delivery'),
    runId,
    purpose: DeliveryPurposeSchema,
    instruction: DeliveryInstructionSchema,
  }),
  z.object({ type: z.literal('run.exchange'), runId, exchange: ExchangeSummarySchema }),
  /** Not in plan §11.3: lets the UI show the credential card without refetching the run. */
  z.object({ type: z.literal('run.artifact'), runId, artifact: ArtifactSchema }),
  z.object({ type: z.literal('run.check'), runId, finding: CheckFindingSchema }),
  z.object({
    type: z.literal('run.result'),
    runId,
    outcome: VerificationOutcomeSchema,
    verifierRaw: z.unknown(),
    stages: VerificationResultSchema.shape.stages,
    secondOpinion: VerificationResultSchema.shape.secondOpinion,
  }),
  z.object({
    type: z.literal('run.completed'),
    runId,
    verdict: InteropVerdictSchema,
    reportUrl: z.string(),
  }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
export type RunEventType = RunEvent['type'];
export type RunEventMap = { [T in RunEventType]: Extract<RunEvent, { type: T }> };

export const CatalogHealthEventSchema = z.object({
  type: z.literal('catalog.health'),
  implementationId: z.string(),
  status: CatalogEntrySchema.shape.health,
  version: z.string().optional(),
});
export type CatalogHealthEvent = z.infer<typeof CatalogHealthEventSchema>;
