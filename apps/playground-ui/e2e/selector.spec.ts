import { expect, test } from '@playwright/test';
import { pickImplementation } from './helpers';

test('Run stays disabled until an issuer, a wallet and a verifier are all chosen', async ({
  page,
}) => {
  await page.goto('/');
  const run = page.getByRole('button', { name: 'Run', exact: true });
  const missing = page.getByTestId('missing-roles');

  for (const role of ['Issuer', 'Wallet', 'Verifier'] as const) {
    await expect(
      page.getByRole('group', { name: role, exact: true }).getByRole('radio', { checked: true }),
    ).toHaveCount(0);
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
  await expect(
    page.getByRole('group', { name: 'Issuer', exact: true }).getByRole('radio', { checked: true }),
  ).toHaveCount(0);
});

test('Hovi and Animo issuers are visible and expose both external formats', async ({ page }) => {
  await page.goto('/');

  const issuers = page.getByRole('group', { name: 'Issuer', exact: true });
  await expect(issuers.getByRole('radio', { name: 'Hovi Playground', exact: true })).toBeVisible();
  await expect(issuers.getByRole('radio', { name: 'Animo Playground', exact: true })).toBeVisible();

  await pickImplementation(page, 'Issuer', 'Hovi Playground');
  await pickImplementation(page, 'Wallet', 'Inji Wallet (mobile)');
  await pickImplementation(page, 'Verifier', 'Inji Verify');
  await page
    .getByRole('radiogroup', { name: 'What to run' })
    .getByText('Issue only', { exact: true })
    .click();

  const formats = page.getByRole('radiogroup', { name: 'Credential format' });
  await expect(formats.getByText('dc+sd-jwt', { exact: true })).toBeVisible();
  await expect(formats.getByText('mso_mdoc', { exact: true })).toBeVisible();
});

test('each role row scrolls sideways when its choices do not fit', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');
  const wallets = page.getByRole('group', { name: 'Wallet', exact: true });
  const more = wallets.getByRole('button', { name: 'Show more wallets' });
  await expect(more).toBeEnabled();
  const last = page.getByTestId('choice-mock-wallet');
  await expect(last).not.toBeInViewport();
  await more.click();
  await expect(last).toBeInViewport();
  await expect(wallets.getByRole('button', { name: 'Show earlier wallets' })).toBeEnabled();
});

test('wide screens show Issuer → Wallet → Verifier as three columns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const box = async (role: string) =>
    (await page.getByRole('group', { name: role, exact: true }).boundingBox())!;
  const [issuer, wallet, verifier] = [await box('Issuer'), await box('Wallet'), await box('Verifier')];
  expect(issuer.x).toBeLessThan(wallet.x);
  expect(wallet.x).toBeLessThan(verifier.x);
  expect(Math.abs(issuer.y - verifier.y)).toBeLessThan(2);
  // In a column every choice is visible without sideways scrolling.
  await expect(page.getByTestId('choice-mock-wallet')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Show more wallets' })).toHaveCount(0);
});
