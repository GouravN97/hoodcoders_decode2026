// vp_token shapes. OpenID4VP 1.0 with DCQL sends a JSON object keyed by credential query id, each
// holding an array of presentations (`{"farmer": ["<sd-jwt>~<kb-jwt>"]}` or `{"farmer": [{…ldp_vp}]}`);
// draft 23 with Presentation Exchange sends the presentation itself.

/** The DCQL credential query ids of a 1.0 vp_token, or undefined for any other shape. */
export function dcqlQueryIds(vpToken: string): string[] | undefined {
  const t = vpToken.trim();
  if (!t.startsWith('{')) return undefined;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    // A presentation's own members, never DCQL credential query ids in practice.
    if (['type', '@context', 'proof', 'verifiableCredential', 'holder'].some((k) => k in o)) return undefined;
    const ids = Object.keys(o);
    return ids.length > 0 && ids.every((k) => Array.isArray(o[k])) ? ids : undefined;
  } catch {
    return undefined;
  }
}

/** The first presentation of a DCQL vp_token as a string (SD-JWT as is, a VP as JSON); other shapes unchanged. */
export function firstPresentation(vpToken: string): string {
  const ids = dcqlQueryIds(vpToken);
  if (!ids) return vpToken;
  const item = (JSON.parse(vpToken.trim()) as Record<string, unknown[]>)[ids[0]!]?.[0];
  if (item === undefined) return vpToken;
  return typeof item === 'string' ? item : JSON.stringify(item);
}
