// Realistic protocol payloads for the mock runs. JWTs are really signed (ES256, throwaway
// keys generated per run) and SD-JWT digests are real, so the inspector's decoders are
// exercised on genuine structures. All identity data is fake.
//
// ⚠️ Inji Certify / Inji Verify endpoint paths and response shapes are modelled on their
// public docs and must be checked against the pinned image tags before relying on them.
import {
  describeTamper,
  type CredentialFormat,
  type ReplayInput,
  type TamperEvidence,
  type TamperId,
} from '@playground/shared';
import { base64url, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { disclosureDigest } from '../lib/decode/sdjwt';

export type Scenario = 'valid' | 'invalid-signature' | 'expired' | 'fail-at-token' | 'timeout';

export const ISSUER_URL = 'https://certify.playground.local';
export const VERIFIER_URL = 'https://verify.playground.local';
export const VERIFIER_CLIENT_ID = 'did:web:verify.playground.local';
const ISSUER_DID = 'did:web:certify.playground.local';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const randomBase58 = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => B58[b % 58]).join('');
const randomToken = (bytes = 24) => base64url.encode(crypto.getRandomValues(new Uint8Array(bytes)));

const FARMER = {
  fullName: 'Ramesh Kumar',
  farmerID: 'FRM-2026-004217',
  dateOfBirth: '1984-03-12',
  mobileNumber: '+91 90000 00042',
  district: 'Bengaluru Rural',
  villageOrTown: 'Hoskote',
  landArea: '2.5 acres',
  landOwnershipType: 'Owner',
  primaryCropType: 'Ragi',
  secondaryCropType: 'Tomato',
};
const DISCLOSED_IN_VP = ['fullName', 'farmerID', 'landArea', 'primaryCropType'];

export interface CredentialConfigFixture {
  id: string;
  format: CredentialFormat;
  displayName: string;
  credentialType: string;
  proofSuite: 'Ed25519Signature2020' | 'ES256';
  validitySeconds?: number;
  /** Signed with validity in the past, like Certify's FarmerCredential*Expired configurations. */
  expired?: boolean;
}

export const CREDENTIAL_CONFIGURATIONS: CredentialConfigFixture[] = [
  {
    id: 'FarmerCredential',
    format: 'ldp_vc',
    displayName: 'Farmer credential (JSON-LD)',
    credentialType: 'FarmerCredential',
    proofSuite: 'Ed25519Signature2020',
  },
  {
    id: 'FarmerCredentialSdJwt',
    format: 'vc+sd-jwt',
    displayName: 'Farmer credential (SD-JWT)',
    credentialType: 'urn:eu.playground:farmer:1',
    proofSuite: 'ES256',
  },
  {
    id: 'FarmerCredentialExpired',
    format: 'ldp_vc',
    displayName: 'Farmer credential (JSON-LD, expired)',
    credentialType: 'FarmerCredential',
    proofSuite: 'Ed25519Signature2020',
    expired: true,
  },
  {
    id: 'FarmerCredentialSdJwtExpired',
    format: 'vc+sd-jwt',
    displayName: 'Farmer credential (SD-JWT, expired)',
    credentialType: 'FarmerCredentialSdJwtExpired',
    proofSuite: 'ES256',
    expired: true,
  },
];

/** The type a T-WRONG-TYPE run asks for (the BFF's WRONG_CREDENTIAL_TYPE). */
export const WRONG_CREDENTIAL_TYPE = 'PlaygroundWrongTypeCredential';

const HOVI_CREDENTIAL_CONFIGURATIONS: CredentialConfigFixture[] = [
  {
    id: 'pid-sdjwt',
    format: 'dc+sd-jwt',
    displayName: 'Personal Identification Data (PID) — SD-JWT VC',
    credentialType: 'urn:eudi:pid:1',
    proofSuite: 'ES256',
  },
  {
    id: 'pid-mdoc',
    format: 'mso_mdoc',
    displayName: 'Personal Identification Data (PID) — mDoc',
    credentialType: 'eu.europa.ec.eudi.pid.1',
    proofSuite: 'ES256',
  },
];

const ANIMO_CREDENTIAL_CONFIGURATIONS: CredentialConfigFixture[] = [
  {
    id: 'eudi-pid-sd-jwt-bdr',
    format: 'dc+sd-jwt',
    displayName: 'EUDI PID — SD-JWT VC',
    credentialType: 'urn:eudi:pid:1',
    proofSuite: 'ES256',
  },
  {
    id: 'eudi-pid-mdoc-bdr',
    format: 'mso_mdoc',
    displayName: 'EUDI PID — mDoc',
    credentialType: 'eu.europa.ec.eudi.pid.1',
    proofSuite: 'ES256',
  },
];

