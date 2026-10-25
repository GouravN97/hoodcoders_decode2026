// REST contract of apps/mock-verifier (plan §8.4), used by the BFF's MockVerifierAdapter: a generic
// OpenID4VP draft-23 verifier (Presentation Exchange, direct_post) that reports every check it makes.
import { z } from 'zod';
import { CredentialFormatSchema, VerificationOutcomeSchema, VerificationStageSchema } from './domain';

/** A DCQL query (OpenID4VP 1.0), the subset the playground sends: one credential query. */
export const DcqlQuerySchema = z.object({
  credentials: z
    .array(
      z.object({
        id: z.string(),
        format: z.string(),
        meta: z.record(z.string(), z.unknown()).optional(),
        claims: z.array(z.object({ path: z.array(z.union([z.string(), z.number(), z.null()])) })).optional(),
      }),
    )
    .min(1),
});
export type DcqlQuery = z.infer<typeof DcqlQuerySchema>;

/** POST /mock-verifier/api/requests: draft 23 with Presentation Exchange, or a DC API request with DCQL. */
export const MockVerifierCreateRequestSchema = z
  .object({
    /** Reuse the run's id so the Protocol Tap correlates it; generated when absent. */
    transactionId: z.string().min(1).optional(),
    responseMode: z.enum(['direct_post', 'dc_api']).default('direct_post'),
    presentationDefinition: z
      .object({
        id: z.string(),
        purpose: z.string().optional(),
        input_descriptors: z.array(z.record(z.string(), z.unknown())).min(1),
      })
      .optional(),
    dcqlQuery: DcqlQuerySchema.optional(),
  })
  .refine((b) => (b.responseMode === 'dc_api' ? Boolean(b.dcqlQuery) : Boolean(b.presentationDefinition)), {
    message: 'direct_post needs a presentationDefinition; dc_api needs a dcqlQuery',
  });
export type MockVerifierCreateRequest = z.infer<typeof MockVerifierCreateRequestSchema>;

export const MockVerifierCreateResponseSchema = z.object({
  requestId: z.string(),
  transactionId: z.string(),
  /** `openid4vp://authorize?client_id=…&request_uri=…` for the QR code or deep link (direct_post). */
  authorizationRequestUri: z.string().optional(),
  requestUri: z.string().optional(),
  /** dc_api: the request for navigator.credentials.get, OpenID4VP 1.0 unsigned. */
  dcApiRequest: z
    .object({ protocol: z.literal('openid4vp-v1-unsigned'), data: z.record(z.string(), z.unknown()) })
    .optional(),
  clientId: z.string(),
  expiresAt: z.string(),
});
export type MockVerifierCreateResponse = z.infer<typeof MockVerifierCreateResponseSchema>;

export const MockVerifierRequestStatusSchema = z.enum(['ACTIVE', 'VP_SUBMITTED', 'EXPIRED']);

/** GET /mock-verifier/api/requests/:requestId/status (long poll). */
export const MockVerifierStatusResponseSchema = z.object({ status: MockVerifierRequestStatusSchema });

/** GET /mock-verifier/api/results/:transactionId, and the body of POST …/api/verify-credential. */
export const MockVerifierResultSchema = z.object({
  transactionId: z.string().optional(),
  outcome: VerificationOutcomeSchema,
  /** Every check, in order, with its own pass/fail/warn/skip. */
  stages: z.array(VerificationStageSchema),
  format: CredentialFormatSchema.optional(),
  credentialType: z.string().optional(),
  issuer: z.string().optional(),
  verifiedAt: z.string(),
});
export type MockVerifierResult = z.infer<typeof MockVerifierResultSchema>;

/** POST /mock-verifier/api/dc-api/:requestId: the browser wallet's response, relayed by the BFF. */
export const MockVerifierDcApiResponseSchema = z.object({
  /** The page origin the browser reported; an unsigned request binds the presentation to it. */
  origin: z.string().min(1),
  data: z.unknown(),
});

/** POST /mock-verifier/api/verify-credential: a credential on its own (no presentation, no holder binding). */
export const MockVerifierVerifyCredentialSchema = z.object({
  credential: z.string().min(1),
  format: CredentialFormatSchema.optional(),
});
