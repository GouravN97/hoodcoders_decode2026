import { expect, test } from '@playwright/test';
import { openSection, pickImplementation, startRun } from './helpers';

test('a run that ends at the mock verifier lists every check and a second opinion from Inji Verify', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', verifier: 'Mock verifier', format: 'vc+sd-jwt' });

  const result = page.getByTestId('verification-result');
  await expect(result).toHaveAttribute('data-outcome', 'VALID', { timeout: 20_000 });
  await expect(result).toContainText('Mock verifier result');
  const checks = result.getByTestId('verifier-checks');
  await expect(checks.locator('[data-stage="holder-binding"]')).toHaveAttribute('data-status', 'pass');
  await expect(checks.locator('[data-stage="issuer-signature"]')).toContainText('Issuer signature');
  await expect(result.getByTestId('second-opinion')).toHaveAttribute('data-agrees', 'true');
  await expect(result.getByTestId('second-opinion')).toContainText('from Inji Verify on the credential alone: Valid');

  // The verifier's messages are recorded under its own paths on the Verify host.
  await openSection(page, 'Protocol inspector');
  const inspector = page.getByRole('region', { name: 'Protocol inspector' });
  await expect(inspector.getByText('/mock-verifier/oid4vp/response/', { exact: false }).first()).toBeVisible();
  await expect(inspector.getByText('/v1/verify/vc-verification', { exact: false }).first()).toBeVisible();

  await openSection(page, 'Report');
  const report = page.getByRole('region', { name: 'Run report' });
  await expect(report.getByTestId('report-verdict')).toContainText('Pass');
  await expect(report.getByTestId('second-opinion')).toContainText('agrees with Mock verifier');
});

test('the mock verifier names the failing check of a tampered presentation', async ({ page }) => {
  await startRun(page, {
    wallet: 'Mock wallet',
    verifier: 'Mock verifier',
    format: 'vc+sd-jwt',
    tamper: 'Edited claim (T-CLAIM-EDIT)',
  });
  const result = page.getByTestId('verification-result');
  await expect(result).toHaveAttribute('data-outcome', 'INVALID', { timeout: 20_000 });
  await expect(result.getByTestId('verifier-checks').locator('[data-stage="disclosures"]')).toHaveAttribute('data-status', 'fail');
  await expect(result.getByTestId('second-opinion')).toHaveAttribute('data-agrees', 'true');
});

test('a replayed presentation is not compared with a credential-only second opinion', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', verifier: 'Mock verifier', format: 'vc+sd-jwt' });
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-outcome', 'VALID', { timeout: 20_000 });
  // Same tab: the mock run above is the one to replay.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'New run' }).click();
  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await pickImplementation(page, 'Wallet', 'Mock wallet');
  await pickImplementation(page, 'Verifier', 'Mock verifier');
  await page.getByRole('radiogroup', { name: 'Credential format' }).getByText('vc+sd-jwt', { exact: true }).click();
  await page.getByLabel('Tamper').selectOption({ label: 'Replayed presentation (T-NONCE-REPLAY)' });
  await expect(page.getByText('Expected to work')).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const result = page.getByTestId('verification-result');
  await expect(result).toHaveAttribute('data-outcome', 'INVALID', { timeout: 20_000 });
  await expect(result.getByTestId('verifier-checks').locator('[data-stage="holder-binding"]')).toHaveAttribute('data-status', 'fail');
  await expect(result.getByTestId('second-opinion')).toHaveAttribute('data-agrees', 'not-compared');
});

test('an Inji Verify run gets its second opinion from the mock verifier', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'vc+sd-jwt' });
  const result = page.getByTestId('verification-result');
  await expect(result).toHaveAttribute('data-outcome', 'VALID', { timeout: 20_000 });
  await expect(result.getByTestId('second-opinion')).toContainText('from Mock verifier on the credential alone: Valid');
  // Inji Verify does not report its checks one by one.
  await expect(result.getByTestId('verifier-checks')).toHaveCount(0);
});
