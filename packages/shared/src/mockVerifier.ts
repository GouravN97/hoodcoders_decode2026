// REST contract of apps/mock-verifier (plan §8.4), used by the BFF's MockVerifierAdapter: a generic
// OpenID4VP draft-23 verifier (Presentation Exchange, direct_post) that reports every check it makes.
import { z } from 'zod';
import { CredentialFormatSchema, VerificationOutcomeSchema, VerificationStageSchema } from './domain';

/** POST /mock-verifier/api/requests */
export const MockVerifierCreateRequestSchema = z.object({
  /** Reuse the run's id so the Protocol Tap correlates it; generated when absent. */
  transactionId: z.string().min(1).optional(),
  presentationDefinition: z.object({
    id: z.string(),
    purpose: z.string().optional(),
    input_descriptors: z.array(z.record(z.string(), z.unknown())).min(1),
  }),
});
export type MockVerifierCreateRequest = z.infer<typeof MockVerifierCreateRequestSchema>;

export const MockVerifierCreateResponseSchema = z.object({
  requestId: z.string(),
  transactionId: z.string(),
  /** `openid4vp://authorize?client_id=…&request_uri=…` for the QR code or deep link. */
  authorizationRequestUri: z.string(),
  requestUri: z.string(),
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

/** POST /mock-verifier/api/verify-credential: a credential on its own (no presentation, no holder binding). */
export const MockVerifierVerifyCredentialSchema = z.object({
  credential: z.string().min(1),
  format: CredentialFormatSchema.optional(),
});
