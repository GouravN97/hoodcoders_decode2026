// MatrixLoader (plan §8.7): a matrices/*.yaml file — axes, defaults, include, exclude — expanded
// into one lane per run config. Format as in plan §14.3.
import {
  CredentialFormatSchema,
  GrantTypeSchema,
  PresentationFlowSchema,
  QueryLanguageSchema,
  ResponseModeSchema,
  RunModeSchema,
  TamperSpecSchema,
  VerificationOutcomeSchema,
  VpProfileSchema,
  type RunConfig,
} from '@playground/shared';
import { parse } from 'yaml';
import { z } from 'zod';

/** Everything a lane may set on top of the axes; the same keys as RunConfig, all optional. */
const LaneFieldsSchema = z.object({
  mode: RunModeSchema.optional(),
  issuer: z.string().optional(),
  wallet: z.string().optional(),
  verifier: z.string().optional(),
  format: CredentialFormatSchema.optional(),
  credentialConfigurationId: z.string().optional(),
  grantType: GrantTypeSchema.optional(),
  presentationFlow: PresentationFlowSchema.optional(),
  vpProfile: VpProfileSchema.optional(),
  queryLanguage: QueryLanguageSchema.optional(),
  responseMode: ResponseModeSchema.optional(),
  tamper: TamperSpecSchema.optional(),
  expectedOutcome: VerificationOutcomeSchema.optional(),
  labels: z.record(z.string(), z.string()).optional(),
  /** Shown instead of the generated lane name. */
  name: z.string().optional(),
  /**
   * The lane is expected to fail because of a known, documented gap (e.g. "docs/gaps #1"). Its
   * failure is reported but does not fail the suite; a pass is flagged so the gap can be closed.
   */
  knownGap: z.string().optional(),
});
type LaneFields = z.infer<typeof LaneFieldsSchema>;

export const MatrixFileSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaults: LaneFieldsSchema.default({}),
  axes: z
    .object({
      issuer: z.array(z.string()).min(1),
      wallet: z.array(z.string()).min(1),
      verifier: z.array(z.string()).min(1),
      format: z.array(CredentialFormatSchema).min(1),
    })
    .optional(),
  include: z.array(LaneFieldsSchema).default([]),
  /** A generated lane is dropped when every key given here matches it. */
  exclude: z.array(LaneFieldsSchema.pick({ issuer: true, wallet: true, verifier: true, format: true, mode: true })).default([]),
});
export type MatrixFile = z.infer<typeof MatrixFileSchema>;

/** One run the suite makes. `config` lacks the credential configuration until the runner resolves it. */
export interface Lane {
  key: string;
  config: Omit<RunConfig, 'credentialConfigurationId'> & { credentialConfigurationId?: string };
  knownGap?: string;
}

const BASE = {
  mode: 'full',
  grantType: 'pre-authorized_code',
  presentationFlow: 'cross-device-qr',
  expectedOutcome: 'VALID',
} as const;

export function laneKey(c: Lane['config']): string {
  const parts = [`${c.issuerId} → ${c.walletId} → ${c.verifierId}`, c.format];
  if (c.mode !== 'full') parts.push(c.mode);
  if (c.tamper) parts.push(c.tamper.id);
  if (c.expectedOutcome !== 'VALID') parts.push(`expect ${c.expectedOutcome}`);
  return parts.join(' · ');
}

function toLane(fields: LaneFields, where: string): Lane {
  const { issuer, wallet, verifier, format, name, knownGap, ...rest } = fields;
  if (!issuer || !wallet || !verifier || !format)
    throw new Error(`${where}: issuer, wallet, verifier and format are required`);
  const config: Lane['config'] = {
    ...BASE,
    ...rest,
    issuerId: issuer,
    walletId: wallet,
    verifierId: verifier,
    format,
  };
  return { key: name ?? laneKey(config), config, ...(knownGap ? { knownGap } : {}) };
}

const matches = (exclude: Partial<LaneFields>, lane: LaneFields) =>
  (Object.keys(exclude) as Array<keyof LaneFields>).every((k) => exclude[k] === lane[k]);

/** Axes cross product minus excludes, then includes; a lane listed twice runs once. */
export function expandMatrix(file: MatrixFile): Lane[] {
  const lanes = new Map<string, Lane>();
  const add = (l: Lane) => {
    if (!lanes.has(l.key)) lanes.set(l.key, l);
  };
  if (file.axes) {
    const { issuer, wallet, verifier, format } = file.axes;
    for (const i of issuer)
      for (const w of wallet)
        for (const v of verifier)
          for (const f of format) {
            const fields: LaneFields = { ...file.defaults, issuer: i, wallet: w, verifier: v, format: f };
            if (file.exclude.some((e) => matches(e, fields))) continue;
            add(toLane(fields, `axes ${i}/${w}/${v}/${f}`));
          }
  }
  file.include.forEach((inc, n) => add(toLane({ ...file.defaults, ...inc }, `include[${n}]`)));
  return [...lanes.values()];
}

export function loadMatrix(yamlText: string): MatrixFile {
  const parsed = MatrixFileSchema.safeParse(parse(yamlText));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid matrix: ${issue?.path.join('.') || 'file'}: ${issue?.message}`);
  }
  return parsed.data;
}
