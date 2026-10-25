// Resolves the tamper a run applies against the catalog and earlier runs (plan §13). Pure, so the
// BFF orchestrator and the UI's in-browser mocks plan tampers the same way.
import type { CatalogEntry } from './catalog';
import type { RunConfig } from './domain';
import { formatLabel, modeLabel } from './labels';
import { runUsesRole, type RunDetail } from './run';
import {
  canReplayFrom,
  expiredVariantFor,
  nonceOfVpToken,
  ReplayParamsSchema,
  tamperDefinition,
  type AppliedTamper,
  type ReplayInput,
  type TamperDefinition,
} from './tamper';

/** The selection cannot apply the requested tamper; the message says why. */
export class TamperPlanError extends Error {}

export interface TamperPlan {
  def: TamperDefinition;
  applied: AppliedTamper;
  /** T-NONCE-REPLAY: what the wallet replays, taken from an earlier run. */
  replay?: ReplayInput;
}

/**
 * The tamper a run applies. T-EXPIRED swaps in the issuer's expired copy of the credential
 * configuration; T-NONCE-REPLAY takes the vp_token (or its nonce) from an earlier finished run,
 * newest first unless one is named. A run that expects Invalid with a tamper-capable wallet and no
 * tamper picked breaks the issuer signature, as before tampers could be chosen.
 *
 * Returns the config to run (possibly changed) and the plan; throws TamperPlanError.
 */
export function planTamper(
  config: RunConfig,
  catalog: CatalogEntry[],
  earlierRuns: RunDetail[],
): { config: RunConfig; tamper?: TamperPlan } {
  const issuer = catalog.find((c) => c.id === config.issuerId);
  const wallet = catalog.find((c) => c.id === config.walletId);
  const presenting = runUsesRole(config.mode, 'verifier');
  let spec = config.tamper;
  let defaulted = false;
  if (!spec) {
    if (!presenting || config.expectedOutcome !== 'INVALID' || !wallet?.capabilities.supportsTamper)
      return { config };
    spec = { id: 'T-SIG-FLIP' };
    defaulted = true;
  }
  if (!presenting) {
    throw new TamperPlanError(
      `${spec.id} needs a run that presents the credential; ${modeLabel(config.mode)} runs never reach the verifier`,
    );
  }
  const def = tamperDefinition(spec.id);
  if (!def) throw new TamperPlanError(`Unknown tamper ${spec.id}`);
  if (!def.formats.includes(config.format))
    throw new TamperPlanError(`${def.id} does not apply to ${formatLabel(config.format)} credentials`);
  if (def.mechanism === 'wallet-hook' && !wallet?.capabilities.supportsTamper) {
    throw new TamperPlanError(
      `${wallet?.displayName ?? config.walletId} cannot apply ${def.id}: only a wallet with tamper hooks (the mock wallet) can`,
    );
  }
  const applied: AppliedTamper = {
    id: def.id,
    label: def.label,
    mechanism: def.mechanism,
    expectedOutcome: def.expectedOutcome,
    ...(defaulted ? { defaulted: true } : {}),
  };

  if (def.id === 'T-EXPIRED') {
    const original = config.credentialConfigurationId;
    const variant = expiredVariantFor(issuer, original);
    if (!variant)
      throw new TamperPlanError(`${issuer?.displayName ?? config.issuerId} has no expired copy of ${original}`);
    return {
      config: { ...config, credentialConfigurationId: variant },
      tamper: {
        def,
        applied: {
          ...applied,
          summary:
            variant === original
              ? `Issued ${variant}, signed with validity in the past`
              : `Issued ${variant} (signed with validity in the past) instead of ${original}`,
        },
      },
    };
  }

  if (def.id === 'T-NONCE-REPLAY') {
    const params = ReplayParamsSchema.safeParse(spec.params ?? {});
    if (!params.success)
      throw new TamperPlanError(`Invalid T-NONCE-REPLAY params: ${params.error.issues[0]?.message}`);
    const source = replaySource(config, params.data.sourceRunId, earlierRuns);
    const vpToken = source.artifacts.find((a) => a.kind === 'vp_token')!.raw;
    const submission = source.artifacts.find((a) => a.kind === 'presentation_submission')?.raw;
    let replay: ReplayInput;
    if (params.data.variant === 'resubmit-vp') {
      replay = {
        variant: 'resubmit-vp',
        vpToken,
        ...(submission ? { presentationSubmission: submission } : {}),
      };
    } else {
      const nonce = nonceOfVpToken(vpToken);
      if (!nonce) throw new TamperPlanError(`The vp_token of run ${source.id} carries no nonce to reuse`);
      replay = { variant: 'stale-nonce', nonce };
    }
    return {
      config: { ...config, tamper: { ...spec, params: { ...params.data, sourceRunId: source.id } } },
      tamper: { def, replay, applied: { ...applied, sourceRunId: source.id } },
    };
  }
  return { config, tamper: { def, applied } };
}

/** T-NONCE-REPLAY: the earlier run whose presentation is replayed. `runs` are newest first. */
function replaySource(config: RunConfig, sourceRunId: string | undefined, runs: RunDetail[]): RunDetail {
  if (sourceRunId) {
    const named = runs.find((r) => r.id === sourceRunId);
    if (!named) throw new TamperPlanError(`Run ${sourceRunId} not found`);
    if (!canReplayFrom(named, config)) {
      throw new TamperPlanError(
        `Run ${sourceRunId} has no untampered ${formatLabel(config.format)} presentation that this verifier accepted`,
      );
    }
    return named;
  }
  const newest = runs.find((r) => canReplayFrom(r, config));
  if (!newest) {
    throw new TamperPlanError(
      `No earlier untampered ${formatLabel(config.format)} run passed this verifier, so there is no vp_token to replay. Run a normal full run first.`,
    );
  }
  return newest;
}
