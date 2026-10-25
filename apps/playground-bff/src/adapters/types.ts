// Role adapter contracts (plan §8.2). One adapter per implementation; the orchestrator only
// talks to these interfaces, so adding a product is one class plus one catalog/*.yaml entry.
import type {
  CredentialConfigurationSummary,
  CredentialFormat,
  DeliveryInstruction,
  HealthStatus,
  HeldCredential,
  ImplementationDescriptor,
  MockWalletTamper,
  RespondRequest,
  RespondResponse,
  RunConfig,
  VerificationOutcome,
  VerificationStage,
} from '@playground/shared';

export interface RunContext {
  runId: string;
  config: RunConfig;
  signal: AbortSignal;
}

export interface RoleAdapter {
  readonly descriptor: ImplementationDescriptor;
  healthCheck(): Promise<HealthStatus>;
  /** Version from the descriptor's version probe. */
  version(): Promise<string | undefined>;
}

export interface IssuanceHandle {
  /** `openid-credential-offer://…`; absent for wallet-initiated (authorization code) flows. */
  offerUri?: string;
  offerId?: string;
  /** The issuer's absolute expiry, when its offer response publishes one. */
  expiresAt?: string;
  /**
   * External issuers receive the wallet's token and credential requests directly, outside the
   * Protocol Tap. In that case the holder confirms successful storage from the run screen.
   */
  observation?: 'tap' | 'manual';
  /** Where the user starts a wallet-initiated flow. */
  entryUrl?: string;
}

export interface IssuerAdapter extends RoleAdapter {
  listCredentialConfigurations(): Promise<CredentialConfigurationSummary[]>;
  /** Pre-authorized code: create an offer with mock claims. */
  prepareIssuance(ctx: RunContext): Promise<IssuanceHandle>;
}

export interface PresentationSpec {
  id: string;
  format: CredentialFormat;
  /** `type` for ldp_vc, `vct` for SD-JWT. */
  credentialType: string;
  purpose: string;
}

export interface PresentationRequestHandle {
  requestId: string;
  transactionId: string;
  /** `openid4vp://authorize?…` as the Inji Verify SDK builds it. */
  authorizationRequestUri: string;
  presentationDefinition: object;
}

export type RequestStatus = 'ACTIVE' | 'VP_SUBMITTED' | 'EXPIRED';

export interface VerifierResult {
  outcome: VerificationOutcome;
  perCredential: Array<{ index: number; outcome: VerificationOutcome; reason?: string }>;
  verifierRaw: unknown;
  reason?: string;
  /** Every check the verifier made, when it reports them. */
  stages?: VerificationStage[];
}

export interface VerifierAdapter extends RoleAdapter {
  /** The Protocol Tap component its traffic is recorded under. */
  readonly component?: string;
  createPresentationRequest(
    ctx: RunContext,
    spec: PresentationSpec,
  ): Promise<PresentationRequestHandle>;
  /** One long poll of the request status; returns when it changes or the verifier's poll times out. */
  pollStatus(ctx: RunContext, handle: PresentationRequestHandle): Promise<RequestStatus>;
  fetchResult(ctx: RunContext, handle: PresentationRequestHandle): Promise<VerifierResult>;
  /** A credential on its own, outside any presentation: the second opinion (VER-002). */
  verifyCredential?(
    ctx: RunContext,
    credential: string,
    format: CredentialFormat,
  ): Promise<VerifierResult>;
}

export interface WalletAdapter extends RoleAdapter {
  issuanceDelivery(handle: IssuanceHandle): DeliveryInstruction;
  presentationDelivery(ctx: RunContext, handle: PresentationRequestHandle): DeliveryInstruction;
  /** Headless wallets only: take the offer and return the stored credential. */
  acceptOffer?(ctx: RunContext, handle: IssuanceHandle): Promise<HeldCredential>;
  /** Wallets the playground can look into: what they already hold (present-only runs). */
  listCredentials?(signal: AbortSignal): Promise<HeldCredential[]>;
  /** Headless wallets only: answer the presentation request. */
  respond?(
    ctx: RunContext,
    handle: PresentationRequestHandle,
    opts: { credentialId?: string; tamper?: MockWalletTamper; replay?: RespondRequest['replay'] },
  ): Promise<RespondResponse>;
}

export type AnyAdapter = IssuerAdapter | WalletAdapter | VerifierAdapter;
