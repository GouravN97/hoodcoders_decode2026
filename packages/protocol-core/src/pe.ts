// Presentation Exchange (DIF PE v2, the dialect Inji Verify 0.18 and inji-openid4vp speak): the
// subset the playground's wallets and verifiers use. One input descriptor, field paths and filters.

export interface PeField {
  path: string[];
  filter?: { type?: string; pattern?: string; const?: unknown; contains?: { const?: unknown } };
  optional?: boolean;
}

export interface InputDescriptor {
  id: string;
  format?: Record<string, unknown>;
  constraints?: { fields?: PeField[]; limit_disclosure?: 'required' | 'preferred' };
}

export interface PresentationDefinition {
  id: string;
  purpose?: string;
  input_descriptors: InputDescriptor[];
}

export interface DescriptorMapEntry {
  id: string;
  format: string;
  path: string;
  path_nested?: DescriptorMapEntry;
}

export interface PresentationSubmission {
  id: string;
  definition_id: string;
  descriptor_map: DescriptorMapEntry[];
}

/** Minimal JSONPath: `$.a.b` and `$['a']['b']`. */
export function readPath(obj: unknown, path: string): unknown {
  const keys = path
    .replace(/^\$/, '')
    .split(/\.|\[['"]?|['"]?\]/)
    .filter(Boolean);
  return keys.reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

export function filterMatches(value: unknown, filter: PeField['filter']): boolean {
  if (value === undefined) return false;
  if (!filter) return true;
  const values = Array.isArray(value) ? value : [value];
  if (filter.const !== undefined && !values.includes(filter.const)) return false;
  if (filter.contains?.const !== undefined && !values.includes(filter.contains.const)) return false;
  if (filter.pattern !== undefined) {
    const re = new RegExp(filter.pattern);
    if (!values.some((v) => re.test(typeof v === 'string' ? v : JSON.stringify(v)))) return false;
  }
  return true;
}

/** The required fields of a descriptor that the claims do not satisfy (empty: it matches). */
export function unmetFields(claims: Record<string, unknown>, d: InputDescriptor): PeField[] {
  return (d.constraints?.fields ?? []).filter(
    (f) => !f.optional && !f.path.some((p) => filterMatches(readPath(claims, p), f.filter)),
  );
}

/** Whether a descriptor accepts a credential format (`ldp_vp` stands for JSON-LD presentations). */
export function formatAllowed(d: InputDescriptor, format: string): boolean {
  const formats = d.format ? Object.keys(d.format) : undefined;
  return !formats || formats.some((f) => f === format || (f === 'ldp_vp' && format === 'ldp_vc'));
}

/** What a field asks for, for messages: the const or pattern of its filter. */
export const describeField = (f: PeField) =>
  `${f.path.join(' or ')} ${f.filter?.const !== undefined ? `= ${JSON.stringify(f.filter.const)}` : f.filter?.pattern ? `matching ${f.filter.pattern}` : 'present'}`;
