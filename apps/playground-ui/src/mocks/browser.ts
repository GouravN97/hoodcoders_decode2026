import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { rememberSimSpeedFromUrl } from './simulator';

export async function startMocks() {
  rememberSimSpeedFromUrl();
  await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass', quiet: true });
}
