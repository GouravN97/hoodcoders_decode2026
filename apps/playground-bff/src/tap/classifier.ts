// Maps URL path patterns to ProtocolStep constants from @playground/shared.
// The proxy calls classifyStep(method, path) for every captured exchange.

export const ProtocolStep = {
  VCI_ISSUER_METADATA: 'oid4vci.issuer_metadata',
  VCI_AS_METADATA: 'oid4vci.as_metadata',
  VCI_CREDENTIAL_OFFER: 'oid4vci.credential_offer',
  VCI_AUTHORIZE: 'oid4vci.authorize',
  VCI_TOKEN: 'oid4vci.token',
  VCI_NONCE: 'oid4vci.nonce',
  VCI_CREDENTIAL: 'oid4vci.credential',
  VP_AUTH_REQUEST: 'oid4vp.authorization_request',
  VP_REQUEST_OBJECT: 'oid4vp.request_object',
  VP_RESPONSE: 'oid4vp.response',
  VERIFY_CREATE_REQUEST: 'verify.create_request',
  VERIFY_STATUS: 'verify.status_poll',
  VERIFY_RESULT: 'verify.result',
  DID_RESOLUTION: 'did.resolution',
  UNKNOWN: 'unknown',
} as const;

export type ProtocolStep = (typeof ProtocolStep)[keyof typeof ProtocolStep];

interface Rule {
  methods: string[]; // HTTP methods to match, or ['*'] for any
  pattern: RegExp;
  step: ProtocolStep;
}

// Rules are tested in order; first match wins.
const RULES: Rule[] = [
  // ── OpenID4VCI ──────────────────────────────────────────────────────────
  {
    methods: ['GET'],
    pattern: /\/\.well-known\/openid-credential-issuer/i,
    step: ProtocolStep.VCI_ISSUER_METADATA,
  },
  {
    methods: ['GET'],
    pattern: /\/\.well-known\/(oauth-authorization-server|openid-configuration)/i,
    step: ProtocolStep.VCI_AS_METADATA,
  },
  {
    methods: ['GET'],
    pattern: /\/credential-offer/i,
    step: ProtocolStep.VCI_CREDENTIAL_OFFER,
  },
  {
    methods: ['GET', 'POST'],
    pattern: /\/authorize/i,
    step: ProtocolStep.VCI_AUTHORIZE,
  },
  {
    methods: ['POST'],
    pattern: /\/token/i,
    step: ProtocolStep.VCI_TOKEN,
  },
  {
    methods: ['POST'],
    pattern: /\/nonce/i,
    step: ProtocolStep.VCI_NONCE,
  },
  {
    methods: ['POST'],
    pattern: /\/credential/i,
    step: ProtocolStep.VCI_CREDENTIAL,
  },

  // ── OpenID4VP / Inji Verify ──────────────────────────────────────────────
  {
    methods: ['POST'],
    pattern: /\/(vp-request|presentation-request|create-request)/i,
    step: ProtocolStep.VERIFY_CREATE_REQUEST,
  },
  {
    methods: ['GET'],
    pattern: /\/(request\.jwt|request-object)/i,
    step: ProtocolStep.VP_REQUEST_OBJECT,
  },
  {
    methods: ['POST'],
    pattern: /\/(response|vp-response)/i,
    step: ProtocolStep.VP_RESPONSE,
  },
  {
    methods: ['GET'],
    pattern: /\/(status|result)\b/i,
    step: ProtocolStep.VERIFY_STATUS,
  },

  // ── DID / well-known ──────────────────────────────────────────────────────
  {
    methods: ['*'],
    pattern: /\/(did\.json|\.well-known\/did\.json)/i,
    step: ProtocolStep.DID_RESOLUTION,
  },
];

/**
 * Returns the ProtocolStep for a given HTTP method + URL path.
 * Falls back to UNKNOWN if no rule matches.
 */
export function classifyStep(method: string, urlPath: string): ProtocolStep {
  const m = method.toUpperCase();
  for (const rule of RULES) {
    const methodOk = rule.methods.includes('*') || rule.methods.includes(m);
    if (methodOk && rule.pattern.test(urlPath)) {
      return rule.step;
    }
  }
  return ProtocolStep.UNKNOWN;
}