const ALL_CREDENTIAL_CONFIGURATIONS = [
  ...CREDENTIAL_CONFIGURATIONS,
  ...HOVI_CREDENTIAL_CONFIGURATIONS,
  ...ANIMO_CREDENTIAL_CONFIGURATIONS,
];

export function credentialConfigurationsForIssuer(issuerId: string) {
  if (issuerId === 'hovi-playground') return HOVI_CREDENTIAL_CONFIGURATIONS;
  if (issuerId === 'animo-playground') return ANIMO_CREDENTIAL_CONFIGURATIONS;
  return CREDENTIAL_CONFIGURATIONS;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const epoch = (d: Date) => Math.floor(d.getTime() / 1000);

/** Changes the middle character, keeping the length, as the mock wallet's T-SIG-FLIP does. */
function flipMiddle(value: string): string {
  const mid = Math.floor(value.length / 2);
  const flipped = value[mid] === 'A' ? 'B' : 'A';
  return `${value.slice(0, mid)}${flipped}${value.slice(mid + 1)}`;
}

/** Breaks a JWS signature without changing its length, as a tampered credential would. */
function corruptSignature(jwt: string): string {
  const [h, p, s = ''] = jwt.split('.');
  return `${h}.${p}.${flipMiddle(s)}`;
}

function ldpProof(verificationMethod: string, purpose: string, created: Date, extra: object = {}) {
  return {
    type: 'Ed25519Signature2020',
    created: iso(created),
    verificationMethod,
    proofPurpose: purpose,
    ...extra,
    proofValue: `z${randomBase58(86)}`,
  };
}

export interface RunFixtures {
  preAuthorizedCode: string;
  offerId: string;
  offerUri: string;
  offer: object;
  issuerMetadata: object;
  tokenRequest: string;
  tokenResponse: object;
  accessToken: string;
  cNonce: string;
  credentialRequest: object;
  credentialResponse: object;
  /** Raw credential as the wallet holds it (JSON string for ldp_vc, compact for SD-JWT). */
  credentialRaw: string;
  proofType: string;
  createVpRequestBody: object;
  createVpRequestResponse: object;
  requestId: string;
  transactionId: string;
  authorizationRequestUri: string;
  requestObject: object;
  presentationDefinition: object;
  vpToken: string;
  presentationSubmission: object;
  vpSubmissionBody: string;
  vpResult: object;
  /** What the wallet's tamper changed, when the run applies one. */
  tamperEvidence?: TamperEvidence;
}

export async function buildFixtures(opts: {
  runId: string;
  format: CredentialFormat;
  credentialConfigurationId: string;
  scenario: Scenario;
  /** A wallet-hook tamper the mock wallet applies when presenting (plan §13). */
  tamper?: TamperId;
  replay?: ReplayInput;
}): Promise<RunFixtures> {
  const { format, scenario, tamper, replay } = opts;
  const config =
    ALL_CREDENTIAL_CONFIGURATIONS.find((c) => c.id === opts.credentialConfigurationId) ??
    ALL_CREDENTIAL_CONFIGURATIONS.find((c) => c.format === format)!;
  const isSdJwt = format !== 'ldp_vc';
  const now = new Date();

  const issuerKeys = await generateKeyPair('ES256', { extractable: true });
  const holderKeys = await generateKeyPair('ES256', { extractable: true });
  const holderJwk: JWK = await exportJWK(holderKeys.publicKey);
  const holderDid = `did:jwk:${base64url.encode(JSON.stringify(holderJwk))}`;

  // ---------- issuance ----------
  const preAuthorizedCode = randomToken(18);
  const offerId = crypto.randomUUID();
  const offer = {
    credential_issuer: ISSUER_URL,
    credential_configuration_ids: [config.id],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': preAuthorizedCode,
      },
    },
  };
  const offerUri = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(
    `${ISSUER_URL}/v1/certify/credential-offer-data/${offerId}`,
  )}`;

  const issuerMetadata = {
    credential_issuer: ISSUER_URL,
    authorization_servers: [ISSUER_URL],
    credential_endpoint: `${ISSUER_URL}/v1/certify/issuance/credential`,
    display: [{ name: 'Inji Certify (playground)', locale: 'en' }],
    credential_configurations_supported: Object.fromEntries(
      CREDENTIAL_CONFIGURATIONS.map((c) => [
        c.id,
        c.format === 'ldp_vc'
          ? {
              format: 'ldp_vc',
              proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['ES256'] } },
              credential_definition: {
                '@context': ['https://www.w3.org/2018/credentials/v1'],
                type: ['VerifiableCredential', c.credentialType],
              },
              display: [{ name: c.displayName, locale: 'en' }],
            }
          : {
              format: 'vc+sd-jwt',
              vct: c.credentialType,
              proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['ES256'] } },
              display: [{ name: c.displayName, locale: 'en' }],
            },
      ]),
    ),
  };

  const tokenRequest = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
    'pre-authorized_code': preAuthorizedCode,
  }).toString();

  const cNonce = randomToken(12);
  const accessToken = await new SignJWT({
    scope: config.id,
    c_nonce: cNonce,
    client_id: 'wallet-demo',
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: `${ISSUER_DID}#key-0` })
    .setIssuer(ISSUER_URL)
    .setSubject(crypto.randomUUID())
    .setAudience(`${ISSUER_URL}/v1/certify/issuance/credential`)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(issuerKeys.privateKey);
  const tokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 300,
    c_nonce: cNonce,
    c_nonce_expires_in: 300,
  };

  const proofJwt = await new SignJWT({ nonce: cNonce })
    .setProtectedHeader({ alg: 'ES256', typ: 'openid4vci-proof+jwt', jwk: holderJwk })
    .setIssuer('wallet-demo')
    .setAudience(ISSUER_URL)
    .setIssuedAt()
    .sign(holderKeys.privateKey);

  const credentialRequest = isSdJwt
    ? {
        format: 'vc+sd-jwt',
        vct: config.credentialType,
        proof: { proof_type: 'jwt', jwt: proofJwt },
      }
    : {
        format: 'ldp_vc',
        credential_definition: {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential', config.credentialType],
        },
        proof: { proof_type: 'jwt', jwt: proofJwt },
      };

  // Expired credentials were validly signed, but their validity window has already closed.
  const expired = scenario === 'expired' || config.expired === true;
  const validFrom = expired ? new Date(now.getTime() - 86_400_000) : now;
  const validUntil =
    expired
      ? new Date(now.getTime() - 3_600_000)
      : new Date(now.getTime() + (config.validitySeconds ?? 365 * 86_400) * 1000);

  let credentialRaw: string;
  let credentialValue: unknown;
  let vpToken: string;
  let proofType: string;
  const nonce = randomToken(16);

  // The wallet signs over the request's nonce, or an earlier run's (T-NONCE-REPLAY, stale nonce).
  const boundNonce = replay?.variant === 'stale-nonce' ? replay.nonce : nonce;
  let presentedRaw: string;

  if (isSdJwt) {
    const disclosures = Object.entries(FARMER).map(([name, value]) =>
      base64url.encode(JSON.stringify([randomToken(12), name, value])),
    );
    const digests = await Promise.all(disclosures.map((d) => disclosureDigest(d)));
    let issuerJwt = await new SignJWT({
      vct: config.credentialType,
      _sd: digests,
      _sd_alg: 'sha-256',
      cnf: { jwk: holderJwk },
    })
      .setProtectedHeader({ alg: 'ES256', typ: 'vc+sd-jwt', kid: `${ISSUER_DID}#key-0` })
      .setIssuer(ISSUER_DID)
      .setIssuedAt(epoch(validFrom))
      .setNotBefore(epoch(validFrom))
      .setExpirationTime(epoch(validUntil))
      .sign(issuerKeys.privateKey);
    // A broken credential from elsewhere (no wallet tamper): the issued credential itself is bad.
    if (scenario === 'invalid-signature' && !tamper) issuerJwt = corruptSignature(issuerJwt);
    credentialRaw = `${issuerJwt}~${disclosures.join('~')}~`;
    credentialValue = credentialRaw;
    proofType = 'ES256';

    // What the wallet presents: the issued credential, or a tampered copy of it.
    let presentedJwt = issuerJwt;
    const presentedDisclosures = [...disclosures];
    if (tamper === 'T-SIG-FLIP') presentedJwt = corruptSignature(issuerJwt);
    if (tamper === 'T-CLAIM-EDIT') {
      presentedDisclosures[0] = base64url.encode(
        JSON.stringify([randomToken(12), 'fullName', `${FARMER.fullName} (edited)`]),
      );
    }
    presentedRaw = `${presentedJwt}~${presentedDisclosures.join('~')}~`;

    const names = Object.keys(FARMER);
    const shared = presentedDisclosures.filter((_, i) => DISCLOSED_IN_VP.includes(names[i]!));
    const presented = `${presentedJwt}~${shared.join('~')}~`;
    const sdHash = base64url.encode(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(presented))),
    );
    const kbJwt = await new SignJWT({ nonce: boundNonce, sd_hash: sdHash })
      .setProtectedHeader({ alg: 'ES256', typ: 'kb+jwt' })
      .setAudience(VERIFIER_CLIENT_ID)
      .setIssuedAt()
      .sign(holderKeys.privateKey);
    vpToken = `${presented}${kbJwt}`;
  } else {
    const subject: Record<string, string> = { id: holderDid, ...FARMER };
    const vc = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
        `${ISSUER_URL}/v1/certify/contexts/farmer-context.json`,
      ],
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['VerifiableCredential', config.credentialType],
      issuer: ISSUER_DID,
      issuanceDate: iso(validFrom),
      expirationDate: iso(validUntil),
      credentialSubject: subject,
      proof: ldpProof(`${ISSUER_DID}#key-0`, 'assertionMethod', validFrom),
    };
    if (scenario === 'invalid-signature' && !tamper) {
      // Edited after signing: the proof no longer covers the data.
      subject.landArea = '25 acres';
    }
    credentialValue = vc;
    credentialRaw = JSON.stringify(vc);
    proofType = 'Ed25519Signature2020';

    const presentedVc = structuredClone(vc);
    if (tamper === 'T-SIG-FLIP') presentedVc.proof.proofValue = flipMiddle(vc.proof.proofValue);
    if (tamper === 'T-CLAIM-EDIT')
      presentedVc.credentialSubject.fullName = `${FARMER.fullName} (edited)`;
    presentedRaw = JSON.stringify(presentedVc);
    vpToken = JSON.stringify({
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: holderDid,
      verifiableCredential: [presentedVc],
      proof: ldpProof(`${holderDid}#0`, 'authentication', now, {
        challenge: boundNonce,
        domain: VERIFIER_CLIENT_ID,
      }),
    });
  }
  // T-NONCE-REPLAY resubmit: the earlier run's vp_token goes out unchanged.
  if (replay?.variant === 'resubmit-vp') vpToken = replay.vpToken;

  let tamperEvidence: TamperEvidence | undefined;
  if (tamper === 'T-SIG-FLIP' || tamper === 'T-CLAIM-EDIT') {
    tamperEvidence = {
      target: 'credential',
      summary:
        tamper === 'T-SIG-FLIP'
          ? "Changed one character of the issuer's signature"
          : 'Changed one claim value after issuance',
      changes: describeTamper(credentialRaw, presentedRaw, format),
      before: credentialRaw,
      after: presentedRaw,
    };
  } else if (tamper === 'T-WRONG-TYPE') {
    tamperEvidence = {
      target: 'presentation',
      summary: 'Presented a credential that does not satisfy the request',
      changes: [
        {
          path: 'credential type',
          before: `${WRONG_CREDENTIAL_TYPE} (asked for)`,
          after: `${config.credentialType} (presented)`,
        },
      ],
    };
  } else if (replay?.variant === 'resubmit-vp') {
    tamperEvidence = {
      target: 'vp_token',
      summary: 'Resubmitted a vp_token captured in an earlier run to this new request',
      changes: [{ path: 'nonce', before: `${nonce} (asked for by this request)`, after: 'the earlier request’s nonce' }],
      after: vpToken,
    };
  } else if (replay?.variant === 'stale-nonce') {
    tamperEvidence = {
      target: 'vp_token',
      summary: "Signed a fresh presentation over an earlier run's nonce",
      changes: [{ path: 'nonce', before: nonce, after: replay.nonce }],
    };
  }

  const credentialResponse = { credential: credentialValue };

  // ---------- presentation ----------
  const requestId = `req_${randomToken(9)}`;
  const transactionId = `txn_${opts.runId.slice(0, 8)}`;
  const requestedType = tamper === 'T-WRONG-TYPE' ? WRONG_CREDENTIAL_TYPE : config.credentialType;
  const inputDescriptor = isSdJwt
    ? {
        id: 'farmer-sd-jwt',
        format: { 'vc+sd-jwt': { 'sd-jwt_alg_values': ['ES256'], 'kb-jwt_alg_values': ['ES256'] } },
        constraints: {
          limit_disclosure: 'required',
          fields: [
            { path: ['$.vct'], filter: { type: 'string', const: requestedType } },
            ...DISCLOSED_IN_VP.map((f) => ({ path: [`$.${f}`] })),
          ],
        },
      }
    : {
        id: 'farmer-ldp-vc',
        format: { ldp_vc: { proof_type: ['Ed25519Signature2020'] } },
        constraints: {
          fields: [
            {
              path: ['$.type'],
              filter: { type: 'array', contains: { const: requestedType } },
            },
          ],
        },
      };
  const presentationDefinition = {
    id: `pd-${config.id}`,
    purpose: 'Check the farmer credential for the interop playground run',
    input_descriptors: [inputDescriptor],
  };
  const responseUri = `${VERIFIER_URL}/v1/verify/vp-submission/direct-post`;
  const requestObject = {
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: VERIFIER_CLIENT_ID,
    client_id_scheme: 'did',
    response_uri: responseUri,
    nonce,
    state: requestId,
    presentation_definition: presentationDefinition,
    client_metadata: {
      client_name: 'Inji Verify (playground)',
      vp_formats: isSdJwt
        ? { 'vc+sd-jwt': { 'sd-jwt_alg_values': ['ES256'] } }
        : { ldp_vp: { proof_type: ['Ed25519Signature2020'] } },
    },
  };
  const createVpRequestBody = {
    clientId: VERIFIER_CLIENT_ID,
    transactionId,
    presentationDefinition,
  };
  const createVpRequestResponse = {
    transactionId,
    requestId,
    authorizationDetails: {
      responseType: 'vp_token',
      responseMode: 'direct_post',
      clientId: VERIFIER_CLIENT_ID,
      presentationDefinitionUri: `${VERIFIER_URL}/v1/verify/presentation-definitions/${presentationDefinition.id}`,
      responseUri,
      nonce,
      iat: epoch(now),
    },
    expiresAt: epoch(now) + 300,
  };
  const authorizationRequestUri = `openid4vp://authorize?${new URLSearchParams({
    client_id: VERIFIER_CLIENT_ID,
    request_uri: `${VERIFIER_URL}/v1/verify/vp-request/${requestId}`,
  }).toString()}`;

  const presentationSubmission = {
    id: crypto.randomUUID(),
    definition_id: presentationDefinition.id,
    descriptor_map: [
      { id: inputDescriptor.id, format: isSdJwt ? 'vc+sd-jwt' : 'ldp_vp', path: '$' },
    ],
  };
  const vpSubmissionBody = new URLSearchParams({
    vp_token: vpToken,
    presentation_submission: JSON.stringify(presentationSubmission),
    state: requestId,
  }).toString();

  // The simulated verifier rejects every tamper as Invalid; the real verifier's answer is what runs measure.
  const vcStatus =
    tamper || replay
      ? 'INVALID'
      : expired
        ? 'EXPIRED'
        : scenario === 'invalid-signature'
          ? 'INVALID'
          : 'SUCCESS';
  const vpResult = {
    transactionId,
    vpResultStatus: vcStatus === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
    vcResults: [
      {
        vc: presentedRaw,
        verificationStatus: vcStatus,
        ...(vcStatus === 'INVALID'
          ? {
              errorCode: 'ERR_SIGNATURE_VERIFICATION_FAILED',
              errorMessage: 'Proof does not match the credential data',
            }
          : vcStatus === 'EXPIRED'
            ? {
                errorCode: 'ERR_VC_EXPIRED',
                errorMessage: `Credential expired at ${iso(validUntil)}`,
              }
            : {}),
      },
    ],
  };

  return {
    preAuthorizedCode,
    offerId,
    offerUri,
    offer,
    issuerMetadata,
    tokenRequest,
    tokenResponse,
    accessToken,
    cNonce,
    credentialRequest,
    credentialResponse,
    credentialRaw,
    proofType,
    createVpRequestBody,
    createVpRequestResponse,
    requestId,
    transactionId,
    authorizationRequestUri,
    requestObject,
    presentationDefinition,
    vpToken,
    presentationSubmission,
    vpSubmissionBody,
    vpResult,
    ...(tamperEvidence ? { tamperEvidence } : {}),
  };
}
