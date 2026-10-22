// OpenID4VCI holder (draft 13, pre-authorized code): offer → issuer metadata → AS metadata →
// token → proof of possession → credential. Every request goes to the issuer's public URL, so
// the Protocol Tap in front of the issuer records all of it.
import { randomUUID } from 'node:crypto';
import {
  ProtocolStep,
  type AcceptOfferRequest,
  type CredentialFormat,
  type HeldCredential,
} from '@playground/shared';
import { SignJWT } from 'jose';
import { call, form, json, parseJson, WalletError } from './http.ts';
import type { HolderKey } from './keys.ts';

const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code';

interface CredentialOffer {
  credential_issuer: string;
  credential_configuration_ids: string[];
  grants?: Record<string, { 'pre-authorized_code'?: string; tx_code?: unknown } | undefined>;
}

interface CredentialConfiguration {
  format: CredentialFormat;
  vct?: string;
  credential_definition?: { '@context'?: string[]; type?: string[] };
  proof_types_supported?: { jwt?: { proof_signing_alg_values_supported?: string[] } };
}

interface IssuerMetadata {
  credential_issuer: string;
  credential_endpoint: string;
  authorization_servers?: string[];
  credential_configurations_supported: Record<string, CredentialConfiguration>;
}

/** Offer by reference (`credential_offer_uri`) or by value (`credential_offer`). */
export async function resolveOffer(offerUri: string): Promise<CredentialOffer> {
  const step = ProtocolStep.VCI_CREDENTIAL_OFFER;
  let params: URLSearchParams;
  try {
    params = new URL(offerUri).searchParams;
  } catch {
    throw new WalletError(step, 'Offer is not a URI', 400);
  }
  const byValue = params.get('credential_offer');
  if (byValue) {
    try {
      return JSON.parse(byValue) as CredentialOffer;
    } catch {
      throw new WalletError(step, 'credential_offer is not JSON', 400);
    }
  }
  const byReference = params.get('credential_offer_uri');
  if (!byReference)
    throw new WalletError(step, 'Offer has neither credential_offer nor credential_offer_uri', 400);
  return parseJson<CredentialOffer>(step, await call(step, byReference));
}

const wellKnown = (base: string, name: string) => `${base.replace(/\/$/, '')}/.well-known/${name}`;

/** Draft 13 returns `credential`; 1.0 returns `credentials: [{ credential }]`. */
function credentialFrom(body: Record<string, unknown>): unknown {
  if (body.credential !== undefined) return body.credential;
  const list = body.credentials as Array<{ credential?: unknown }> | undefined;
  return list?.[0]?.credential ?? list?.[0];
}

export async function acceptOffer(
  req: AcceptOfferRequest,
  holder: HolderKey,
): Promise<HeldCredential> {
  const offer = await resolveOffer(req.offerUri);
  const configurationId = offer.credential_configuration_ids?.[0];
  if (!offer.credential_issuer || !configurationId) {
    throw new WalletError(
      ProtocolStep.VCI_CREDENTIAL_OFFER,
      'Offer lacks credential_issuer or credential_configuration_ids',
      400,
    );
  }
  const preAuthorizedCode = offer.grants?.[PRE_AUTH_GRANT]?.['pre-authorized_code'];
  if (!preAuthorizedCode) {
    throw new WalletError(
      ProtocolStep.VCI_CREDENTIAL_OFFER,
      'Only pre-authorized code offers are supported',
      400,
    );
  }

  const metaStep = ProtocolStep.VCI_ISSUER_METADATA;
  const metadata = parseJson<IssuerMetadata>(
    metaStep,
    await call(metaStep, wellKnown(offer.credential_issuer, 'openid-credential-issuer')),
  );
  const config = metadata.credential_configurations_supported?.[configurationId];
  if (!config)
    throw new WalletError(metaStep, `Issuer metadata has no configuration ${configurationId}`);
  const algs = config.proof_types_supported?.jwt?.proof_signing_alg_values_supported;
  if (algs && !algs.includes('ES256')) {
    throw new WalletError(
      metaStep,
      `Configuration ${configurationId} does not accept ES256 proofs (${algs.join(', ')})`,
    );
  }

  const asStep = ProtocolStep.VCI_AS_METADATA;
  const asUrl = metadata.authorization_servers?.[0] ?? offer.credential_issuer;
  const asMetadata = parseJson<{ token_endpoint?: string }>(
    asStep,
    await call(asStep, wellKnown(asUrl, 'oauth-authorization-server')),
  );
  if (!asMetadata.token_endpoint)
    throw new WalletError(asStep, 'Authorization server metadata has no token_endpoint');

  const tokenStep = ProtocolStep.VCI_TOKEN;
  const token = parseJson<{ access_token?: string; c_nonce?: string }>(
    tokenStep,
    await call(
      tokenStep,
      asMetadata.token_endpoint,
      form({
        grant_type: PRE_AUTH_GRANT,
        'pre-authorized_code': preAuthorizedCode,
        ...(req.txCode ? { tx_code: req.txCode } : {}),
      }),
    ),
  );
  if (!token.access_token) throw new WalletError(tokenStep, 'Token response has no access_token');

  const proof = await new SignJWT({ ...(token.c_nonce ? { nonce: token.c_nonce } : {}) })
    .setProtectedHeader({ alg: 'ES256', typ: 'openid4vci-proof+jwt', kid: holder.kid })
    .setAudience(metadata.credential_issuer)
    .setIssuedAt()
    .sign(holder.privateKey);

  const proofField = { proof: { proof_type: 'jwt', jwt: proof } };
  const body =
    config.format === 'ldp_vc'
      ? {
          format: config.format,
          credential_definition: config.credential_definition,
          ...proofField,
        }
      : { format: config.format, vct: config.vct, ...proofField };

  const credStep = ProtocolStep.VCI_CREDENTIAL;
  const response = parseJson(
    credStep,
    await call(
      credStep,
      metadata.credential_endpoint,
      json(body, { authorization: `Bearer ${token.access_token}` }),
    ),
  );
  const credential = credentialFrom(response);
  if (credential === undefined || credential === null)
    throw new WalletError(credStep, 'Credential response has no credential');

  return {
    id: randomUUID(),
    format: config.format,
    credentialConfigurationId: configurationId,
    issuer: metadata.credential_issuer,
    raw: typeof credential === 'string' ? credential : JSON.stringify(credential),
    receivedAt: new Date().toISOString(),
    holderDid: holder.did,
  };
}
