import { expect, test } from '@playwright/test';
import { openSection, pickImplementation, startRun } from './helpers';

test('an mDoc from Certify’s mock mDoc issuer is presented to the mock verifier and decoded in the inspector', async ({ page }) => {
  await startRun(page, { issuer: 'Inji Certify (mock mDoc)', wallet: 'Mock wallet', verifier: 'Mock verifier', format: 'mso_mdoc' });

  const result = page.getByTestId('verification-result');
  await expect(result).toHaveAttribute('data-outcome', 'VALID', { timeout: 20_000 });
  const checks = result.getByTestId('verifier-checks');
  for (const stage of ['issuer-signature', 'issuer-trust', 'digests', 'holder-binding', 'validity'])
    await expect(checks.locator(`[data-stage="${stage}"]`)).toHaveAttribute('data-status', 'pass');
  // The wallet presents a plain DeviceResponse document; Certify's {docType, issuerSigned} wrapper
  // only appears in the credential response, where the inspector reports it.
  await expect(checks.locator('[data-stage="format"]')).toHaveAttribute('data-status', 'pass');

  await openSection(page, 'Protocol inspector');
  const inspector = page.getByRole('region', { name: 'Protocol inspector' });
  const list = inspector.getByRole('list', { name: 'Protocol messages' });
  await list.locator('button', { hasText: 'Credential request' }).first().click();
  await expect(inspector.getByText('/mdoc/v1/certify/issuance/credential', { exact: false }).first()).toBeVisible();
  await inspector.getByRole('tab', { name: 'Response' }).click();
  const elements = inspector.getByTestId('mdoc-elements').first();
  await expect(elements).toContainText('family_name');
  await expect(elements.getByText(/✓ #\d+ matches/).first()).toBeVisible();
  await expect(inspector.getByTestId('mdoc-observations').first()).toContainText('{docType, issuerSigned}');
});

test('an edited mDoc element fails the digest check', async ({ page }) => {
  await startRun(page, {
    issuer: 'Inji Certify (mock mDoc)',
    wallet: 'Mock wallet',
    verifier: 'Mock verifier',
    format: 'mso_mdoc',
    tamper: 'Edited claim (T-CLAIM-EDIT)',
  });
  const result = page.getByTestId('verification-result');
  await expect(result).toHaveAttribute('data-outcome', 'INVALID', { timeout: 20_000 });
  await expect(result.getByTestId('verifier-checks').locator('[data-stage="digests"]')).toHaveAttribute('data-status', 'fail');
});

test('mso_mdoc stays selectable with Inji Verify, and the prediction says why it cannot verify it', async ({ page }) => {
  await page.goto('/');
  await pickImplementation(page, 'Issuer', 'Inji Certify (mock mDoc)');
  await pickImplementation(page, 'Wallet', 'Mock wallet');
  await pickImplementation(page, 'Verifier', 'Inji Verify');
  await page.getByRole('radiogroup', { name: 'Credential format' }).getByText('mso_mdoc', { exact: true }).click();
  await expect(page.getByText('Inji Verify does not verify mso_mdoc; run Issue only, or choose Mock verifier')).toBeVisible();
});
