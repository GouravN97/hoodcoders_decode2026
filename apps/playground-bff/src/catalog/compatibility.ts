// CompatibilityResolver (plan §8.2): intersects capability descriptors to predict whether a
// combination should work, with reasons. Same rules as the UI's mock resolver.
import { runUsesRole, type CatalogEntry, type Prediction, type RunConfig } from '@playground/shared';

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
  // Only the roles this run mode talks to can make it fail: an issue-only run never contacts the
  // verifier, a present-only run never contacts the issuer.
  const issuing = runUsesRole(config.mode, 'issuer');
  const presenting = runUsesRole(config.mode, 'verifier');
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
  const grants = wallet.capabilities.grantTypes;
  if (issuing && grants && !grants.includes(config.grantType)) {
    reasons.push({
      role: 'wallet',
      severity: 'error',
      message: `${wallet.displayName} does not support the ${config.grantType} grant`,
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
  if (presenting && config.expectedOutcome === 'INVALID' && !wallet.capabilities.supportsTamper) {
    reasons.push({
      role: 'wallet',
      severity: 'warn',
      message: `${wallet.displayName} cannot tamper with a credential, so an Invalid result needs a broken credential from elsewhere`,
    });
  }
  if (presenting && config.expectedOutcome === 'EXPIRED') {
    reasons.push({
      role: 'issuer',
      severity: 'warn',
      message: issuing
        ? 'Valid-but-expired needs a short-lived credential configuration on the issuer'
        : 'Valid-but-expired needs the wallet to hold a credential that has already expired',
    });
  }
  if (!issuing && wallet.capabilities.automation !== 'headless') {
    reasons.push({
      role: 'wallet',
      severity: 'info',
      message: `Make sure ${wallet.displayName} already holds the credential; you confirm it before the request is sent`,
    });
  }
  if (issuing && wallet.id === 'inji-web') {
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
