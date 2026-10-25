// Run records. Live runs are held in memory; finished runs are also written to
// `${DATA_DIR}/runs/<id>.json` (run, findings and exchanges) and loaded again at startup, so
// history and reports survive a BFF restart (Task 7: "save every run from day one").
import { EventEmitter } from 'node:events';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckFinding, DcApiResponseRequest, Exchange, RunDetail, RunEvent } from '@playground/shared';
import { getExchangesByRun, restoreRun } from '../store/exchange-store.ts';

export interface RunRecord {
  run: RunDetail;
  findings: CheckFinding[];
  controller: AbortController;
  /** Pending manual-evidence waits, keyed by step id. */
  manualWaiters: Map<string, () => void>;
  /** A dc-api run waiting for the browser's navigator.credentials.get result. */
  dcApiWaiter?: (response: DcApiResponseRequest) => void;
}

/** Every RunEvent the BFF publishes; the realtime gateway forwards them to the run's room. */
export const runEvents = new EventEmitter();
runEvents.setMaxListeners(0);
export const publish = (event: RunEvent) => runEvents.emit('event', event);

export class RunStore {
  private readonly runs = new Map<string, RunRecord>();

  private readonly dataDir?: string;

  constructor(dataDir?: string) {
    if (!dataDir) return;
    const dir = join(dataDir, 'runs');
    try {
      mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn(
        `[runs] cannot write ${dir} (${(e as Error).message}); runs are kept in memory only`,
      );
      return;
    }
    this.dataDir = dataDir;
    let loaded = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const saved = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
          run: RunDetail;
          findings?: CheckFinding[];
          exchanges?: Exchange[];
        };
        this.runs.set(saved.run.id, {
          run: saved.run,
          findings: saved.findings ?? [],
          controller: new AbortController(),
          manualWaiters: new Map(),
        });
        restoreRun(saved.run.id, saved.exchanges ?? []);
        loaded++;
      } catch (e) {
        console.warn(`[runs] skipping ${file}: ${(e as Error).message}`);
      }
    }
    if (loaded) console.log(`[runs] loaded ${loaded} finished runs from ${dir}`);
  }

  create(run: RunDetail): RunRecord {
    const record: RunRecord = {
      run,
      findings: [],
      controller: new AbortController(),
      manualWaiters: new Map(),
    };
    this.runs.set(run.id, record);
    return record;
  }

  get = (id: string) => this.runs.get(id);

  /** Newest first. */
  list(): RunDetail[] {
    return [...this.runs.values()]
      .map((r) => r.run)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  persist(record: RunRecord): void {
    if (!this.dataDir) return;
    const file = join(this.dataDir, 'runs', `${record.run.id}.json`);
    const body = JSON.stringify({
      run: record.run,
      findings: record.findings,
      exchanges: getExchangesByRun(record.run.id),
    });
    try {
      writeFileSync(`${file}.tmp`, body);
      renameSync(`${file}.tmp`, file);
    } catch (e) {
      console.warn(`[runs] could not save ${record.run.id}: ${(e as Error).message}`);
    }
  }
}
