// REST contract of apps/mock-wallet (plan §8.5), used by the BFF's MockWalletAdapter and the CLI.
import { z } from 'zod';
import { CredentialFormatSchema } from './domain';

/** Tampers the mock wallet can apply before presenting (plan §13). */
export const MockWalletTamperSchema = z.enum([
  /** Flip one character of the issuer's signature: the verifier must answer Invalid. */
  'T-SIG-FLIP',
  /** Change a claim after signing (JSON-LD) or swap a disclosure value (SD-JWT): Invalid. */
  'T-CLAIM-EDIT',
]);
export type MockWalletTamper = z.infer<typeof MockWalletTamperSchema>;

/** POST /offers/accept */
export const AcceptOfferRequestSchema = z.object({
  /** `openid-credential-offer://?credential_offer_uri=…` or `…?credential_offer=…`. */
  offerUri: z.string().min(1),
  txCode: z.string().optional(),
});
export type AcceptOfferRequest = z.infer<typeof AcceptOfferRequestSchema>;

export const HeldCredentialSchema = z.object({
  id: z.string(),
  format: CredentialFormatSchema,
  credentialConfigurationId: z.string(),
  issuer: z.string(),
  /** JSON string for ldp_vc, compact `<jwt>~<disclosure>~…~` for SD-JWT. */
  raw: z.string(),
  receivedAt: z.string(),
  holderDid: z.string(),
});
export type HeldCredential = z.infer<typeof HeldCredentialSchema>;

export const AcceptOfferResponseSchema = HeldCredentialSchema;

/** POST /presentations/respond */
export const RespondRequestSchema = z.object({
  /** `openid4vp://authorize?…`, by reference (`request_uri`) or by value. */
  authorizationRequestUri: z.string().min(1),
  /** Present this credential; otherwise the newest one matching the request. */
  credentialId: z.string().optional(),
  tamper: MockWalletTamperSchema.optional(),
});
export type RespondRequest = z.infer<typeof RespondRequestSchema>;

export const RespondResponseSchema = z.object({
  credentialId: z.string(),
  responseUri: z.string(),
  /** HTTP status the verifier answered the direct_post with. */
  status: z.number().int(),
  body: z.string().optional(),
  tamper: MockWalletTamperSchema.optional(),
  /** Problems the wallet noticed but did not stop for, e.g. an unverifiable request object signature. */
  warnings: z.array(z.string()),
});
export type RespondResponse = z.infer<typeof RespondResponseSchema>;

/** Error body for every non-2xx response; `step` names the protocol step that failed. */
export const MockWalletErrorSchema = z.object({
  message: z.string(),
  statusCode: z.number().int(),
  step: z.string().optional(),
  upstreamStatus: z.number().int().optional(),
  upstreamBody: z.string().optional(),
});
export type MockWalletError = z.infer<typeof MockWalletErrorSchema>;
