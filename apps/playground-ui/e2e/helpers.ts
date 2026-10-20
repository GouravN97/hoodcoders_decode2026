import { expect, type Page } from '@playwright/test';

/** Picks an implementation from a role's dropdown by its display name. */
export async function pickImplementation(page: Page, role: 'Issuer' | 'Wallet' | 'Verifier', name: string) {
  await page.getByRole('combobox', { name: role, exact: true }).selectOption({ label: name });
}

/** Opens the selector with mock runs sped up, picks roles and settings, and presses Run. */
export async function startRun(
  page: Page,
  opts: { wallet: string; format: 'ldp_vc' | 'vc+sd-jwt'; expected?: 'Valid' | 'Invalid' | 'Valid but expired'; scenario?: string },
) {
  const qs = new URLSearchParams({ simSpeed: '4', ...(opts.scenario ? { scenario: opts.scenario } : {}) });
  await page.goto(`/?${qs}`);
  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await pickImplementation(page, 'Wallet', opts.wallet);
  await pickImplementation(page, 'Verifier', 'Inji Verify');
  await page.getByRole('radiogroup', { name: 'Credential format' }).getByText(opts.format, { exact: true }).click();
  if (opts.expected) {
    await page.getByRole('radiogroup', { name: 'Expected result' }).getByText(opts.expected, { exact: true }).click();
  }
  await expect(page.getByText('Expected to work')).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+/);
}

/** Opens one of the run page's side-menu sections. */
export async function openSection(page: Page, name: 'Issued credential' | 'Protocol inspector' | 'Report') {
  const tab = page.getByRole('tablist', { name: 'Run details' }).getByRole('tab', { name: new RegExp(`^${name}`) });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

export const step = (page: Page, id: string) => page.locator(`[data-step="${id}"]`);
