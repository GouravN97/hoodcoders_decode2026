// Suite outputs: a Markdown summary (one row per lane, then failures and known gaps), JUnit XML for
// CI test reporting, and JSON with every run report. Pure, so the tests pin the exact output.
import { formatLabel, outcomeLabel, runUsesRole, verdictLabel } from '@playground/shared';
import { FAILING, type LaneResult, type LaneStatus } from './runner.ts';

export interface SuiteMeta {
  matrix: string;
  bff: string;
  startedAt: string;
  finishedAt: string;
}

const STATUS_TEXT: Record<LaneStatus, string> = {
  pass: '✅ pass',
  fail: '❌ fail',
  'known-gap': '🟠 known gap',
  'gap-fixed': '🆕 gap fixed?',
  skipped: '➖ skipped',
  error: '💥 error',
};

const md = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function tally(results: LaneResult[]): Record<LaneStatus, number> {
  const t: Record<LaneStatus, number> = { pass: 0, fail: 0, 'known-gap': 0, 'gap-fixed': 0, skipped: 0, error: 0 };
  for (const r of results) t[r.status]++;
  return t;
}

export const suitePassed = (results: LaneResult[]) => results.every((r) => !FAILING.includes(r.status));

function who(r: LaneResult, role: 'issuer' | 'wallet' | 'verifier'): string {
  if (!runUsesRole(r.config.mode, role)) return `— (${r.config.mode})`;
  const p = r.report?.[role];
  if (p) return md(p.version ? `${p.displayName} ${p.version}` : p.displayName);
  return md(r.config[`${role}Id`]);
}

export function renderMarkdown(results: LaneResult[], meta: SuiteMeta): string {
  const t = tally(results);
  const counts = (Object.keys(t) as LaneStatus[])
    .filter((s) => t[s] > 0)
    .map((s) => `${t[s]} ${STATUS_TEXT[s].split(' ').slice(1).join(' ')}`)
    .join(' · ');
  const lines = [
    `# Interop suite: ${meta.matrix}`,
    '',
    `${suitePassed(results) ? '**Passed**' : '**Failed**'} — ${results.length} lane${results.length === 1 ? '' : 's'}: ${counts || 'none'}.`,
    '',
    `Run from ${meta.startedAt} to ${meta.finishedAt} against ${meta.bff}. Versions are the ones the catalog reported for each run.`,
    '',
    '| Issuer | Wallet | Verifier | Format | Proof | Test | Expected | Observed | Verdict | Result | Run |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    const c = r.config;
    const test = [c.mode !== 'full' ? c.mode : '', c.tamper?.id ?? ''].filter(Boolean).join(' · ') || 'valid path';
    const rep = r.report;
    const run = rep ? `[${r.runId!.slice(0, 8)}](${rep.inspectorUrl})` : r.runId ? r.runId.slice(0, 8) : '—';
    lines.push(
      `| ${who(r, 'issuer')} | ${who(r, 'wallet')} | ${who(r, 'verifier')} | ${formatLabel(c.format)} | ${md(rep?.proofType ?? '—')} | ${md(test)} | ${outcomeLabel(c.expectedOutcome)} | ${rep?.observedOutcome ? outcomeLabel(rep.observedOutcome) : '—'} | ${rep ? verdictLabel(rep.verdict) : '—'} | ${STATUS_TEXT[r.status]} | ${run} |`,
    );
  }

  const failures = results.filter((r) => FAILING.includes(r.status));
  if (failures.length) {
    lines.push('', '## Failures', '');
    for (const r of failures) lines.push(`- **${md(r.key)}**: ${md(detail(r))}`);
  }
  const gaps = results.filter((r) => r.status === 'known-gap' || r.status === 'gap-fixed');
  if (gaps.length) {
    lines.push('', '## Known gaps', '');
    for (const r of gaps)
      lines.push(
        `- **${md(r.key)}** (${md(r.knownGap!)}): ${r.status === 'gap-fixed' ? 'passed — the gap may be fixed; check and update the matrix' : `still present — ${md(detail(r))}`}`,
      );
  }
  const skipped = results.filter((r) => r.status === 'skipped');
  if (skipped.length) {
    lines.push('', '## Skipped', '');
    for (const r of skipped) lines.push(`- ${md(r.key)}: ${md(r.reason ?? '')}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** One line on why a lane did not pass. */
function detail(r: LaneResult): string {
  if (r.reason) return r.reason;
  const rep = r.report;
  if (!rep) return 'no report';
  const parts = [
    `observed ${rep.observedOutcome ? outcomeLabel(rep.observedOutcome) : 'no result'}, expected ${outcomeLabel(rep.expectedOutcome)}`,
  ];
  if (rep.error) parts.push(`at ${rep.error.step}: ${rep.error.message}${rep.error.status ? ` (HTTP ${rep.error.status})` : ''}`);
  return parts.join('; ');
}

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JUnit XML: known gaps count as skipped so they show without failing the job. */
export function renderJunit(results: LaneResult[], meta: SuiteMeta): string {
  const t = tally(results);
  const seconds = (ms: number) => (ms / 1000).toFixed(3);
  const total = results.reduce((s, r) => s + r.durationMs, 0);
  const cases = results.map((r) => {
    const c = r.config;
    const open = `    <testcase classname="${xml(`${c.issuerId}.${c.walletId}.${c.verifierId}`)}" name="${xml(r.key)}" time="${seconds(r.durationMs)}"`;
    const body = (() => {
      switch (r.status) {
        case 'pass':
          return '';
        case 'gap-fixed':
          return `      <system-out>${xml(`Known gap ${r.knownGap} did not reproduce.`)}</system-out>\n`;
        case 'skipped':
          return `      <skipped message="${xml(r.reason ?? '')}"/>\n`;
        case 'known-gap':
          return `      <skipped message="${xml(`known gap: ${r.knownGap}`)}">${xml(detail(r))}</skipped>\n`;
        case 'fail':
          return `      <failure message="${xml(detail(r))}">${xml(r.report?.inspectorUrl ?? '')}</failure>\n`;
        case 'error':
          return `      <error message="${xml(detail(r))}"/>\n`;
      }
    })();
    return body ? `${open}>\n${body}    </testcase>` : `${open}/>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="interop" tests="${results.length}" failures="${t.fail}" errors="${t.error}" skipped="${t.skipped + t['known-gap']}" time="${seconds(total)}">`,
    `  <testsuite name="${xml(meta.matrix)}" tests="${results.length}" failures="${t.fail}" errors="${t.error}" skipped="${t.skipped + t['known-gap']}" time="${seconds(total)}" timestamp="${meta.startedAt}">`,
    ...cases,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}
