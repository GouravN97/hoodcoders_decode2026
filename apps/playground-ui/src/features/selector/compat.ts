// Pure selection rules for the selector screen (unit-tested).
import {
  PLAYGROUND_FORMATS,
  runUsesRole,
  type CatalogEntry,
  type CredentialConfigurationSummary,
  type CredentialFormat,
  type PresentationFlow,
  type RunConfig,
  type RunMode,
} from '@playground/shared';
import type { SelectionState } from '../../store/selection';

/** Formats every selected implementation supports. */
export function commonFormats(selected: Array<CatalogEntry | undefined>): CredentialFormat[] {
  const chosen = selected.filter((e): e is CatalogEntry => Boolean(e));
  return PLAYGROUND_FORMATS.filter((f) => chosen.every((e) => e.capabilities.formats.includes(f)));
}

/**
 * Issue-only runs may deliberately test a format the wallet does not advertise. That is how this
 * playground turns a suspected incompatibility into observed evidence instead of hiding the test.
 */
export function selectableFormats(
  mode: RunMode,
  issuer: CatalogEntry | undefined,
  wallet: CatalogEntry | undefined,
  verifier: CatalogEntry | undefined,
): CredentialFormat[] {
  if (mode === 'issue-only' && issuer) {
    return PLAYGROUND_FORMATS.filter((format) => issuer.capabilities.formats.includes(format));
  }
  // A verifier that cannot check a format the issuer and wallet share does not hide it: the
  // compatibility panel says so and suggests Issue only or a verifier that does.
  void verifier;
  return commonFormats([issuer, wallet]);
}

/** Why a card cannot be picked given the other roles' selections, or undefined if it can. */
export function disabledReason(
  entry: CatalogEntry,
  others: Array<CatalogEntry | undefined>,
): string | undefined {
  if (entry.health === 'down') return `${entry.displayName} is not responding`;
  // Do not hide expected failures. The compatibility panel explains format/profile mismatches and
  // the user can switch to Issue only to test an external issuer against a wallet anyway.
  void others;
  return undefined;
}

export function supportedFlows(
  wallet: CatalogEntry | undefined,
  verifier: CatalogEntry | undefined,
): PresentationFlow[] {
  const all: PresentationFlow[] = ['cross-device-qr', 'same-device-deeplink'];
  const both = all.filter((f) =>
    [wallet, verifier].every(
      (e) => !e?.capabilities.presentationFlows || e.capabilities.presentationFlows.includes(f),
    ),
  );
  // The browser's own wallet answers a Digital Credentials API request, so only the verifier decides;
  // the prediction says that no wallet in the catalog advertises it.
  return verifier?.capabilities.presentationFlows?.includes('dc-api') ? [...both, 'dc-api'] : both;
}

/** The RunConfig the BFF receives, or null while the selection is incomplete. */
export function buildRunConfig(
  s: Pick<
    SelectionState,
    'format' | 'credentialConfigurationId' | 'presentationFlow' | 'expectedOutcome'
  > &
    Partial<Pick<SelectionState, 'mode' | 'heldCredentialId' | 'tamper'>>,
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
    grantType: grantTypes.includes('pre-authorized_code')
      ? 'pre-authorized_code'
      : 'authorization_code',
    presentationFlow: s.presentationFlow,
    expectedOutcome: s.expectedOutcome,
    ...(mode === 'present-only' && s.heldCredentialId
      ? { heldCredentialId: s.heldCredentialId }
      : {}),
    ...(s.tamper && runUsesRole(mode, 'verifier') ? { tamper: s.tamper } : {}),
    ...(scenario ? { labels: { scenario } } : {}),
  };
}
