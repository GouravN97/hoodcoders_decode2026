// GapAnalyzer and GithubIssueDrafter (plan §16.2, bonus B2). Failed runs are clustered by a gap
// signature (what failed, where, in which module version), and each cluster that looks like an
// interoperability gap gets a GitHub issue draft built from its redacted run evidence. Drafts are
// for a person to review, check for duplicates and file; nothing here talks to GitHub.
import {
  formatLabel,
  outcomeLabel,
  stepLabel,
  tamperDefinition,
  type CredentialFormat,
  type Exchange,
  type RunReport,
} from '@playground/shared';

/** interop: worth an upstream issue. infrastructure: our setup (tunnels, DNS, timeouts). holder: a person declined. */
export type GapCategory = 'interop' | 'infrastructure' | 'holder';

export interface GapSignature {
  key: string;
  category: GapCategory;
  title: string;
  /** Implementation id of the module the failure points at. */
  component: string;
  componentVersion: string;
  /** Where to file it: an `owner/repo`, or a note when it is not an upstream module. */
  target: string;
}

export interface GapCluster extends GapSignature {
  /** Newest first. */
  runs: RunReport[];
  formats: CredentialFormat[];
}

const REPOS: Record<string, string> = {
  'inji-certify': 'inji/inji-certify',
  'inji-certify-mdoc': 'inji/inji-certify',
  'inji-verify': 'inji/inji-verify',
  'inji-wallet-mobile': 'inji/inji-wallet',
  'inji-web': 'inji/inji-web',
};

export const targetFor = (implementationId: string) =>
  REPOS[implementationId] ??
  (implementationId.startsWith('mock-') ? 'this repository (playground mock)' : 'external (not an Inji module)');

const INFRA =
  /trycloudflare|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|fetch failed|socket hang up|timed? ?out|aborted due to timeout|\b50[234]\b/i;
const HOLDER = /access_denied|declined/i;

