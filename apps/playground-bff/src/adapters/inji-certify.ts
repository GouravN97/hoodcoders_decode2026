// InjiCertifyIssuerAdapter: pre-authorized code offers through Certify's pre-authorized data API
// (CERTIFY_FLOW=preauth in injistack). Offer creation goes through the Protocol Tap, so the
// inspector shows it next to the wallet's own requests.
import {
  ProofSuiteSchema,
  ProtocolStep,
  type CredentialConfigurationSummary,
  type CredentialFormat,
  type ImplementationDescriptor,
  type ProofSuite,
} from '@playground/shared';
import { probeHealth, staticVersion, upstream } from './http.ts';
import type { IssuanceHandle, IssuerAdapter, RunContext } from './types.ts';

/** Mock identity data only (CLAUDE.md). Keys are the Farmer configurations' credential_subject claims. */
export const MOCK_FARMER_CLAIMS = {
  fullName: 'Ramesh Kumar',
  mobileNumber: '+91 90000 00042',
  dateOfBirth: '1984-03-12',
  gender: 'Male',
  state: 'Karnataka',
  district: 'Bengaluru Rural',
  villageOrTown: 'Hoskote',
  postalCode: '562114',
  landArea: '2.5 acres',
  landOwnershipType: 'Owner',
  primaryCropType: 'Ragi',
  secondaryCropType: 'Tomato',
  farmerID: 'FRM-2026-004217',
};

interface CertifyConfiguration {
  format: CredentialFormat;
  vct?: string;
  credential_definition?: { type?: string[] };
  credential_signing_alg_values_supported?: string[];
  display?: Array<{ name?: string; locale?: string }>;
}

/** Certify advertises signing algorithms; the playground talks about proof suites. */
function proofSuitesOf(c: CertifyConfiguration): ProofSuite[] {
  const algs = c.credential_signing_alg_values_supported ?? [];
  const suites = algs.map((a) =>
    c.format === 'ldp_vc' && a === 'EdDSA' ? 'Ed25519Signature2020' : a,
  );
  return suites.filter((s): s is ProofSuite => ProofSuiteSchema.safeParse(s).success);
}

export class InjiCertifyIssuerAdapter implements IssuerAdapter {
  private configurations?: { at: number; value: CredentialConfigurationSummary[] };

  constructor(
    readonly descriptor: ImplementationDescriptor,
    /** Certify's API as the BFF reaches it: the tap port, or the internal URL without a tap. */
    private readonly apiUrl: string,
  ) {}

  healthCheck() {
    return probeHealth(
      this.descriptor.internalUrl && `${this.descriptor.internalUrl}/v1/certify/actuator/health`,
    );
  }

  async version() {
    return staticVersion(this.descriptor);
  }

  async listCredentialConfigurations(): Promise<CredentialConfigurationSummary[]> {
    if (this.configurations && Date.now() - this.configurations.at < 60_000)
      return this.configurations.value;
    const base = this.descriptor.internalUrl ?? this.apiUrl;
    const res = await upstream(
      ProtocolStep.VCI_ISSUER_METADATA,
      `${base}/v1/certify/.well-known/openid-credential-issuer`,
    );
    const metadata = res.json<{
      credential_configurations_supported?: Record<string, CertifyConfiguration>;
    }>();
    const value = Object.entries(metadata.credential_configurations_supported ?? {}).map(
      ([id, c]) => ({
        id,
        format: c.format,
        displayName:
          c.display?.find((d) => d.locale?.startsWith('en'))?.name ?? c.display?.[0]?.name ?? id,
        credentialType:
          c.vct ?? c.credential_definition?.type?.find((t) => t !== 'VerifiableCredential'),
        proofSuites: proofSuitesOf(c),
      }),
    );
    this.configurations = { at: Date.now(), value };
    return value;
  }

  async prepareIssuance(ctx: RunContext): Promise<IssuanceHandle> {
    const res = await upstream('offer_prepared', `${this.apiUrl}/v1/certify/pre-authorized-data`, {
      method: 'POST',
      runId: ctx.runId,
      signal: ctx.signal,
      body: JSON.stringify({
        credential_configuration_id: ctx.config.credentialConfigurationId,
        claims: MOCK_FARMER_CLAIMS,
      }),
    });
    const offerUri = res.json<{ credential_offer_uri?: string }>().credential_offer_uri;
    if (!offerUri) throw new Error('Certify returned no credential_offer_uri');
    const byReference = new URL(offerUri).searchParams.get('credential_offer_uri') ?? '';
    const offerId = byReference.split('/').pop() || undefined;
    return { offerUri, ...(offerId ? { offerId } : {}) };
  }
}
