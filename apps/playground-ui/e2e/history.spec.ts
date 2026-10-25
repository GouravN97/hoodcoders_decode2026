import { expect, test } from '@playwright/test';
import { startRun } from './helpers';

const rows = (page: import('@playwright/test').Page) =>
  page.getByRole('table', { name: 'Runs' }).locator('tbody tr');

test('the sidebar opens the history, which says which runs are sample data', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History' }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('heading', { name: 'Run history' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Sample data');
  await expect(rows(page).first()).toBeVisible();
  expect(await rows(page).count()).toBe(await rows(page).filter({ hasText: 'sample' }).count());
});

test('filters by format, verdict, tamper and module version, and keeps them in the URL', async ({ page }) => {
  await page.goto('/history');
  await expect(rows(page).first()).toBeVisible();
  const total = await rows(page).count();

  await page.getByLabel('Format').selectOption('ldp_vc');
  await expect(page).toHaveURL(/format=ldp_vc/);
  await expect(rows(page)).not.toHaveCount(total);
  for (const row of await rows(page).all()) await expect(row).toContainText('ldp_vc');

  await page.getByLabel('Verdict').selectOption({ label: 'Fail' });
  await expect(rows(page)).toHaveCount(2);

  await page.reload();
  await expect(page.getByLabel('Verdict')).toHaveValue('FAIL');
  await expect(rows(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows(page)).toHaveCount(total);

  await page.getByLabel('Tamper').selectOption({ label: 'Any tamper' });
  for (const row of await rows(page).all()) await expect(row).toContainText(/T-[A-Z-]+/);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  const versions = await page.getByLabel('Verifier version').locator('option').allTextContents();
  expect(versions).toContain('0.18.2');
  await page.getByLabel('Verifier version').selectOption('0.18.2');
  for (const row of await rows(page).all()) await expect(row).toContainText(/0\.18\.2|—/);
});

test('a run started in this tab shows up as a real run at the top', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'vc+sd-jwt' });
  await expect(page.getByTestId('report-verdict')).toContainText('Pass', { timeout: 20_000 });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History' }).click();
  const first = rows(page).first();
  await expect(first).not.toContainText('sample');
  await expect(first).toContainText('Mock wallet');
  await expect(first).toContainText('Pass');
});

test('the matrix shows the latest result per combination and exports it as Markdown', async ({ page }) => {
  await page.goto('/history?tab=matrix');
  const matrix = page.getByRole('table', { name: 'Interoperability matrix' });
  await expect(matrix).toBeVisible();
  await expect(matrix).toContainText('Inji Verify');
  await expect(matrix).toContainText('— issue only');
  // Negative tests (here the wrong-type tamper) are not in the matrix unless included.
  await expect(matrix).not.toContainText('Fail (Valid)');
  await page.getByLabel('Include negative tests').check();
  await expect(matrix).toContainText('passed');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('interop-matrix.md');
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  expect(text).toContain('# Inji interoperability matrix');
  expect(text).toContain('| Issuer | Wallet | Verifier |');
  expect(text).toContain('Inji Certify 0.14.0');
  await expect(page.getByRole('button', { name: 'Copy Markdown' })).toBeVisible();
});
