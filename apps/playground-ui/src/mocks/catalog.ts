// Mock catalog: built from the real /catalog/*.yaml files, so adding a YAML entry adds a
// card in the selector even before the BFF exists.
import {
  CatalogFileSchema,
  runUsesRole,
  type CatalogEntry,
  type HealthStatus,
  type Prediction,
  type RunConfig,
} from '@playground/shared';
import { parse } from 'yaml';

const files = import.meta.glob('../../../../catalog/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Versions a ModuleVersionProbe would report; mock values. */
const MOCK_VERSIONS: Record<string, string> = {
  'inji-certify': '0.12.1',
  'inji-wallet-mobile': '0.17.0',
  'inji-web': '0.13.0',
  'inji-verify': '0.18.1',
  'mock-wallet': '0.0.0-dev',
};
const MOCK_HEALTH: Record<string, HealthStatus> = {};

export const mockCatalog: CatalogEntry[] = Object.entries(files)
  .map(([path, text]): CatalogEntry | null => {
    const parsed = CatalogFileSchema.safeParse(parse(text));
    if (!parsed.success) {
      console.error(`Invalid catalog file ${path}`, parsed.error);
      return null;
    }
    const d = parsed.data;
    return { ...d, health: MOCK_HEALTH[d.id] ?? 'up', version: MOCK_VERSIONS[d.id] ?? 'unknown' };
  })
  .filter((e): e is CatalogEntry => e !== null)
  .sort((a, b) =>
    a.vendor === b.vendor
      ? a.displayName.localeCompare(b.displayName)
      : a.vendor === 'inji'
        ? -1
        : 1,
  );

/** Mock CompatibilityResolver: intersects capability descriptors. */
export function predict(config: RunConfig): Prediction {
  const issuer = mockCatalog.find((c) => c.id === config.issuerId);
  const wallet = mockCatalog.find((c) => c.id === config.walletId);
  const verifier = mockCatalog.find((c) => c.id === config.verifierId);
  const reasons: Prediction['reasons'] = [];
  if (!issuer || !wallet || !verifier) {
    return {
      status: 'unknown',
      reasons: [{ severity: 'warn', message: 'Pick an issuer, a wallet and a verifier' }],
    };
  }
  // Same rule as the BFF: only roles the run mode talks to count.
  const presenting = runUsesRole(config.mode, 'verifier');
  const issuing = runUsesRole(config.mode, 'issuer');
  for (const entry of [issuer, wallet, verifier].filter((e) => runUsesRole(config.mode, e.role))) {
    if (!entry.capabilities.formats.includes(config.format)) {
      reasons.push({
        role: entry.role,
        severity: 'error',
        message: `${entry.displayName} does not support ${config.format}`,
      });
    }
    if (entry.health === 'down') {
      reasons.push({
        role: entry.role,
        severity: 'error',
        message: `${entry.displayName} is not responding`,
      });
    }
  }
  const issuerProfiles = issuer.capabilities.vciProfiles ?? [];
  const walletProfiles = wallet.capabilities.vciProfiles ?? [];
  if (
    issuing &&
    issuerProfiles.length > 0 &&
    walletProfiles.length > 0 &&
    !issuerProfiles.some((profile) => walletProfiles.includes(profile))
  ) {
    reasons.push({
      severity: 'error',
      message: `Issuer speaks ${issuerProfiles.join(', ')}; wallet speaks ${walletProfiles.join(', ')}`,
    });
  }
  const wq = wallet.capabilities.queryLanguages ?? [];
  const vq = verifier.capabilities.queryLanguages ?? [];
  if (presenting && wq.length && vq.length && !wq.some((q) => vq.includes(q))) {
    reasons.push({
      severity: 'error',
      message: `Wallet speaks ${wq.join(', ')}; verifier requests ${vq.join(', ')}`,
    });
  }
  const flows = wallet.capabilities.presentationFlows ?? [];
  if (presenting && flows.length && !flows.includes(config.presentationFlow)) {
    reasons.push({
      role: 'wallet',
      severity: 'error',
      message: `${wallet.displayName} does not support ${config.presentationFlow}`,
    });
  }
  if (runUsesRole(config.mode, 'issuer') && wallet.id === 'inji-web') {
    reasons.push({
      role: 'wallet',
      severity: 'info',
      message: 'Issuance starts inside Inji Web, so messages are linked to this run heuristically',
    });
  }
  if (wallet.capabilities.automation === 'human-in-the-loop') {
    reasons.push({
      role: 'wallet',
      severity: 'info',
      message: 'Needs a person to scan QR codes and confirm steps',
    });
  }
  return {
    status: reasons.some((r) => r.severity === 'error') ? 'unsupported' : 'supported',
    reasons,
  };
}
