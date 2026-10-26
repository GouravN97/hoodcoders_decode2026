// Differential verification (plan §12, check VER-002): after a run's verifier answers, the other
// verifier checks the same presented credential on its own. A credential-only check sees the
// issuer signature, disclosures and validity, never the presentation around it, so the two
// verdicts are only compared when the run's verdict rests on the credential.
import type { SecondOpinion, VerificationOutcome, VerificationStage } from './domain';
import { outcomeLabel } from './labels';
import { firstPresentation } from './vpToken';

/** Tampers that break the presentation, not the credential. */
const PRESENTATION_TAMPERS = ['T-WRONG-TYPE', 'T-NONCE-REPLAY'];

/** Mock verifier stages that judge the presentation rather than the credential. */
const PRESENTATION_STAGES = ['response-shape', 'state', 'submission', 'requested-credential', 'holder-binding'];

/** Whether a credential-only verdict can be held against the run's verdict. */
export function secondOpinionComparable(
  primary: { outcome: VerificationOutcome; stages?: VerificationStage[] },
  tamperId?: string,
): boolean {
  if (primary.outcome === 'REJECTED' || primary.outcome === 'ERROR') return false;
  if (tamperId && PRESENTATION_TAMPERS.includes(tamperId)) return false;
  return !primary.stages?.some((s) => s.status === 'fail' && PRESENTATION_STAGES.includes(s.id));
}

/** The VER-002 finding for a second opinion: INFO when the verifiers agree, WARN when they do not. */
export function secondOpinionFinding(
  opinion: SecondOpinion,
  primary: { name: string; outcome: VerificationOutcome },
): { severity: 'INFO' | 'WARN'; message: string } {
  const other = opinion.displayName ?? opinion.verifierId;
  const theirs = `${other} says ${outcomeLabel(opinion.outcome)}${opinion.reason ? ` (${opinion.reason})` : ''}`;
  if (!opinion.comparable)
    return {
      severity: 'INFO',
      message: `Second opinion on the presented credential alone: ${theirs}. Not compared with ${primary.name}'s ${outcomeLabel(primary.outcome)}: this run is judged on presentation checks (requested type, holder binding, nonce) that a credential-only check does not make`,
    };
  return opinion.agrees
    ? { severity: 'INFO', message: `Second opinion agrees: ${primary.name} and ${other} both say ${outcomeLabel(primary.outcome)}` }
    : {
        severity: 'WARN',
        message: `Verifiers disagree on the same credential: ${primary.name} says ${outcomeLabel(primary.outcome)}, ${theirs}`,
      };
}

/**
 * A `vp_token` form value as the presentation itself. OpenID4VP draft 23 calls it a "JSON String";
 * Inji Wallet sends that literally, quoted (`"eyJ…~…~"`), where most wallets send the bare value.
 */
export function unwrapVpToken(raw: string): { token: string; jsonEncoded: boolean } {
  const t = raw.trim();
  if (t.startsWith('"')) {
    try {
      const inner: unknown = JSON.parse(t);
      if (typeof inner === 'string') return { token: inner, jsonEncoded: true };
    } catch {
      /* not JSON: leave it */
    }
  }
  return { token: t, jsonEncoded: false };
}

/** The credential inside a vp_token, as a verifier would check it on its own. */
export function credentialFromVpToken(vpToken: string): string | undefined {
  const token = firstPresentation(unwrapVpToken(vpToken).token);
  if (!token.startsWith('{') && !token.startsWith('[')) {
    // SD-JWT: drop the key-binding JWT, keep the issuer JWT and disclosures.
    return token.includes('~') ? token.replace(/~[^~]*$/, '~') : undefined;
  }
  try {
    const vp = JSON.parse(token) as { verifiableCredential?: unknown } | unknown[];
    const first = Array.isArray(vp) ? vp[0] : vp;
    const vcs = (first as { verifiableCredential?: unknown }).verifiableCredential;
    const vc = Array.isArray(vcs) ? vcs[0] : vcs;
    if (vc === undefined || vc === null) return undefined;
    return typeof vc === 'string' ? vc : JSON.stringify(vc);
  } catch {
    return undefined;
  }
}
