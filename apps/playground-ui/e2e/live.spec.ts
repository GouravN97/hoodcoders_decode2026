// Live runs against the Docker Compose stack: real BFF and Protocol Tap, real Inji Certify and
// Inji Verify, and the headless mock wallet. Run with PLAYGROUND_LIVE_URL=http://localhost:8100 pnpm e2e.
import { expect, test } from '@playwright/test';
import { openSection, pickImplementation, step } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

async function liveRun(
  page: import('@playwright/test').Page,
  opts: { format: 'ldp_vc' | 'vc+sd-jwt'; expected?: 'Valid' | 'Invalid'; tamper?: string },
) {
  await page.goto('/');
  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await pickImplementation(page, 'Wallet', 'Mock wallet');
  await pickImplementation(page, 'Verifier', 'Inji Verify');
  await page
    .getByRole('radiogroup', { name: 'Credential format' })
    .getByText(opts.format, { exact: true })
    .click();
  if (opts.tamper) await page.getByLabel('Tamper').selectOption({ label: opts.tamper });
  if (opts.expected)
    await page
      .getByRole('radiogroup', { name: 'Expected result' })
      .getByText(opts.expected, { exact: true })
      .click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+/);
}

test('SD-JWT: Certify → mock wallet → Inji Verify ends Valid, with every message captured', async ({
  page,
}) => {
  await liveRun(page, { format: 'vc+sd-jwt' });
  const banner = page.getByTestId('verification-result');
  await expect(banner).toHaveAttribute('data-outcome', 'VALID', { timeout: 90_000 });
  for (const id of [
    'oid4vci.token',
    'oid4vci.credential',
    'oid4vp.request_object',
    'oid4vp.response',
  ]) {
    await expect(step(page, id)).toHaveAttribute('data-status', 'done');
  }

  await openSection(page, 'Protocol inspector');
  const list = page.getByRole('list', { name: 'Protocol messages' });
  for (const name of [
    'Credential offer',
    'Authorization request',
    'Presentation definition',
    'vp_token',
    'Verification result',
  ]) {
    await expect(list.getByText(name, { exact: true }).first()).toBeVisible();
  }

  await openSection(page, 'Report');
  const report = page.getByRole('region', { name: 'Run report' });
  await expect(report.getByTestId('report-verdict')).toContainText('Pass');
  await expect(
    report.locator('div', { has: page.locator('dt', { hasText: /^Proof type$/ }) }).locator('dd'),
  ).toHaveText('ES256');
});

test('SD-JWT with a tampered signature ends Invalid, which the run expected', async ({ page }) => {
  await liveRun(page, { format: 'vc+sd-jwt', expected: 'Invalid' });
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-outcome', 'INVALID', {
    timeout: 90_000,
  });
  await openSection(page, 'Report');
  await expect(
    page.getByRole('region', { name: 'Run report' }).getByTestId('report-verdict'),
  ).toContainText('Pass');
});

test('SD-JWT with an edited claim: the inspector shows the change and Inji Verify rejects it', async ({ page }) => {
  await liveRun(page, { format: 'vc+sd-jwt', tamper: 'Edited claim (T-CLAIM-EDIT)' });
  const banner = page.getByTestId('verification-result');
  await expect(banner).toHaveAttribute('data-outcome', 'INVALID', { timeout: 90_000 });
  await expect(banner.getByTestId('tamper-verdict')).toContainText('rejected it as expected');
  await openSection(page, 'Protocol inspector');
  const inspector = page.getByRole('region', { name: 'Protocol inspector' });
  await inspector.getByText('Tampered · T-CLAIM-EDIT').click();
  await expect(inspector.getByRole('table', { name: 'Tampered fields' })).toContainText('(edited)');
});
