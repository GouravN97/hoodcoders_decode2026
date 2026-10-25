// Replay & tamper catalogue (plan §13): negative tests that break a presentation on purpose, so a
// run can show whether the verifier rejects it. A tamper is applied by a mechanism: a hook in the
// headless mock wallet, or an issuer profile that signs a genuinely expired credential.
import { z } from 'zod';
import type { CatalogEntry } from './catalog';
import type { RunDetail } from './run';
import {
  TamperMechanismSchema,
  VerificationOutcomeSchema,
  type CredentialFormat,
  type RunConfig,
  type TamperMechanism,
  type VerificationOutcome,
} from './domain';

export const TamperIdSchema = z.enum([
  'T-SIG-FLIP',
  'T-CLAIM-EDIT',
  'T-WRONG-TYPE',
  'T-NONCE-REPLAY',
  'T-EXPIRED',
]);
export type TamperId = z.infer<typeof TamperIdSchema>;

/**
 * T-NONCE-REPLAY: `resubmit-vp` posts a vp_token captured in an earlier run to the new request
 * unchanged; `stale-nonce` builds a fresh presentation but signs it over an earlier run's nonce.
 */
export const ReplayVariantSchema = z.enum(['resubmit-vp', 'stale-nonce']);
export type ReplayVariant = z.infer<typeof ReplayVariantSchema>;

/** `TamperSpec.params` of a T-NONCE-REPLAY run. Without `sourceRunId` the newest eligible run is used. */
export const ReplayParamsSchema = z.object({
  variant: ReplayVariantSchema.default('resubmit-vp'),
  sourceRunId: z.string().min(1).optional(),
});
export type ReplayParams = z.infer<typeof ReplayParamsSchema>;

/** What the wallet replays, resolved from the earlier run (sent to the mock wallet as `replay`). */
export const ReplayInputSchema = z.discriminatedUnion('variant', [
  z.object({
    variant: z.literal('resubmit-vp'),
    vpToken: z.string().min(1),
    presentationSubmission: z.string().optional(),
  }),
  z.object({ variant: z.literal('stale-nonce'), nonce: z.string().min(1) }),
]);
export type ReplayInput = z.infer<typeof ReplayInputSchema>;

export interface TamperDefinition {
  id: TamperId;
  label: string;
  /** One sentence for the picker: what is broken and how. */
  description: string;
  mechanism: TamperMechanism;
  /** What a verifier should answer. Picking the tamper sets the run's expected result to this. */
  expectedOutcome: VerificationOutcome;
  formats: readonly CredentialFormat[];
}

const WALLET_HOOK_FORMATS: readonly CredentialFormat[] = ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt'];

export const TAMPER_CATALOGUE: readonly TamperDefinition[] = [
  {
    id: 'T-SIG-FLIP',
    label: 'Broken signature',
    description: "The wallet flips one character of the issuer's signature before presenting.",
    mechanism: 'wallet-hook',
    expectedOutcome: 'INVALID',
    formats: WALLET_HOOK_FORMATS,
  },
  {
    id: 'T-CLAIM-EDIT',
    label: 'Edited claim',
    description:
      'The wallet changes one claim value after issuance (a disclosure for SD-JWT), so the signature no longer covers the data.',
    mechanism: 'wallet-hook',
    expectedOutcome: 'INVALID',
    formats: WALLET_HOOK_FORMATS,
  },
  {
    id: 'T-WRONG-TYPE',
    label: 'Wrong credential type',
    description:
      'The verifier asks for a credential type the wallet does not hold, and the wallet presents its credential anyway.',
    mechanism: 'wallet-hook',
    expectedOutcome: 'INVALID',
    formats: WALLET_HOOK_FORMATS,
  },
  {
    id: 'T-NONCE-REPLAY',
    label: 'Replayed presentation',
    description:
      "The wallet answers with a vp_token from an earlier run, or signs a new one over an earlier run's nonce.",
    mechanism: 'wallet-hook',
    expectedOutcome: 'INVALID',
    formats: WALLET_HOOK_FORMATS,
  },
  {
    id: 'T-EXPIRED',
    label: 'Expired credential',
    description:
      'The issuer signs a genuine credential whose validity ended in the past (an expired copy of the credential configuration).',
    mechanism: 'issuance-profile',
    expectedOutcome: 'EXPIRED',
    formats: ['ldp_vc', 'vc+sd-jwt', 'dc+sd-jwt', 'mso_mdoc'],
  },
];

