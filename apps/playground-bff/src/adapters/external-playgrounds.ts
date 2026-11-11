// Public issuer-playground adapters. They create short-lived OpenID4VCI offers, but the phone
// talks to each third-party issuer directly, so completion is confirmed by the holder rather than
// observed through our Protocol Tap.
import { randomUUID } from 'node:crypto';
import {
  ProtocolStep,
  type CredentialConfigurationSummary,
  type ImplementationDescriptor,
} from '@playground/shared';
import { z } from 'zod';
import { AdapterError, probeHealth, staticVersion, upstream } from './http.ts';
import type { IssuanceHandle, IssuerAdapter, RunContext } from './types.ts';

const HOVI_CONFIGURATIONS: CredentialConfigurationSummary[] = [
  {
    id: 'pid-sdjwt',
    format: 'dc+sd-jwt',
    displayName: 'Personal Identification Data (PID) — SD-JWT VC',
    credentialType: 'urn:eudi:pid:1',
    proofSuites: ['ES256'],
  },
  {
    id: 'pid-mdoc',
    format: 'mso_mdoc',
    displayName: 'Personal Identification Data (PID) — mDoc',
    credentialType: 'eu.europa.ec.eudi.pid.1',
    proofSuites: ['ES256'],
  },
];

/**
 * Credential types Animo's issuer list does not publish, read from each issuer's
 * `/.well-known/openid-credential-issuer` (11 November 2026). A presentation request asks for
 * exactly this `vct` / doctype, so a missing one means the wallet finds no matching credential.
 */
const ANIMO_KNOWN_TYPES: Record<string, string> = {
  'tax-id-sd-jwt': 'https://example.eudi.ec.europa.eu/tax-id/1',
  'tax-id-mdoc': 'eu.europa.ec.eudi.taxid.1',
};

const ANIMO_FORMATS = {
  'dc+sd-jwt': 'dc+sd-jwt',
  mso_mdoc: 'mso_mdoc',
} as const;

const AnimoIssuersSchema = z.array(
  z.object({
    name: z.string(),
    credentials: z.array(
      z.object({
        display: z.object({ name: z.string() }),
        formats: z.record(z.string(), z.string()),
      }),
    ),
  }),
);

const AnimoOfferSchema = z.object({
  credentialOffer: z.string().min(1),
  issuanceSession: z
    .object({
      id: z.string().optional(),
      credentialOfferId: z.string().optional(),
      expiresAt: z.string().optional(),
    })
    .passthrough(),
});

const HoviOfferSchema = z.object({
  request_uri: z.string().min(1),
  sessionId: z.string().optional(),
});

interface HoviClientConfig {
  supabaseUrl: string;
  anonKey: string;
}

export interface HoviAdapterOptions {
  supabaseUrl?: string;
  anonKey?: string;
}

function parseHoviClientConfig(bundle: string): HoviClientConfig {
  const match = bundle.match(
    /"(https:\/\/[a-z0-9-]+\.supabase\.co)"[\s\S]{0,240}?"(eyJ[A-Za-z0-9._-]+)"/,
  );
  if (!match?.[1] || !match[2]) {
    throw new AdapterError(
      'offer_prepared',
      'Hovi client configuration was not found in its public application bundle',
    );
  }
  return { supabaseUrl: match[1], anonKey: match[2] };
}

export class HoviPlaygroundIssuerAdapter implements IssuerAdapter {
  private clientConfig?: { at: number; value: HoviClientConfig };

  constructor(
    readonly descriptor: ImplementationDescriptor,
    private readonly options: HoviAdapterOptions = {},
  ) {}

  healthCheck() {
    return probeHealth(this.descriptor.publicUrl);
  }

  async version() {
    return staticVersion(this.descriptor);
  }

  async listCredentialConfigurations() {
    return HOVI_CONFIGURATIONS;
  }

  private async configuration(ctx: RunContext): Promise<HoviClientConfig> {
    if (this.options.supabaseUrl && this.options.anonKey) {
      return { supabaseUrl: this.options.supabaseUrl, anonKey: this.options.anonKey };
    }
    if (this.clientConfig && Date.now() - this.clientConfig.at < 10 * 60_000) {
      return this.clientConfig.value;
    }
    const root = await upstream('offer_prepared', this.descriptor.publicUrl, {
      signal: ctx.signal,
    });
    const asset = root.text.match(
      /<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/,
    )?.[1];
    if (!asset) {
      throw new AdapterError(
        'offer_prepared',
        'Hovi application bundle was not linked from the playground page',
      );
    }
    const bundle = await upstream(
      'offer_prepared',
      new URL(asset, this.descriptor.publicUrl).toString(),
      { signal: ctx.signal },
    );
    const value = parseHoviClientConfig(bundle.text);
    this.clientConfig = { at: Date.now(), value };
    return value;
  }

