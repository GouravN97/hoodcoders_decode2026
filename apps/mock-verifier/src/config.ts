// Settings from the environment. PUBLIC_URL is where wallets reach the verifier (in Compose, a path
// on Inji Verify's public host, through the gateway and the Protocol Tap); CLIENT_ID is its did:web.
export interface VerifierConfig {
  port: number;
  /** Path the verifier serves under, e.g. /mock-verifier. */
  basePath: string;
  /** Public base URL including basePath, e.g. https://verify.localhost:8443/mock-verifier. */
  publicUrl: string;
  /** did:web that resolves to `${publicUrl}/did.json`. */
  clientId: string;
  trustedIssuers: string[];
  /** PEM files with mDoc issuer certificates to trust; read at each verification, missing files skipped. */
  trustedMdocCertFiles: string[];
  requestTtlMs: number;
}

/**
 * The client_id an OpenID4VP 1.0 request uses: a DID gets the `decentralized_identifier:` prefix
 * (1.0 §5.9.3). Draft 23 requests keep the bare DID. The key-binding JWT's `aud` and the mDoc
 * session transcript use this full value, prefix included.
 */
export const oid4vp1ClientId = (clientId: string) =>
  clientId.startsWith('did:') ? `decentralized_identifier:${clientId}` : clientId;

/** did:web for a public URL: host (port percent-encoded) then the path segments. */
export function didWebFor(publicUrl: string): string {
  const u = new URL(publicUrl);
  const host = u.port ? `${u.hostname}%3A${u.port}` : u.hostname;
  return ['did:web', host, ...u.pathname.split('/').filter(Boolean)].join(':');
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): VerifierConfig {
  const port = Number(env.PORT ?? 7004);
  const basePath = (env.BASE_PATH ?? '/mock-verifier').replace(/\/$/, '');
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${port}${basePath}`).replace(/\/$/, '');
  return {
    port,
    basePath,
    publicUrl,
    clientId: env.CLIENT_ID || didWebFor(publicUrl),
    trustedIssuers: (env.TRUSTED_ISSUERS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    trustedMdocCertFiles: (env.TRUSTED_MDOC_CERTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    requestTtlMs: Number(env.REQUEST_TTL_MS ?? 300_000),
  };
}