/** The error with run-specific values (hosts, ids, numbers) replaced, so equal failures compare equal. */
export function normalizeError(message: string): string {
  return message
    .replace(/https?:\/\/[^/\s]+/g, '<origin>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\b(txn_)?[0-9a-f]{16,}\b/gi, '<id>')
    .replace(/\b\d{3,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** Which role a failed step belongs to. */
function roleOfStep(step: string): 'issuer' | 'wallet' | 'verifier' {
  if (step.startsWith('oid4vci.') || step === 'offer_prepared') return 'issuer';
  if (['offer_delivered', 'credential_held', 'request_delivered'].includes(step)) return 'wallet';
  return 'verifier';
}

/** The gap signature of a failed run (plan §16.2: check + normalised error + component + version). */
export function signatureOf(r: RunReport): GapSignature {
  const errorText = r.error ? `${r.error.message} ${r.error.body ?? ''}` : '';
  const category: GapCategory = HOLDER.test(errorText) ? 'holder' : INFRA.test(errorText) ? 'infrastructure' : 'interop';

  // A tamper the verifier let through: one gap per verifier version and tamper, across formats.
  if (r.tamper && r.observedOutcome === 'VALID') {
    return {
      key: `tamper-accepted|${r.verifier.id}@${r.verifier.version}|${r.tamper.id}`,
      category: 'interop',
      title: `${r.verifier.displayName} ${r.verifier.version} accepts a presentation with ${r.tamper.id} (${r.tamper.label.toLowerCase()})`,
      component: r.verifier.id,
      componentVersion: r.verifier.version ?? 'unknown',
      target: targetFor(r.verifier.id),
    };
  }

  const step = r.error?.step ?? 'verify.result';
  const role = r.error ? roleOfStep(step) : 'verifier';
  const who = r[role];
  // A verdict that differs from the expected one, with no step error beyond the mismatch.
  if (r.observedOutcome && r.observedOutcome !== r.expectedOutcome && (!r.error || r.error.message.startsWith('Expected '))) {
    return {
      key: `outcome|${r.verifier.id}@${r.verifier.version}|${r.format}|${r.expectedOutcome}->${r.observedOutcome}`,
      category,
      title: `${r.verifier.displayName} ${r.verifier.version} returns ${outcomeLabel(r.observedOutcome)} for a ${formatLabel(r.format)} that should be ${outcomeLabel(r.expectedOutcome)}`,
      component: r.verifier.id,
      componentVersion: r.verifier.version ?? 'unknown',
      target: targetFor(r.verifier.id),
    };
  }
  const error = normalizeError(r.error?.message ?? `observed ${r.observedOutcome ?? 'no result'}`);
  return {
    key: `step|${who.id}@${who.version}|${step}|${error}`,
    category,
    title: `${who.displayName} ${who.version ?? ''}: ${stepLabel(step)} fails: ${error}`.replace(/\s+/g, ' '),
    component: who.id,
    componentVersion: who.version ?? 'unknown',
    target: targetFor(who.id),
  };
}

/** Failed runs grouped by signature; interop gaps first, then by number of runs. */
export function clusterFailures(reports: RunReport[]): GapCluster[] {
  const clusters = new Map<string, GapCluster>();
  for (const r of reports) {
    if (r.verdict !== 'FAIL') continue;
    const sig = signatureOf(r);
    const c = clusters.get(sig.key) ?? { ...sig, runs: [], formats: [] };
    c.runs.push(r);
    if (!c.formats.includes(r.format)) c.formats.push(r.format);
    clusters.set(sig.key, c);
  }
  const order: GapCategory[] = ['interop', 'infrastructure', 'holder'];
  return [...clusters.values()]
    .map((c) => ({ ...c, runs: c.runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }))
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || b.runs.length - a.runs.length);
}

export const slug = (c: Pick<GapCluster, 'key'>) =>
  c.key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

const fence = (s: string, lang = '') => `\`\`\`${lang}\n${s.replace(/```/g, '`​``')}\n\`\`\``;
const truncate = (s: string, n = 1500) => (s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more characters)` : s);

/** A one-lane matrix that reproduces the run with interop-cli. */
export function reproMatrix(r: RunReport): string {
  const lane: string[] = [
    `issuer: ${r.issuer.id}`,
    `wallet: ${r.wallet.id}`,
    `verifier: ${r.verifier.id}`,
    `format: ${r.format}`,
    `credentialConfigurationId: ${r.credentialConfigurationId}`,
    `mode: ${r.mode}`,
    ...(r.tamper ? [`tamper: { id: ${r.tamper.id} }`] : []),
    `expectedOutcome: ${r.expectedOutcome}`,
  ];
  return ['name: repro', 'include:', `  - { ${lane.join(', ')} }`].join('\n');
}

/** The exchanges worth quoting, in message order: errors, what was asked, what was sent, the answer. */
function keyExchanges(exchanges: Exchange[], failedStep: string | undefined): Exchange[] {
  const steps = ['oid4vp.request_object', 'oid4vp.response', 'verify.result'];
  if (failedStep?.startsWith('oid4vci.')) steps.push('oid4vci.token', 'oid4vci.credential');
  const picked = exchanges.filter((e) => (e.status ?? 0) >= 400 || steps.includes(e.step) || Boolean(e.tampered));
  return (picked.length ? picked : exchanges.slice(-3)).sort((a, b) => a.seq - b.seq).slice(-5);
}

const decodeJwtPayload = (jwt: string): string | undefined => {
  try {
    return JSON.stringify(JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8')), null, 2);
  } catch {
    return undefined;
  }
};

/** For an SD-JWT presentation (`…~<kb-jwt>`, possibly JSON-quoted), the key-binding JWT's payload. */
function keyBindingNote(value: string): string {
  const kb = /~(ey[\w-]+\.ey[\w-]+\.[\w-]+)"?$/.exec(value.trim())?.[1];
  const payload = kb && decodeJwtPayload(kb);
  return payload ? `\n\nKey-binding JWT payload:\n${payload}` : '';
}

/** A body as a reviewer wants to read it: form fields decoded, a JWT's payload decoded. */
export function readableBody(body: string, contentType = ''): string {
  const trimmed = body.trim();
  if (/^ey[\w-]+\.ey[\w-]+\.[\w-]*$/.test(trimmed)) {
    const payload = decodeJwtPayload(trimmed);
    if (payload) return `JWT payload:\n${payload}`;
  }
  if (contentType.includes('x-www-form-urlencoded') || /^[\w.-]+=[^{]/.test(trimmed)) {
    // Long values (a vp_token) are cut so the decoded key-binding JWT after them stays in the draft.
    return [...new URLSearchParams(trimmed)]
      .map(([k, v]) => `${k}: ${v.length > 400 ? `${v.slice(0, 400)}… (${v.length} characters)` : v}${keyBindingNote(v)}`)
      .join('\n\n');
  }
  return body;
}

/** The GitHub issue draft for one cluster (plan §16.2 template). */
export function renderIssueDraft(c: GapCluster, exchanges: Exchange[] = []): string {
  const r = c.runs[0]!;
  const lines = [
    `<!-- gap signature: ${c.key} -->`,
    `<!-- target: ${c.target} · category: ${c.category} · ${c.runs.length} run(s) -->`,
    '',
    `# ${c.title}`,
    '',
    '### Summary',
    '',
    `${c.title}, seen in ${c.runs.length} run${c.runs.length === 1 ? '' : 's'} of ${r.issuer.displayName} → ${r.wallet.displayName} → ${r.verifier.displayName} (${c.formats.map((f) => `\`${f}\``).join(', ')}${r.tamper ? `, tamper \`${r.tamper.id}\`` : ''}).`,
    '',
    '### Environment',
    '',
    '| Role | Module | Version |',
    '| --- | --- | --- |',
    ...(['issuer', 'wallet', 'verifier'] as const).map((role) => `| ${role} | ${r[role].displayName} | ${r[role].version ?? 'unknown'} |`),
    '',
    'Run in the [Inji Interop Playground](https://github.com/GouravN97/hoodcoders_decode2026) local stack (pinned images, `injistack/docker-compose.yml`).',
    '',
    '### Steps to reproduce',
    '',
    '1. `make up` with the versions above.',
    '2. Save this as `repro.yaml` and run `make interop MATRIX=repro.yaml`:',
    '',
    fence(reproMatrix(r), 'yaml'),
    '',
    '### Expected',
    '',
    r.tamper
      ? `The verifier rejects the presentation. ${tamperDefinition(r.tamper.id)?.description ?? r.tamper.summary ?? r.tamper.label} Expected result: ${outcomeLabel(r.expectedOutcome)}.`
      : `${outcomeLabel(r.expectedOutcome)}.`,
    '',
    '### Actual',
    '',
    `${r.observedOutcome ? `The verifier returned ${outcomeLabel(r.observedOutcome)}.` : 'No verification result.'}${r.error && !r.error.message.startsWith('Expected ') ? ` ${stepLabel(r.error.step)}: ${r.error.message}${r.error.status ? ` (HTTP ${r.error.status})` : ''}` : ''}`,
    ...(r.error?.body ? ['', fence(truncate(r.error.body), 'json')] : []),
    '',
    '### Evidence (redacted)',
    '',
    `Captured by the playground's Protocol Tap in run \`${r.runId}\` (${r.createdAt}). Secrets are masked; identity data is mock data.`,
    '',
  ];
  for (const e of keyExchanges(exchanges, r.error?.step)) {
    lines.push(`**${e.method} ${e.url}** → ${e.status ?? 'no response'} (\`${e.step}\`)`);
    if (e.tampered) lines.push('', `Tampered by the playground (${e.tampered.ruleId}): ${e.tampered.diff.split('\n')[0]}`);
    if (e.request.body) lines.push('', 'Request:', '', fence(truncate(readableBody(e.request.body, e.request.contentType))));
    if (e.response?.body)
      lines.push('', 'Response:', '', fence(truncate(readableBody(e.response.body, e.response.contentType))));
    lines.push('');
  }
  lines.push(
    '### Occurrences',
    '',
    ...c.runs.slice(0, 10).map((x) => `- \`${x.runId}\` ${x.createdAt} · \`${x.format}\` · ${x.verdict}`),
    ...(c.runs.length > 10 ? [`- … and ${c.runs.length - 10} more`] : []),
    '',
  );
  return lines.join('\n');
}

export function renderGapIndex(clusters: GapCluster[], generatedAt: string): string {
  const lines = [
    '# Gap drafts',
    '',
    `Generated ${generatedAt} from ${clusters.reduce((n, c) => n + c.runs.length, 0)} failed runs, grouped into ${clusters.length} signatures. Only **interop** signatures get an issue draft; infrastructure failures (tunnels, DNS, timeouts) and holder refusals are listed so they are not mistaken for gaps. Review each draft, search the target repository for duplicates, then file it by hand.`,
    '',
    '| Category | Signature | Target | Runs | Formats | Draft |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const c of clusters)
    lines.push(
      `| ${c.category} | ${c.title.replace(/\|/g, '\\|')} | ${c.target} | ${c.runs.length} | ${c.formats.map((f) => `\`${f}\``).join(', ')} | ${c.category === 'interop' ? `[${slug(c)}.md](${slug(c)}.md)` : '—'} |`,
    );
  lines.push('');
  return lines.join('\n');
}
