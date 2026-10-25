// Maps a captured exchange (component + method + path) to a ProtocolStep, and names the
// artifacts it carries (ArtifactExtractor, plan §8.2) so the inspector can label the five
// messages Task 5 asks for.
import { ProtocolStep, type ArtifactKind } from '@playground/shared';

interface Rule {
  methods: string[];
  pattern: RegExp;
  step: ProtocolStep;
}

// First match wins. Paths are the public paths (before the gateway rewrites them), so both
// `/.well-known/openid-credential-issuer` and `/v1/certify/.well-known/…` match.
const RULES: Rule[] = [
  // ── OpenID4VCI / Inji Certify ───────────────────────────────────────────
  {
    methods: ['GET'],
    pattern: /\/\.well-known\/openid-credential-issuer\b/,
    step: ProtocolStep.VCI_ISSUER_METADATA,
  },
  {
    methods: ['GET'],
    pattern: /\/\.well-known\/(oauth-authorization-server|openid-configuration)\b/,
    step: ProtocolStep.VCI_AS_METADATA,
  },
  { methods: ['GET'], pattern: /\/\.well-known\/jwks\.json$/, step: ProtocolStep.VCI_AS_METADATA },
  { methods: ['POST'], pattern: /\/pre-authorized-data$/, step: ProtocolStep.VCI_CREDENTIAL_OFFER },
  {
    methods: ['GET'],
    pattern: /\/credential-offer(-data)?(\/|$)/,
    step: ProtocolStep.VCI_CREDENTIAL_OFFER,
  },
  {
    methods: ['GET', 'POST'],
    pattern: /\/(authorize|oauth\/iar)$/,
    step: ProtocolStep.VCI_AUTHORIZE,
  },
  {
    methods: ['POST'],
    pattern: /\/(oauth\/token|oauth2\/token|token)$/,
    step: ProtocolStep.VCI_TOKEN,
  },
  { methods: ['POST'], pattern: /\/nonce$/, step: ProtocolStep.VCI_NONCE },
  {
    methods: ['POST'],
    pattern: /\/issuance\/(vd1[12]\/)?credential$|\/credential$/,
    step: ProtocolStep.VCI_CREDENTIAL,
  },

  // ── OpenID4VP / mock verifier (apps/mock-verifier, under /mock-verifier) ─
  {
    methods: ['GET'],
    pattern: /\/mock-verifier\/api\/requests\/[^/]+\/status$/,
    step: ProtocolStep.VERIFY_STATUS,
  },
  {
    methods: ['POST'],
    pattern: /\/mock-verifier\/api\/requests$/,
    step: ProtocolStep.VERIFY_CREATE_REQUEST,
  },
  {
    methods: ['GET'],
    pattern: /\/mock-verifier\/api\/results\/[^/]+$/,
    step: ProtocolStep.VERIFY_RESULT,
  },
  {
    methods: ['POST'],
    pattern: /\/mock-verifier\/api\/verify-credential$/,
    step: ProtocolStep.VC_DIRECT_VERIFY,
  },
  {
    methods: ['GET', 'POST'],
    pattern: /\/mock-verifier\/oid4vp\/request\/[^/]+$/,
    step: ProtocolStep.VP_REQUEST_OBJECT,
  },
  {
    methods: ['POST'],
    pattern: /\/mock-verifier\/oid4vp\/response\/[^/]+$|\/mock-verifier\/api\/dc-api\/[^/]+$/,
    step: ProtocolStep.VP_RESPONSE,
  },

  // ── OpenID4VP / Inji Verify ─────────────────────────────────────────────
  { methods: ['GET'], pattern: /\/vp-request\/[^/]+\/status$/, step: ProtocolStep.VERIFY_STATUS },
  { methods: ['GET'], pattern: /\/vp-request\/[^/]+$/, step: ProtocolStep.VP_REQUEST_OBJECT },
  {
    methods: ['POST'],
    pattern: /\/(vp-request|vp-session-request)$/,
    step: ProtocolStep.VERIFY_CREATE_REQUEST,
  },
  { methods: ['GET'], pattern: /\/vp-definition\//, step: ProtocolStep.VP_REQUEST_OBJECT },
  {
    methods: ['POST'],
    pattern: /\/vp-submission\/direct-post$|\/direct[-_]post$/,
    step: ProtocolStep.VP_RESPONSE,
  },
  {
    methods: ['GET', 'POST'],
    pattern: /\/(v2\/)?vp-results?\/|\/vp-session-results$/,
    step: ProtocolStep.VERIFY_RESULT,
  },
  {
    methods: ['POST'],
    pattern: /\/(v2\/)?vc-(verification|submission)$/,
    step: ProtocolStep.VC_DIRECT_VERIFY,
  },

  // ── DIDs and status lists ───────────────────────────────────────────────
  { methods: ['GET'], pattern: /\/did\.json$/, step: ProtocolStep.DID_RESOLUTION },
  { methods: ['GET'], pattern: /\/status-list\//, step: ProtocolStep.STATUS_LIST_FETCH },
  { methods: ['GET', 'POST'], pattern: /^\/v1\/mimoto\//, step: ProtocolStep.WALLET_BACKEND },
];

export function classifyStep(method: string, url: string): ProtocolStep {
  const m = method.toUpperCase();
  let path: string;
  try {
    path = new URL(url, 'http://tap').pathname;
  } catch {
    return ProtocolStep.UNKNOWN;
  }
  return (
    RULES.find((r) => r.methods.includes(m) && r.pattern.test(path))?.step ?? ProtocolStep.UNKNOWN
  );
}

/** Artifacts a successful exchange carries (plan §8.2 ArtifactExtractor). */
export function artifactKindsFor(
  step: ProtocolStep,
  status: number | undefined,
  requestBody: string | undefined,
  responseBody: string | undefined,
): ArtifactKind[] | undefined {
  const ok = status !== undefined && status >= 200 && status < 300;
  switch (step) {
    case ProtocolStep.VCI_CREDENTIAL_OFFER:
      return ok && responseBody?.includes('credential_issuer') ? ['offer'] : undefined;
    case ProtocolStep.VCI_CREDENTIAL:
      return ok ? ['credential'] : undefined;
    case ProtocolStep.VERIFY_CREATE_REQUEST:
      return requestBody?.includes('presentationDefinition')
        ? ['presentation_definition']
        : undefined;
    case ProtocolStep.VP_REQUEST_OBJECT:
      return ok ? ['auth_request', 'presentation_definition'] : undefined;
    case ProtocolStep.VP_RESPONSE:
      return requestBody?.includes('vp_token')
        ? ['vp_token', 'presentation_submission']
        : undefined;
    case ProtocolStep.VERIFY_RESULT:
      return ok ? ['verification_result'] : undefined;
    default:
      return undefined;
  }
}