export const tamperDefinition = (id: string | undefined): TamperDefinition | undefined =>
  TAMPER_CATALOGUE.find((t) => t.id === id);

type CapabilityHolder = Pick<CatalogEntry, 'capabilities'>;

/**
 * The expired copy of a credential configuration (T-EXPIRED), from the issuer's catalog entry.
 * A configuration that already is an expired copy maps to itself.
 */
export function expiredVariantFor(
  issuer: CapabilityHolder | undefined,
  credentialConfigurationId: string | undefined,
): string | undefined {
  const variants = issuer?.capabilities.expiredVariants;
  if (!variants || !credentialConfigurationId) return undefined;
  if (Object.values(variants).includes(credentialConfigurationId)) return credentialConfigurationId;
  return variants[credentialConfigurationId];
}

/** Tampers the run settings can offer for this wallet, issuer and credential. */
export function applicableTampers(opts: {
  format: CredentialFormat | undefined;
  wallet: CapabilityHolder | undefined;
  issuer: CapabilityHolder | undefined;
  credentialConfigurationId: string | undefined;
}): TamperDefinition[] {
  const { format, wallet, issuer, credentialConfigurationId } = opts;
  if (!format || !wallet?.capabilities.supportsTamper) return [];
  return TAMPER_CATALOGUE.filter((t) => {
    if (!t.formats.includes(format)) return false;
    if (t.mechanism === 'issuance-profile')
      return expiredVariantFor(issuer, credentialConfigurationId) !== undefined;
    return true;
  });
}

/**
 * T-NONCE-REPLAY: a finished run whose vp_token can be replayed against this run's verifier: an
 * untampered presentation of the same format that this verifier accepted as Valid. Replaying a
 * token that was already broken would not test replay protection.
 */
export function canReplayFrom(
  run: Pick<RunDetail, 'finishedAt' | 'config' | 'artifacts' | 'tamper' | 'observedOutcome'>,
  config: Pick<RunConfig, 'verifierId' | 'format'>,
): boolean {
  return (
    Boolean(run.finishedAt) &&
    !run.tamper &&
    run.observedOutcome === 'VALID' &&
    run.config.verifierId === config.verifierId &&
    run.config.format === config.format &&
    run.artifacts.some((a) => a.kind === 'vp_token')
  );
}

// ---------- evidence ----------

export const TamperChangeSchema = z.object({
  /** Where the change is, e.g. `credentialSubject.fullName` or `issuer JWT signature`. */
  path: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
});
export type TamperChange = z.infer<typeof TamperChangeSchema>;

/** What a tamper actually changed, reported by the mechanism that applied it. */
export const TamperEvidenceSchema = z.object({
  target: z.enum(['credential', 'vp_token', 'presentation']),
  summary: z.string(),
  changes: z.array(TamperChangeSchema),
  before: z.string().optional(),
  after: z.string().optional(),
});
export type TamperEvidence = z.infer<typeof TamperEvidenceSchema>;

