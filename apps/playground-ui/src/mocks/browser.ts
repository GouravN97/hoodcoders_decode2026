import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { seedSampleRuns } from './samples';
import { rememberSimSpeedFromUrl } from './simulator';

export async function startMocks() {
  rememberSimSpeedFromUrl();
  seedSampleRuns();
  await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass', quiet: true });
}
