// Sample run history for `pnpm dev`, so the history page and the matrix have something to show
// before any run is started. Every sample is labelled `sample: true` and the UI says so: these are
// not results. Their outcomes mirror lanes documented in the README, but no protocol messages exist.
import {
  stepTemplateFor,
  type CredentialFormat,
  type InteropVerdict,
  type RunConfig,
  type RunDetail,
  type RunStep,
  type VerificationOutcome,
} from '@playground/shared';
import { mockCatalog } from './catalog';
import { db } from './db';

interface Sample {
  daysAgo: number;
  config: Pick<RunConfig, 'mode' | 'issuerId' | 'walletId' | 'format' | 'credentialConfigurationId' | 'expectedOutcome'> &
    Partial<RunConfig>;
  verdict: InteropVerdict;
  observed?: VerificationOutcome;
  /** Step that failed or stayed inconclusive, with its message. */
  stopped?: { step: string; status: 'failed' | 'inconclusive'; message: string };
  tamperId?: string;
}

const SAMPLES: Sample[] = [
  {
    daysAgo: 0,
    config: { mode: 'full', issuerId: 'inji-certify', walletId: 'mock-wallet', format: 'vc+sd-jwt', credentialConfigurationId: 'FarmerCredentialSdJwt', expectedOutcome: 'VALID' },
    verdict: 'PASS',
    observed: 'VALID',
  },
  {
    daysAgo: 0,
    config: { mode: 'full', issuerId: 'inji-certify', walletId: 'mock-wallet', format: 'ldp_vc', credentialConfigurationId: 'FarmerCredential', expectedOutcome: 'VALID' },
    verdict: 'PASS',
    observed: 'VALID',
  },
  {
    daysAgo: 0,
    config: { mode: 'full', issuerId: 'inji-certify', walletId: 'mock-wallet', format: 'vc+sd-jwt', credentialConfigurationId: 'FarmerCredentialSdJwt', expectedOutcome: 'INVALID', tamper: { id: 'T-SIG-FLIP' } },
    verdict: 'PASS',
    observed: 'INVALID',
    tamperId: 'T-SIG-FLIP',
  },
  {
    daysAgo: 0,
    config: { mode: 'full', issuerId: 'inji-certify', walletId: 'mock-wallet', format: 'vc+sd-jwt', credentialConfigurationId: 'FarmerCredentialSdJwt', expectedOutcome: 'INVALID', tamper: { id: 'T-WRONG-TYPE' } },
    verdict: 'FAIL',
    observed: 'VALID',
    tamperId: 'T-WRONG-TYPE',
  },
  {
    daysAgo: 1,
    config: { mode: 'full', issuerId: 'inji-certify', walletId: 'inji-wallet-mobile', format: 'vc+sd-jwt', credentialConfigurationId: 'FarmerCredentialSdJwt', expectedOutcome: 'VALID' },
    verdict: 'PASS',
    observed: 'VALID',
  },
  {
    daysAgo: 1,
    config: { mode: 'full', issuerId: 'inji-certify', walletId: 'inji-wallet-mobile', format: 'ldp_vc', credentialConfigurationId: 'FarmerCredential', expectedOutcome: 'VALID' },
    verdict: 'FAIL',
    observed: 'INVALID',
  },
  {
    daysAgo: 2,
    config: { mode: 'issue-only', issuerId: 'hovi-playground', walletId: 'inji-wallet-mobile', format: 'dc+sd-jwt', credentialConfigurationId: 'pid-sdjwt', expectedOutcome: 'VALID' },
    verdict: 'PASS_WITH_WARNINGS',
  },
  {
    daysAgo: 2,
    config: { mode: 'issue-only', issuerId: 'animo-playground', walletId: 'inji-wallet-mobile', format: 'mso_mdoc', credentialConfigurationId: 'eudi-pid-mdoc-bdr', expectedOutcome: 'VALID' },
    verdict: 'INCONCLUSIVE',
    stopped: { step: 'credential_held', status: 'inconclusive', message: 'No confirmation that the credential reached the wallet within 10 min' },
  },
  {
    daysAgo: 3,
    config: { mode: 'issue-only', issuerId: 'inji-certify', walletId: 'inji-web', format: 'ldp_vc', credentialConfigurationId: 'FarmerCredential', expectedOutcome: 'VALID', grantType: 'authorization_code' },
    verdict: 'FAIL',
    stopped: { step: 'oid4vci.token', status: 'failed', message: 'Token exchange failed: invalid_client' },
  },
];

function sampleRun(s: Sample, i: number, now: number): RunDetail {
  const createdAt = new Date(now - s.daysAgo * 86_400_000 - (i + 1) * 7 * 60_000);
  const config: RunConfig = {
    verifierId: 'inji-verify',
    grantType: 'pre-authorized_code',
    presentationFlow: 'cross-device-qr',
    ...s.config,
    labels: { sample: 'true' },
  };
  let stopped = false;
  const steps: RunStep[] = stepTemplateFor(config.mode).map((t) => {
    if (stopped) return { phase: t.phase, step: t.step, status: 'skipped' };
    if (s.stopped?.step === t.step) {
      stopped = true;
      return { phase: t.phase, step: t.step, status: s.stopped.status, error: { message: s.stopped.message } };
    }
    return { phase: t.phase, step: t.step, status: 'done' };
  });
  const tamper = s.tamperId
    ? {
        id: s.tamperId,
        label: s.tamperId === 'T-SIG-FLIP' ? 'Broken signature' : 'Wrong credential type',
        mechanism: 'wallet-hook' as const,
        expectedOutcome: 'INVALID' as const,
      }
    : undefined;
  return {
    id: crypto.randomUUID(),
    createdAt: createdAt.toISOString(),
    finishedAt: new Date(createdAt.getTime() + 40_000).toISOString(),
    trigger: 'ui',
    config,
    state: 'Reported',
    ...(s.observed ? { observedOutcome: s.observed } : {}),
    verdict: s.verdict,
    correlation: config.walletId === 'inji-web' ? 'heuristic' : 'exact',
    ...(s.stopped ? { errorSummary: s.stopped.message } : {}),
    steps,
    versions: (['issuer', 'wallet', 'verifier'] as const).map((role) => {
      const id = role === 'issuer' ? config.issuerId : role === 'wallet' ? config.walletId : config.verifierId;
      const entry = mockCatalog.find((c) => c.id === id);
      return { implementationId: id, role, version: entry?.version ?? 'unknown', displayName: entry?.displayName ?? id };
    }),
    ...(tamper ? { tamper } : {}),
    artifacts: [],
  };
}

/** Adds the sample history to the mock db, once per page load. */
export function seedSampleRuns(now = Date.now()) {
  if (db.all().some((r) => r.run.config.labels?.sample === 'true')) return;
  SAMPLES.forEach((s, i) => db.create(sampleRun(s, i, now)));
}

/** Formats the samples cover, for tests. */
export const SAMPLE_FORMATS: CredentialFormat[] = [...new Set(SAMPLES.map((s) => s.config.format))];
