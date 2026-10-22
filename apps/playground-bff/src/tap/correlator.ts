// Correlator (plan §4.4): links captured exchanges to the run that produced them.
//
//   Seeding     the BFF registers what it knows when it creates an offer or a VP request
//               (offer id, Verify requestId and transactionId), and tags its own calls with the
//               run id header, so they correlate exactly.
//   Transitive  when an exchange matches a run, every key it carries is linked to that run:
//               the offer response introduces the pre-authorized code, the token request carries
//               it and its response introduces the access token, and the credential request then
//               correlates through its `Authorization: Bearer` header.
//   Armed window  flows that start outside the playground (Inji Web) carry no seeded key; the first
//               uncorrelated issuance exchange from the armed component is bound to the armed run
//               and the run is marked `correlation: heuristic`.
//
// Secret values (codes, tokens) are stored only as SHA-256 prefixes, so the index and the
// `correlationKeys` the API returns never contain a usable secret.
import { createHash } from 'node:crypto';
import { ProtocolStep } from '@playground/shared';
import { backfillRunId } from '../store/exchange-store.ts';

const keyToRun = new Map<string, string>();

const SECRET_KEYS = new Set([
  'pre-authorized_code',
  'code',
  'access_token',
  'refresh_token',
  'tx_code',
]);
const ID_FIELDS = [
  'state',
  'nonce',
  'c_nonce',
  'requestId',
  'transactionId',
  'request_id',
  'transaction_id',
  'issuer_state',
];

export const hashKey = (value: string) =>
  `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;

/** Normalises a key for the index: secrets are hashed, ids kept as they are. */
const keyFor = (name: string, value: string) =>
  SECRET_KEYS.has(name) ? hashKey(value) : value.trim();

export function register(runId: string, ...keys: string[]): void {
  const fresh = keys.map((k) => k.trim()).filter((k) => k && keyToRun.get(k) !== runId);
  for (const key of fresh) keyToRun.set(key, runId);
  if (fresh.length > 0) backfillRunId(runId, fresh);
}

/** Seeds a secret value the BFF learnt (e.g. a pre-authorized code), stored hashed. */
export const registerSecret = (runId: string, name: string, value: string) =>
  register(runId, keyFor(name, value));

export function resolve(keys: string[]): string | undefined {
  for (const key of keys) {
    const runId = keyToRun.get(key);
    if (runId) return runId;
  }
  return undefined;
}

// ── Armed window ──────────────────────────────────────────────────────────

interface ArmedRun {
  runId: string;
  component: string;
  until: number;
}
const armed: ArmedRun[] = [];
const ARMABLE_STEPS: ProtocolStep[] = [
  ProtocolStep.VCI_AUTHORIZE,
  ProtocolStep.VCI_TOKEN,
  ProtocolStep.VCI_CREDENTIAL,
  ProtocolStep.VCI_CREDENTIAL_OFFER,
];

/** One armed run per component at a time (the plan's WalletLock): arming again replaces it. */
export function arm(runId: string, component: string, windowMs: number): void {
  disarm(runId);
  const i = armed.findIndex((a) => a.component === component);
  if (i !== -1) armed.splice(i, 1);
  armed.push({ runId, component, until: Date.now() + windowMs });
}

export function disarm(runId: string): void {
  for (let i = armed.length - 1; i >= 0; i--) if (armed[i]!.runId === runId) armed.splice(i, 1);
}

/** The armed run for an uncorrelated exchange, if any. */
export function tryBindArmed(component: string, step: ProtocolStep): string | undefined {
  if (!ARMABLE_STEPS.includes(step)) return undefined;
  const a = armed.find((x) => x.component === component && x.until > Date.now());
  return a?.runId;
}

// ── Key extraction ────────────────────────────────────────────────────────

function fromParams(params: URLSearchParams, names: string[], keys: string[]) {
  for (const name of names) {
    const v = params.get(name);
    if (v) keys.push(keyFor(name, v));
  }
}

/** Ids in well-known path positions: offer ids, Verify request and transaction ids. */
function fromPath(path: string, keys: string[]) {
  const patterns = [
    /\/credential-offer-data\/([^/?#]+)/,
    /\/vp-request\/([^/?#]+)/,
    /\/vp-results?\/([^/?#]+)/,
  ];
  for (const p of patterns) {
    const m = path.match(p);
    if (m?.[1]) keys.push(decodeURIComponent(m[1]));
  }
  for (const segment of path.split('/'))
    if (/^(req|txn)_[\w-]{6,}$/.test(segment)) keys.push(segment);
}

/** Walks a JSON document for secret and id fields, and for URIs whose last path segment is an id. */
function fromJson(value: unknown, keys: string[], depth = 0) {
  if (depth > 6 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) fromJson(v, keys, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') {
      if (SECRET_KEYS.has(k) || ID_FIELDS.includes(k)) keys.push(keyFor(k, v));
      else if (/^(credential_offer_uri|requestUri|request_uri)$/.test(k)) {
        const inner = v.startsWith('openid-credential-offer:')
          ? (new URL(v).searchParams.get('credential_offer_uri') ?? v)
          : v;
        fromPath(inner, keys);
      }
    } else fromJson(v, keys, depth + 1);
  }
}

function decodeJwtPayload(token: string): unknown {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function fromBody(body: string | undefined, contentType: string | undefined, keys: string[]) {
  if (!body) return;
  const trimmed = body.trim();
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    fromParams(
      new URLSearchParams(trimmed),
      ['pre-authorized_code', 'code', 'refresh_token', 'state', 'issuer_state'],
      keys,
    );
    return;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      fromJson(JSON.parse(trimmed), keys);
    } catch {
      /* not JSON */
    }
    return;
  }
  // A signed request object (Inji Verify's request_uri response) carries state and nonce.
  fromJson(decodeJwtPayload(trimmed), keys);
}

export interface KeySource {
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  requestContentType?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseContentType?: string;
}

/** Every correlation key in a request/response pair, from the URL, headers and both bodies. */
export function extractKeys(src: KeySource): string[] {
  const keys: string[] = [];
  try {
    const u = new URL(src.url, 'http://tap');
    fromPath(u.pathname, keys);
    fromParams(
      u.searchParams,
      ['pre-authorized_code', 'code', 'state', 'nonce', 'issuer_state'],
      keys,
    );
  } catch {
    /* malformed URL */
  }
  const auth = src.requestHeaders['authorization'];
  const bearer = auth?.match(/^(?:Bearer|DPoP)\s+(.+)$/i)?.[1];
  if (bearer) keys.push(keyFor('access_token', bearer.trim()));

  fromBody(src.requestBody, src.requestContentType, keys);
  fromBody(src.responseBody, src.responseContentType, keys);

  // A redirect from an authorization server carries the code and state in its Location.
  const location = src.responseHeaders?.['location'];
  if (location) {
    try {
      fromParams(new URL(location, 'http://tap').searchParams, ['code', 'state'], keys);
    } catch {
      /* ignore */
    }
  }
  return [...new Set(keys.filter(Boolean))];
}

/** For tests: wipe all registered keys and armed runs. */
export function clearCorrelator(): void {
  keyToRun.clear();
  armed.length = 0;
}
