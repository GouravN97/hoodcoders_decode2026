import { expect, test } from '@playwright/test';
import { startRun } from './helpers';

// Runs in the phone-sized "mobile" project (Pixel 7): the wallet is on the same device.
test('on a phone, a wallet link is a button and the QR code waits behind a toggle', async ({ page }) => {
  await startRun(page, { wallet: 'Inji Wallet (mobile)', format: 'vc+sd-jwt' });
  const open = page.getByTestId('open-in-wallet');
  await expect(open).toBeVisible({ timeout: 20_000 });
  await expect(open).toHaveAttribute('href', /^openid-credential-offer:\/\//);
  await expect(page.getByTestId('delivery-qr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show QR code instead' }).click();
  await expect(page.getByTestId('delivery-qr')).toBeVisible();
});
