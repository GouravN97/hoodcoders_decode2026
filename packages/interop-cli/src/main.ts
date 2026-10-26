#!/usr/bin/env tsx
// interop-cli (plan §8.7, bonus B1): runs a matrices/*.yaml file against a running playground BFF
// and writes summary.md, junit.xml and results.json. Exits 1 when a lane fails that is not a
// documented known gap, so CI marks the job red.
//
//   interop run --matrix matrices/nightly.yaml [--bff http://localhost:8101] [--out reports]
//               [--headless-only] [--trigger cli|nightly] [--lane-timeout 300] [--only <text>]
//   interop list --matrix matrices/nightly.yaml
//   interop gaps [--bff …] [--out out/gaps]   GitHub issue drafts for the saved failed runs (plan §16.2)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { BffClient, type RunTrigger } from './client.ts';
import { clusterFailures, renderGapIndex, renderIssueDraft, slug } from './gaps.ts';
import { expandMatrix, loadMatrix } from './matrix.ts';
import { renderJunit, renderMarkdown, suitePassed, tally } from './render.ts';
import { runMatrix } from './runner.ts';

const USAGE = `Usage:
  interop run  --matrix <file> [--bff <url>] [--out <dir>] [--headless-only] [--trigger cli|nightly]
               [--lane-timeout <seconds>] [--only <text>]
  interop list --matrix <file> [--only <text>]
  interop gaps [--bff <url>] [--out <dir>]`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    matrix: { type: 'string' },
    bff: { type: 'string', default: process.env.BFF_URL ?? 'http://localhost:8101' },
    out: { type: 'string', default: 'reports' },
    'headless-only': { type: 'boolean', default: false },
    trigger: { type: 'string', default: 'cli' },
    'lane-timeout': { type: 'string', default: '300' },
    only: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const command = positionals[0];
if (values.help || !command || !['run', 'list', 'gaps'].includes(command) || (command !== 'gaps' && !values.matrix)) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 2);
}

if (command === 'gaps') {
  const bff = new BffClient(values.bff);
  const failed = await bff.runs({ verdict: 'FAIL' });
  const reports = [];
  for (const r of failed) reports.push(await bff.report(r.id));
  const clusters = clusterFailures(reports);
  const out = values.out === 'reports' ? 'out/gaps' : values.out;
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'README.md'), renderGapIndex(clusters, new Date().toISOString()));
  for (const c of clusters.filter((x) => x.category === 'interop')) {
    const exchanges = await bff.exchanges(c.runs[0]!.runId).catch(() => []);
    await writeFile(join(out, `${slug(c)}.md`), renderIssueDraft(c, exchanges));
    console.log(`${String(c.runs.length).padStart(3)} run(s)  ${c.target.padEnd(18)} ${c.title}`);
  }
  const other = clusters.filter((x) => x.category !== 'interop');
  console.log(`\n${clusters.length - other.length} interop gap drafts, ${other.length} infrastructure / holder signatures (listed only). Wrote ${join(out, 'README.md')}`);
  process.exit(0);
}
if (values.trigger !== 'cli' && values.trigger !== 'nightly') {
  console.error('--trigger must be cli or nightly');
  process.exit(2);
}

const file = loadMatrix(await readFile(values.matrix!, 'utf8'));
let lanes = expandMatrix(file);
if (values.only) lanes = lanes.filter((l) => l.key.includes(values.only!));

if (command === 'list') {
  for (const l of lanes) console.log(`${l.key}${l.knownGap ? `   (known gap: ${l.knownGap})` : ''}`);
  console.log(`\n${lanes.length} lane${lanes.length === 1 ? '' : 's'} in ${file.name}`);
  process.exit(0);
}

const bff = new BffClient(values.bff);
const startedAt = new Date().toISOString();
console.log(`Running ${lanes.length} lanes of ${file.name} against ${values.bff}\n`);
const results = await runMatrix(bff, lanes, {
  trigger: values.trigger as RunTrigger,
  headlessOnly: values['headless-only'],
  laneTimeoutMs: Number(values['lane-timeout']) * 1000,
  onLane: (r, i, total) => {
    const n = `[${String(i + 1).padStart(String(total).length)}/${total}]`;
    const why = r.reason ?? (r.report && r.status !== 'pass' ? r.report.error?.message ?? r.report.verdict : '');
    console.log(`${n} ${r.status.padEnd(9)} ${r.key}  (${(r.durationMs / 1000).toFixed(1)}s)${why ? `\n${' '.repeat(n.length + 11)}${why}` : ''}`);
  },
});

const meta = { matrix: file.name, bff: values.bff, startedAt, finishedAt: new Date().toISOString() };
await mkdir(values.out, { recursive: true });
await writeFile(join(values.out, 'summary.md'), renderMarkdown(results, meta));
await writeFile(join(values.out, 'junit.xml'), renderJunit(results, meta));
await writeFile(
  join(values.out, 'results.json'),
  `${JSON.stringify({ ...meta, matrixFile: basename(values.matrix!), lanes: results }, null, 2)}\n`,
);

const t = tally(results);
console.log(
  `\n${suitePassed(results) ? 'PASSED' : 'FAILED'}: ${t.pass} pass, ${t.fail} fail, ${t.error} error, ${t['known-gap']} known gap, ${t['gap-fixed']} gap fixed?, ${t.skipped} skipped`,
);
console.log(`Wrote ${join(values.out, 'summary.md')}, junit.xml and results.json`);
process.exit(suitePassed(results) ? 0 : 1);