/** The tamper a run applied, as the orchestrator recorded it. */
export const AppliedTamperSchema = z.object({
  id: z.string(),
  label: z.string(),
  mechanism: TamperMechanismSchema,
  expectedOutcome: VerificationOutcomeSchema,
  summary: z.string().optional(),
  /** The exchange that carried the tampered payload. */
  exchangeId: z.string().optional(),
  /** T-NONCE-REPLAY: the earlier run whose vp_token or nonce was reused. */
  sourceRunId: z.string().optional(),
  /** True when nobody picked a tamper: the run expected Invalid and the wallet broke the signature. */
  defaulted: z.boolean().optional(),
});
export type AppliedTamper = z.infer<typeof AppliedTamperSchema>;

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function base64urlText(s: string): string | undefined {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

/** `[salt, name, value]` → `name = value`; array-element disclosures show their value only. */
function disclosureLabel(encoded: string): { name: string; value: string } | undefined {
  const text = base64urlText(encoded);
  if (!text) return undefined;
  try {
    const arr = JSON.parse(text) as unknown[];
    if (!Array.isArray(arr)) return undefined;
    const value = arr.at(-1);
    return {
      name: arr.length === 3 ? String(arr[1]) : '[array item]',
      value: typeof value === 'string' ? value : JSON.stringify(value),
    };
  } catch {
    return undefined;
  }
}

function jsonChanges(before: unknown, after: unknown, path: string, out: TamperChange[]): void {
  if (out.length >= 20) return;
  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);
  if (isObj(before) && isObj(after)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)]))
      jsonChanges(before[k], after[k], path ? `${path}.${k}` : k, out);
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) jsonChanges(before[i], after[i], `${path}[${i}]`, out);
    return;
  }
  const a = before === undefined ? undefined : JSON.stringify(before);
  const b = after === undefined ? undefined : JSON.stringify(after);
  if (a !== b)
    out.push({
      path,
      ...(a !== undefined ? { before: clip(a) } : {}),
      ...(b !== undefined ? { after: clip(b) } : {}),
    });
}

/**
 * Field-level differences between a credential before and after tampering: the issuer JWT parts
 * and disclosures of an SD-JWT, or the JSON paths of a JSON-LD credential.
 */
export function describeTamper(
  before: string,
  after: string,
  format: CredentialFormat,
): TamperChange[] {
  if (format === 'vc+sd-jwt' || format === 'dc+sd-jwt') {
    const [jwtA = '', ...discA] = before.split('~');
    const [jwtB = '', ...discB] = after.split('~');
    const changes: TamperChange[] = [];
    const partNames = ['issuer JWT header', 'issuer JWT payload', 'issuer JWT signature'];
    const pa = jwtA.split('.');
    const pb = jwtB.split('.');
    partNames.forEach((name, i) => {
      if (pa[i] !== pb[i]) changes.push({ path: name, before: clip(pa[i] ?? ''), after: clip(pb[i] ?? '') });
    });
    const n = Math.max(discA.length, discB.length);
    for (let i = 0; i < n; i++) {
      const a = discA[i] ?? '';
      const b = discB[i] ?? '';
      if (a === b) continue;
      const la = disclosureLabel(a);
      const lb = disclosureLabel(b);
      changes.push({
        path: `disclosure ${lb?.name ?? la?.name ?? `#${i + 1}`}`,
        ...(la ? { before: clip(la.value) } : a ? { before: clip(a) } : {}),
        ...(lb ? { after: clip(lb.value) } : b ? { after: clip(b) } : {}),
      });
    }
    return changes;
  }
  try {
    const changes: TamperChange[] = [];
    jsonChanges(JSON.parse(before), JSON.parse(after), '', changes);
    return changes;
  } catch {
    return before === after ? [] : [{ path: 'payload', before: clip(before), after: clip(after) }];
  }
}

/** The `diff` text stored on a tampered exchange: the summary, then one line per change. */
export function tamperDiffText(evidence: Pick<TamperEvidence, 'summary' | 'changes'>): string {
  return [
    evidence.summary,
    ...evidence.changes.map(
      (c) => `${c.path}: ${c.before ?? '(none)'} → ${c.after ?? '(removed)'}`,
    ),
  ].join('\n');
}

/**
 * The nonce a presentation is bound to: the key-binding JWT's `nonce` for SD-JWT, the proof
 * `challenge` for a JSON-LD presentation.
 */
export function nonceOfVpToken(vpToken: string): string | undefined {
  const token = vpToken.trim();
  if (token.startsWith('{')) {
    try {
      const vp = JSON.parse(token) as { proof?: { challenge?: unknown } | Array<{ challenge?: unknown }> };
      const proof = Array.isArray(vp.proof) ? vp.proof[0] : vp.proof;
      return typeof proof?.challenge === 'string' ? proof.challenge : undefined;
    } catch {
      return undefined;
    }
  }
  const kb = token.split('~').at(-1);
  const payload = kb?.split('.')[1];
  if (!payload) return undefined;
  try {
    const nonce = (JSON.parse(base64urlText(payload) ?? '') as { nonce?: unknown }).nonce;
    return typeof nonce === 'string' ? nonce : undefined;
  } catch {
    return undefined;
  }
}
