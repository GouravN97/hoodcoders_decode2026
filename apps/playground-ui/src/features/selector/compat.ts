// Pure selection rules for the selector screen (unit-tested).
import {
  MANDATORY_FORMATS,
  type CatalogEntry,
  type CredentialConfigurationSummary,
  type CredentialFormat,
  type PresentationFlow,
  type RunConfig,
  type RunMode,
} from '@playground/shared';
import type { SelectionState } from '../../store/selection';

/**
 * The implementations whose formats constrain a run in this mode. An issue-only run never meets
 * the verifier; a present-only run still needs the issuer, whose metadata names the credential.
 */
export function constrainingRoles(
  mode: RunMode,
  issuer: CatalogEntry | undefined,
  wallet: CatalogEntry | undefined,
  verifier: CatalogEntry | undefined,
): Array<CatalogEntry | undefined> {
  return mode === 'issue-only' ? [issuer, wallet] : [issuer, wallet, verifier];
}

/** Formats every selected implementation supports, limited to the formats the playground runs. */
export function commonFormats(selected: Array<CatalogEntry | undefined>): CredentialFormat[] {
  const chosen = selected.filter((e): e is CatalogEntry => Boolean(e));
  return MANDATORY_FORMATS.filter((f) => chosen.every((e) => e.capabilities.formats.includes(f)));
}

/** Why a card cannot be picked given the other roles' selections, or undefined if it can. */
export function disabledReason(entry: CatalogEntry, others: Array<CatalogEntry | undefined>): string | undefined {
  if (entry.health === 'down') return `${entry.displayName} is not responding`;
  if (!MANDATORY_FORMATS.some((f) => entry.capabilities.formats.includes(f))) {
    return 'Supports none of the formats the playground runs (JSON-LD VC, SD-JWT VC)';
  }
  const chosen = others.filter((e): e is CatalogEntry => Boolean(e));
  if (chosen.length > 0 && commonFormats([entry, ...chosen]).length === 0) {
    return `Shares no credential format with ${chosen.map((c) => c.displayName).join(' and ')}`;
  }
  return undefined;
}

export function supportedFlows(wallet: CatalogEntry | undefined, verifier: CatalogEntry | undefined): PresentationFlow[] {
  const all: PresentationFlow[] = ['cross-device-qr', 'same-device-deeplink'];
  return all.filter((f) =>
    [wallet, verifier].every((e) => !e?.capabilities.presentationFlows || e.capabilities.presentationFlows.includes(f)),
  );
}

/** The RunConfig the BFF receives, or null while the selection is incomplete. */
export function buildRunConfig(
  s: Pick<SelectionState, 'format' | 'credentialConfigurationId' | 'presentationFlow' | 'expectedOutcome'> &
    Partial<Pick<SelectionState, 'mode' | 'heldCredentialId'>>,
  issuer: CatalogEntry | undefined,
  wallet: CatalogEntry | undefined,
  verifier: CatalogEntry | undefined,
  credentialConfig: CredentialConfigurationSummary | undefined,
  scenario?: string | null,
): RunConfig | null {
  if (!issuer || !wallet || !verifier || !s.format || !credentialConfig) return null;
  const grantTypes = wallet.capabilities.grantTypes ?? ['pre-authorized_code'];
  const proofSuite = credentialConfig.proofSuites[0];
  const mode = s.mode ?? 'full';
  return {
    mode,
    issuerId: issuer.id,
    walletId: wallet.id,
    verifierId: verifier.id,
    format: s.format,
    credentialConfigurationId: credentialConfig.id,
    ...(proofSuite ? { proofSuite } : {}),
    grantType: grantTypes.includes('pre-authorized_code') ? 'pre-authorized_code' : 'authorization_code',
    presentationFlow: s.presentationFlow,
    expectedOutcome: s.expectedOutcome,
    ...(mode === 'present-only' && s.heldCredentialId ? { heldCredentialId: s.heldCredentialId } : {}),
    ...(scenario ? { labels: { scenario } } : {}),
  };
}