  async prepareIssuance(ctx: RunContext): Promise<IssuanceHandle> {
    if (!HOVI_CONFIGURATIONS.some((c) => c.id === ctx.config.credentialConfigurationId)) {
      throw new AdapterError(
        'offer_prepared',
        `Hovi credential ${ctx.config.credentialConfigurationId} is not supported by this adapter`,
      );
    }
    const client = await this.configuration(ctx);
    const res = await upstream(
      'offer_prepared',
      `${client.supabaseUrl.replace(/\/$/, '')}/functions/v1/issue-credential`,
      {
        method: 'POST',
        runId: ctx.runId,
        signal: ctx.signal,
        headers: {
          apikey: client.anonKey,
          authorization: `Bearer ${client.anonKey}`,
        },
        body: JSON.stringify({
          credentialType: ctx.config.credentialConfigurationId,
          sessionId: randomUUID(),
          ecosystem: 'eudiw',
        }),
      },
    );
    const offer = HoviOfferSchema.parse(res.json());
    return {
      offerUri: offer.request_uri,
      ...(offer.sessionId ? { offerId: offer.sessionId } : {}),
      observation: 'manual',
    };
  }
}

export class AnimoPlaygroundIssuerAdapter implements IssuerAdapter {
  private configurations?: { at: number; value: CredentialConfigurationSummary[] };

  constructor(readonly descriptor: ImplementationDescriptor) {}

  healthCheck() {
    return probeHealth(`${this.descriptor.publicUrl.replace(/\/$/, '')}/api/issuers`);
  }

  async version() {
    return staticVersion(this.descriptor);
  }

  async listCredentialConfigurations(): Promise<CredentialConfigurationSummary[]> {
    if (this.configurations && Date.now() - this.configurations.at < 60_000) {
      return this.configurations.value;
    }
    const res = await upstream(
      ProtocolStep.VCI_ISSUER_METADATA,
      `${this.descriptor.publicUrl.replace(/\/$/, '')}/api/issuers`,
    );
    const issuers = AnimoIssuersSchema.parse(res.json());
    // Animo's issuer list changes (the Bundesdruckerei PID issuer was removed in November 2026),
    // so offer every credential it publishes in a supported format, PID credentials first.
    const isPid = (name: string) => /\bPID\b/i.test(name);
    const value = issuers
      .flatMap((issuer) =>
        issuer.credentials.flatMap((credential) =>
          Object.entries(credential.formats).flatMap(([format, id]) => {
            const supported = ANIMO_FORMATS[format as keyof typeof ANIMO_FORMATS];
            if (!supported) return [];
            const pid = isPid(credential.display.name);
            const credentialType = pid
              ? supported === 'mso_mdoc'
                ? 'eu.europa.ec.eudi.pid.1'
                : 'urn:eudi:pid:1'
              : ANIMO_KNOWN_TYPES[id];
            return [
              {
                id,
                format: supported,
                displayName: `${issuer.name} · ${credential.display.name} — ${supported === 'mso_mdoc' ? 'mDoc' : 'SD-JWT VC'}`,
                // The issuer list does not publish vct/doctype: the PID's and ANIMO_KNOWN_TYPES only.
                ...(credentialType ? { credentialType } : {}),
                proofSuites: ['ES256' as const],
                pid,
              },
            ];
          }),
        ),
      )
      .sort((a, b) => Number(b.pid) - Number(a.pid))
      .map(({ pid: _pid, ...summary }) => summary);
    if (value.length === 0) {
      throw new AdapterError(
        ProtocolStep.VCI_ISSUER_METADATA,
        'Animo currently publishes no dc+sd-jwt or mso_mdoc credentials',
      );
    }
    this.configurations = { at: Date.now(), value };
    return value;
  }

  async prepareIssuance(ctx: RunContext): Promise<IssuanceHandle> {
    const configurations = await this.listCredentialConfigurations();
    if (!configurations.some((c) => c.id === ctx.config.credentialConfigurationId)) {
      throw new AdapterError(
        'offer_prepared',
        `Animo credential ${ctx.config.credentialConfigurationId} is not supported by this adapter`,
      );
    }
    const res = await upstream(
      'offer_prepared',
      `${this.descriptor.publicUrl.replace(/\/$/, '')}/api/offers/create`,
      {
        method: 'POST',
        runId: ctx.runId,
        signal: ctx.signal,
        body: JSON.stringify({
          credentialSupportedIds: [ctx.config.credentialConfigurationId],
          authorization: 'none',
          deferBy: 'none',
          requireDpop: false,
          requireWalletAttestation: false,
          requireKeyAttestation: false,
        }),
      },
    );
    const offer = AnimoOfferSchema.parse(res.json());
    return {
      offerUri: offer.credentialOffer,
      offerId: offer.issuanceSession.credentialOfferId ?? offer.issuanceSession.id,
      ...(offer.issuanceSession.expiresAt ? { expiresAt: offer.issuanceSession.expiresAt } : {}),
      observation: 'manual',
    };
  }
}
