// Turns a held credential (ldp_vc JSON, SD-JWT or mDoc) into the fields the credential card shows.
import { printable } from '@playground/protocol-core';
import { decodeBody } from './decode';

export interface CredentialSummary {
  kind: 'ldp_vc' | 'sd-jwt' | 'mso_mdoc' | 'unknown';
  type?: string;
  issuer?: string;
  validFrom?: string;
  validUntil?: string;
  proofType?: string;
  claims: Array<{ name: string; value: string }>;
}

const str = (v: unknown): string =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const fromEpoch = (v: unknown) => (typeof v === 'number' ? new Date(v * 1000).toISOString() : undefined);

export function summarizeCredential(raw: string): CredentialSummary {
  const d = decodeBody(raw);
  if (d.kind === 'sd-jwt') {
    const p = d.issuerJwt.payload;
    return {
      kind: 'sd-jwt',
      type: str(p.vct) || undefined,
      issuer: str(p.iss) || undefined,
      validFrom: fromEpoch(p.nbf ?? p.iat),
      validUntil: fromEpoch(p.exp),
      proofType: str(d.issuerJwt.header.alg) || undefined,
      claims: d.disclosures.filter((x) => x.name).map((x) => ({ name: x.name!, value: str(x.value) })),
    };
  }
  if (d.kind === 'json' && d.value && typeof d.value === 'object') {
    const vc = d.value as Record<string, unknown>;
    const types = Array.isArray(vc.type) ? vc.type.map(String) : [str(vc.type)];
    const issuer = typeof vc.issuer === 'object' ? (vc.issuer as { id?: string })?.id : str(vc.issuer);
    const subject = (vc.credentialSubject ?? {}) as Record<string, unknown>;
    const proof = Array.isArray(vc.proof) ? vc.proof[0] : vc.proof;
    return {
      kind: 'ldp_vc',
      type: types.filter((t) => t !== 'VerifiableCredential').join(', ') || types[0],
      issuer,
      validFrom: str(vc.validFrom ?? vc.issuanceDate) || undefined,
      validUntil: str(vc.validUntil ?? vc.expirationDate) || undefined,
      proofType: str((proof as { type?: string } | undefined)?.type) || undefined,
      claims: Object.entries(subject)
        .filter(([k]) => k !== 'id')
        .map(([name, value]) => ({ name, value: str(value) })),
    };
  }
  if (d.kind === 'mdoc' && d.documents[0]) {
    const doc = d.documents[0];
    const v = doc.mso.validityInfo;
    return {
      kind: 'mso_mdoc',
      type: doc.docType,
      validFrom: v.validFrom?.toISOString(),
      validUntil: v.validUntil?.toISOString(),
      proofType: doc.issuerAuth.alg === -7 ? 'ES256 (COSE)' : undefined,
      claims: doc.elements.map((e) => ({ name: e.elementIdentifier, value: str(printable(e.elementValue)) })),
    };
  }
  return { kind: 'unknown', claims: [] };
}

/** `farmerID` → `Farmer ID`, `primaryCropType` → `Primary crop type`. */
export function humanizeClaim(name: string): string {
  const spaced = name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase();
  return spaced
    .replace(/\bid\b/g, 'ID')
    .replace(/^./, (c) => c.toUpperCase());
}
