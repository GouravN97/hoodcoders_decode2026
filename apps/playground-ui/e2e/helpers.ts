import { expect, type Page } from '@playwright/test';

/** Clicks an implementation card like a person would (its radio is visually hidden), then checks it took. */
async function pickImplementation(page: Page, name: RegExp) {
  const radio = page.getByRole('radio', { name });
  await page.locator('label').filter({ has: radio }).click();
  await expect(radio).toBeChecked();
}

/** Opens the selector with mock runs sped up, picks roles and settings, and presses Run. */
export async function startRun(
  page: Page,
  opts: { wallet: RegExp; format: 'ldp_vc' | 'vc+sd-jwt'; expected?: 'Valid' | 'Invalid' | 'Valid but expired'; scenario?: string },
) {
  const qs = new URLSearchParams({ simSpeed: '4', ...(opts.scenario ? { scenario: opts.scenario } : {}) });
  await page.goto(`/?${qs}`);
  await pickImplementation(page, /Inji Certify/);
  await pickImplementation(page, opts.wallet);
  await pickImplementation(page, /Inji Verify/);
  await page.getByRole('radiogroup', { name: 'Credential format' }).getByText(opts.format, { exact: true }).click();
  if (opts.expected) {
    await page.getByRole('radiogroup', { name: 'Expected result' }).getByText(opts.expected, { exact: true }).click();
  }
  await expect(page.getByText('Expected to work')).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+/);
}

export const step = (page: Page, id: string) => page.locator(`[data-step="${id}"]`);
