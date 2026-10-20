import { expect, test } from '@playwright/test';
import { pickImplementation } from './helpers';

test('Run stays disabled until an issuer, a wallet and a verifier are all chosen', async ({ page }) => {
  await page.goto('/');
  const run = page.getByRole('button', { name: 'Run', exact: true });
  const missing = page.getByTestId('missing-roles');

  for (const role of ['Issuer', 'Wallet', 'Verifier'] as const) {
    await expect(page.getByRole('combobox', { name: role, exact: true })).toHaveValue('');
  }
  await expect(run).toBeDisabled();
  await expect(missing).toHaveText('Choose an issuer, a wallet and a verifier to run');

  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await pickImplementation(page, 'Wallet', 'Mock wallet');
  await expect(missing).toHaveText('Choose a verifier to run');
  await expect(run).toBeDisabled();

  await pickImplementation(page, 'Verifier', 'Inji Verify');
  await expect(run).toBeEnabled();

  // Back to None blocks the run again.
  await pickImplementation(page, 'Wallet', 'None');
  await expect(missing).toHaveText('Choose a wallet to run');
  await expect(run).toBeDisabled();
});

test('role choices are not remembered across visits', async ({ page }) => {
  await page.goto('/');
  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Issuer', exact: true })).toHaveValue('');
});
