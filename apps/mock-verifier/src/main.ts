// Mock verifier (plan §8.4): a generic, standards-based OpenID4VP draft-23 relying party that is
// not Inji, so full runs can end at a non-Inji party and every check it makes is visible.
import { configFromEnv } from './config.ts';
import { createVerifierKey } from './keys.ts';
import { createVerifierServer } from './server.ts';
import { TransactionStore } from './transactions.ts';

const config = configFromEnv();
const key = await createVerifierKey(config.clientId);
const store = new TransactionStore();
const server = createVerifierServer(config, key, store);
setInterval(() => store.prune(), 600_000).unref();

server.listen(config.port, () =>
  console.log(
    `[verifier] mock verifier on :${config.port}${config.basePath} as ${config.clientId} (public ${config.publicUrl}; trusted issuers: ${config.trustedIssuers.join(', ') || 'none configured'})`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
