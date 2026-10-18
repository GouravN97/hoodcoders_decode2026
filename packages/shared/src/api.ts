// Request and response bodies for the BFF REST endpoints the UI calls (plan §11.2).
import { z } from 'zod';
import { CatalogEntrySchema, CredentialConfigurationSummarySchema, PredictionSchema } from './catalog';
import { ExchangeSchema, RunConfigSchema } from './domain';
import { RunDetailSchema } from './run';

/** GET /api/catalog */
export const CatalogResponseSchema = z.array(CatalogEntrySchema);

/** GET /api/catalog/:id/credential-configurations */
export const CredentialConfigurationsResponseSchema = z.array(CredentialConfigurationSummarySchema);

/** POST /api/compatibility/predict */
export const PredictRequestSchema = RunConfigSchema;
export const PredictResponseSchema = PredictionSchema;

/** POST /api/runs */
export const CreateRunRequestSchema = RunConfigSchema;
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;
export const CreateRunResponseSchema = z.object({ id: z.string() });

/** GET /api/runs/:id */
export const RunResponseSchema = RunDetailSchema;

/**
 * GET /api/runs/:id/exchanges?decode=true — full exchanges in `seq` order. `decoded` is the
 * BFF's PayloadDecoderService output; the UI falls back to its own decoders when absent.
 */
export const ExchangeWithDecodedSchema = ExchangeSchema.extend({
  decoded: z
    .object({ request: z.unknown().optional(), response: z.unknown().optional() })
    .optional(),
});
export type ExchangeWithDecoded = z.infer<typeof ExchangeWithDecodedSchema>;
export const ExchangesResponseSchema = z.array(ExchangeWithDecodedSchema);

/** POST /api/runs/:id/manual-evidence */
export const ManualEvidenceRequestSchema = z.object({
  step: z.string(),
  note: z.string().optional(),
});
export type ManualEvidenceRequest = z.infer<typeof ManualEvidenceRequestSchema>;

/** Error body returned by every endpoint on a non-2xx response. */
export const ApiErrorSchema = z.object({
  message: z.string(),
  statusCode: z.number().int().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
