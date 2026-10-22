// CompatibilityResolver (plan §8.2): intersects capability descriptors to predict whether a
// combination should work, with reasons. Same rules as the UI's mock resolver.
import type { CatalogEntry, Prediction, RunConfig } from '@playground/shared';

export function predict(config: RunConfig, catalog: CatalogEntry[]): Prediction {
  const issuer = catalog.find((c) => c.id === config.issuerId && c.role === 'issuer');
  const wallet = catalog.find((c) => c.id === config.walletId && c.role === 'wallet');
  const verifier = catalog.find((c) => c.id === config.verifierId && c.role === 'verifier');
  if (!issuer || !wallet || !verifier) {
    return {
      status: 'unknown',
      reasons: [{ severity: 'warn', message: 'Pick an issuer, a wallet and a verifier' }],
    };
  }
  const reasons: Prediction['reasons'] = [];
  for (const entry of [issuer, wallet, verifier]) {
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
  const grants = wallet.capabilities.grantTypes;
  if (grants && !grants.includes(config.grantType)) {
    reasons.push({
      role: 'wallet',
      severity: 'error',
      message: `${wallet.displayName} does not support the ${config.grantType} grant`,
    });
  }
  const wq = wallet.capabilities.queryLanguages ?? [];
  const vq = verifier.capabilities.queryLanguages ?? [];
  if (wq.length && vq.length && !wq.some((q) => vq.includes(q))) {
    reasons.push({
      severity: 'error',
      message: `Wallet speaks ${wq.join(', ')}; verifier requests ${vq.join(', ')}`,
    });
  }
  const flows = wallet.capabilities.presentationFlows ?? [];
  if (flows.length && !flows.includes(config.presentationFlow)) {
    reasons.push({
      role: 'wallet',
      severity: 'error',
      message: `${wallet.displayName} does not support ${config.presentationFlow}`,
    });
  }
  if (config.expectedOutcome === 'INVALID' && !wallet.capabilities.supportsTamper) {
    reasons.push({
      role: 'wallet',
      severity: 'warn',
      message: `${wallet.displayName} cannot tamper with a credential, so an Invalid result needs a broken credential from elsewhere`,
    });
  }
  if (config.expectedOutcome === 'EXPIRED') {
    reasons.push({
      role: 'issuer',
      severity: 'warn',
      message: 'Valid-but-expired needs a short-lived credential configuration on the issuer',
    });
  }
  if (wallet.id === 'inji-web') {
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
