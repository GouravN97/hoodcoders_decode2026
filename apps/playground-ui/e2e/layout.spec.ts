import { expect, test } from '@playwright/test';
import { startRun } from './helpers';

const noHorizontalScroll = async (page: import('@playwright/test').Page) => {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
};

test('selector and run page fit the viewport without horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Issuer', exact: true })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/selector-${test.info().project.name}.png`, fullPage: true });

  await startRun(page, { wallet: 'Mock wallet', format: 'vc+sd-jwt' });
  await expect(page.getByTestId('verification-result')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('report-verdict')).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/run-${test.info().project.name}.png`, fullPage: true });
});

test('inspector detail stays inside its card on narrow screens', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'vc+sd-jwt' });
  await expect(page.getByTestId('report-verdict')).toBeVisible({ timeout: 20_000 });
  const card = await page.getByRole('region', { name: 'Protocol inspector' }).boundingBox();
  const panel = await page.getByRole('tabpanel').boundingBox();
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(card!.x + card!.width + 1);
});
