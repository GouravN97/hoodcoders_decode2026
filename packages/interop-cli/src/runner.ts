// MatrixRunner (plan §8.7): runs each lane through the BFF, one at a time, and turns the run
// report into a lane result. Lanes run in order because the mock wallet is shared state (a
// T-NONCE-REPLAY lane replays an earlier lane's presentation).
import {
  TERMINAL_RUN_STATES,
  type CatalogEntry,
  type CredentialConfigurationSummary,
  type RunConfig,
  type RunReport,
} from '@playground/shared';
import type { BffClient, RunTrigger } from './client.ts';
import type { Lane } from './matrix.ts';

/**
 * pass / fail: the run's verdict. known-gap: failed, but the lane documents that gap.
 * gap-fixed: a known-gap lane passed, so the gap may be closed. skipped: not run (reason given).
 * error: the suite could not run the lane (BFF refused it, timeout).
 */
export type LaneStatus = 'pass' | 'fail' | 'known-gap' | 'gap-fixed' | 'skipped' | 'error';

export interface LaneResult {
  key: string;
  config: Lane['config'];
  knownGap?: string;
  status: LaneStatus;
  /** Why the lane was skipped or errored. */
  reason?: string;
  runId?: string;
  report?: RunReport;
  durationMs: number;
}

export interface RunOptions {
  trigger: RunTrigger;
  /** Skip lanes whose wallet needs a person (a phone, a browser login). */
  headlessOnly: boolean;
  laneTimeoutMs: number;
  pollMs?: number;
  /** Called once per lane as it finishes, for progress output. */
  onLane?: (result: LaneResult, index: number, total: number) => void;
}

/** Statuses that make the suite fail. */
export const FAILING: readonly LaneStatus[] = ['fail', 'error'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The issuer's configuration for this format, leaving out its expired copies (T-EXPIRED picks those). */
export function pickConfiguration(
  configs: CredentialConfigurationSummary[],
  issuer: CatalogEntry | undefined,
  format: RunConfig['format'],
): string | undefined {
  const expiredCopies = new Set(Object.values(issuer?.capabilities.expiredVariants ?? {}));
  return configs.find((c) => c.format === format && !expiredCopies.has(c.id))?.id;
}

/** Why a lane cannot run against this catalog, or undefined when it can. */
export function skipReason(
  lane: Lane,
  catalog: CatalogEntry[],
  headlessOnly: boolean,
): string | undefined {
  const { issuerId, walletId, verifierId, mode } = lane.config;
  const used = [
    ...(mode === 'present-only' ? [] : [issuerId]),
    walletId,
    ...(mode === 'issue-only' ? [] : [verifierId]),
  ];
  for (const id of used) {
    const entry = catalog.find((c) => c.id === id);
    if (!entry) return `${id} is not in the catalog`;
    if (entry.health === 'down') return `${entry.displayName} is down`;
  }
  const wallet = catalog.find((c) => c.id === walletId);
  if (headlessOnly && wallet?.capabilities.automation !== 'headless')
    return `${wallet?.displayName ?? walletId} needs a person (--headless-only)`;
  return undefined;
}

function statusFor(lane: Lane, report: RunReport): LaneStatus {
  if (lane.knownGap) return report.passed ? 'gap-fixed' : 'known-gap';
  return report.passed ? 'pass' : 'fail';
}

export async function runMatrix(
  bff: BffClient,
  lanes: Lane[],
  opts: RunOptions,
): Promise<LaneResult[]> {
  const catalog = await bff.catalog();
  const configCache = new Map<string, CredentialConfigurationSummary[]>();
  const results: LaneResult[] = [];

  for (const [i, lane] of lanes.entries()) {
    const started = Date.now();
    const base = { key: lane.key, config: lane.config, ...(lane.knownGap ? { knownGap: lane.knownGap } : {}) };
    const finish = (r: Omit<LaneResult, 'key' | 'config' | 'durationMs'>) => {
      const result: LaneResult = { ...base, ...r, durationMs: Date.now() - started };
      results.push(result);
      opts.onLane?.(result, i, lanes.length);
    };

    const skip = skipReason(lane, catalog, opts.headlessOnly);
    if (skip) {
      finish({ status: 'skipped', reason: skip });
      continue;
    }

    let runId: string | undefined;
    try {
      let credentialConfigurationId = lane.config.credentialConfigurationId;
      if (!credentialConfigurationId) {
        const { issuerId, format } = lane.config;
        if (!configCache.has(issuerId)) configCache.set(issuerId, await bff.credentialConfigurations(issuerId));
        credentialConfigurationId = pickConfiguration(
          configCache.get(issuerId)!,
          catalog.find((c) => c.id === issuerId),
          format,
        );
        if (!credentialConfigurationId) {
          finish({ status: 'skipped', reason: `${issuerId} has no ${format} credential configuration` });
          continue;
        }
      }
      const config: RunConfig = { ...lane.config, credentialConfigurationId };
      runId = await bff.createRun(config, opts.trigger);

      const deadline = Date.now() + opts.laneTimeoutMs;
      for (;;) {
        const run = await bff.run(runId);
        if (TERMINAL_RUN_STATES.includes(run.state)) break;
        if (Date.now() > deadline) {
          await bff.cancel(runId).catch(() => undefined);
          throw new Error(`no result after ${Math.round(opts.laneTimeoutMs / 1000)}s (run cancelled)`);
        }
        await sleep(opts.pollMs ?? 1000);
      }
      const report = await bff.report(runId);
      finish({ status: statusFor(lane, report), runId, report });
    } catch (e) {
      finish({ status: 'error', reason: (e as Error).message, ...(runId ? { runId } : {}) });
    }
  }
  return results;
}
