// CompatibilityResolver (plan §8.2): intersects capability descriptors to predict whether a
// combination should work, with reasons. Pure, so the BFF and the UI's mocks give the same answer.
import type { CatalogEntry, Prediction } from './catalog';
import type { RunConfig } from './domain';
import { runUsesRole } from './run';
import { expiredVariantFor, tamperDefinition } from './tamper';

export interface PredictContext {
  /** T-NONCE-REPLAY: whether an earlier run has a vp_token to replay; undefined if unknown. */
  replayAvailable?: boolean;
}

export function predict(
  config: RunConfig,
  catalog: CatalogEntry[],
  context: PredictContext = {},
): Prediction {
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
  const tamper = config.tamper ? tamperDefinition(config.tamper.id) : undefined;
  if (config.tamper) reasons.push(...tamperReasons(config, issuer, wallet, context));
  if (
    presenting &&
    !config.tamper &&
    config.expectedOutcome === 'INVALID' &&
    !wallet.capabilities.supportsTamper
  ) {
    reasons.push({
      role: 'wallet',
      severity: 'warn',
      message: `${wallet.displayName} cannot tamper with a credential, so an Invalid result needs a broken credential from elsewhere`,
    });
  }
  const alreadyExpired =
    expiredVariantFor(issuer, config.credentialConfigurationId) === config.credentialConfigurationId;
  if (
    presenting &&
    config.expectedOutcome === 'EXPIRED' &&
    tamper?.id !== 'T-EXPIRED' &&
    !alreadyExpired
  ) {
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

/** Why a run's tamper can or cannot be applied with this selection. */
function tamperReasons(
  config: RunConfig,
  issuer: CatalogEntry,
  wallet: CatalogEntry,
  context: PredictContext,
): Prediction['reasons'] {
  const def = tamperDefinition(config.tamper?.id);
  if (!def) return [{ severity: 'error', message: `Unknown tamper ${config.tamper?.id}` }];
  if (!runUsesRole(config.mode, 'verifier'))
    return [{ severity: 'error', message: `${def.id} only applies to runs that present the credential` }];
  const reasons: Prediction['reasons'] = [];
  if (!def.formats.includes(config.format))
    reasons.push({ severity: 'error', message: `${def.id} does not apply to ${config.format} credentials` });
  if (def.mechanism === 'wallet-hook' && !wallet.capabilities.supportsTamper) {
    reasons.push({
      role: 'wallet',
      severity: 'error',
      message: `${wallet.displayName} cannot apply ${def.id}; only a wallet with tamper hooks (the mock wallet) can`,
    });
  }
  if (def.id === 'T-EXPIRED') {
    const variant = expiredVariantFor(issuer, config.credentialConfigurationId);
    reasons.push(
      variant
        ? {
            role: 'issuer',
            severity: 'info',
            message: `${issuer.displayName} issues ${variant}, a copy signed with validity in the past`,
          }
        : {
            role: 'issuer',
            severity: 'error',
            message: `${issuer.displayName} has no expired copy of ${config.credentialConfigurationId}`,
          },
    );
  }
  if (def.id === 'T-NONCE-REPLAY' && context.replayAvailable === false) {
    reasons.push({
      severity: 'error',
      message: `No earlier untampered ${config.format} run passed this verifier, so there is no vp_token to replay. Run a normal full run first.`,
    });
  }
  if (def.id === 'T-WRONG-TYPE') {
    reasons.push({
      severity: 'info',
      message:
        'A verifier may refuse a wrong-type presentation as Invalid or Rejected; answering Valid would be a finding',
    });
  }
  return reasons;
}
