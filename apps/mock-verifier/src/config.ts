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
  requestTtlMs: number;
}

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
    requestTtlMs: Number(env.REQUEST_TTL_MS ?? 300_000),
  };
}
