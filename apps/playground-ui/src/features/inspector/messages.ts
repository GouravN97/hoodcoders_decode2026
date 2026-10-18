// Classification helpers for the exchange list.
import { ProtocolStep, type ArtifactKind, type ExchangeWithDecoded } from '@playground/shared';

export type InspectorPhase = 'issue' | 'present' | 'verify' | 'other';

export function phaseOf(step: ProtocolStep): InspectorPhase {
  if (step.startsWith('oid4vci.')) return 'issue';
  if (step.startsWith('oid4vp.')) return 'present';
  if (step.startsWith('verify.')) return 'verify';
  return 'other';
}

/** The messages Task 5 names explicitly: offer, authorization request, presentation definition, vp_token, result. */
export const NAMED_KINDS: ArtifactKind[] = [
  'offer',
  'auth_request',
  'presentation_definition',
  'vp_token',
  'verification_result',
];

/**
 * Named artifacts carried by an exchange. Uses the BFF's ArtifactExtractor output when present,
 * otherwise infers from the protocol step and body.
 */
export function namedMessages(ex: ExchangeWithDecoded): ArtifactKind[] {
  if (ex.artifactKinds) return ex.artifactKinds.filter((k) => NAMED_KINDS.includes(k));
  const body = `${ex.request.body ?? ''}${ex.response?.body ?? ''}`;
  switch (ex.step) {
    case ProtocolStep.VCI_CREDENTIAL_OFFER:
      return ['offer'];
    case ProtocolStep.VP_AUTH_REQUEST:
      return ['auth_request'];
    case ProtocolStep.VP_REQUEST_OBJECT:
      return body.includes('presentation_definition') ? ['auth_request', 'presentation_definition'] : ['auth_request'];
    case ProtocolStep.VP_RESPONSE:
      return body.includes('vp_token') ? ['vp_token'] : [];
    case ProtocolStep.VERIFY_RESULT:
      return ['verification_result'];
    default:
      return [];
  }
}

const PARTY: Record<string, string> = {
  bff: 'Playground',
  wallet: 'Wallet',
  mimoto: 'Mimoto',
  certify: 'Inji Certify',
  verify: 'Inji Verify',
};
export const partyLabel = (id: string | undefined) => (id ? (PARTY[id] ?? id) : 'Unknown');

/** Path and query of a URL, without the origin, for compact list rows. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return `${u.protocol}//…`;
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
