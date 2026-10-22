import { expect, test } from '@playwright/test';

const pageBackground = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('switches between the Noble and Dashdark themes and keeps the choice after a reload', async ({ page }) => {
  await page.goto('/');
  const themes = page.getByRole('group', { name: 'Theme' });
  await expect(themes.getByRole('radio', { name: 'Noble' })).toBeChecked();
  expect(await pageBackground(page)).toBe('rgb(249, 249, 249)');

  await themes.getByText('Dashdark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dashdark');
  expect(await pageBackground(page)).toBe('rgb(13, 9, 38)');

  // Applied by index.html before the app loads, so the page never flashes the other theme.
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dashdark');
  await expect(page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Dashdark' })).toBeChecked();

  await page.getByRole('group', { name: 'Theme' }).getByText('Noble').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  expect(await pageBackground(page)).toBe('rgb(249, 249, 249)');
});
