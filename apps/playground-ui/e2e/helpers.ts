import { expect, type Page } from '@playwright/test';

/** Picks an implementation card in a role's row by its display name, or clears the row with 'None'. */
export async function pickImplementation(page: Page, role: 'Issuer' | 'Wallet' | 'Verifier', name: string) {
  const row = page.getByRole('group', { name: role, exact: true });
  if (name === 'None') {
    await row.getByRole('button', { name: `Clear ${role.toLowerCase()}` }).click();
    return;
  }
  await row.locator('label').filter({ has: page.getByRole('radio', { name, exact: true }) }).click();
  await expect(row.getByRole('radio', { name, exact: true })).toBeChecked();
}

/** Opens the selector with mock runs sped up, picks roles and settings, and presses Run. */
export async function startRun(
  page: Page,
  opts: {
    wallet: string;
    /** Issuer card name (default Inji Certify). */
    issuer?: string;
    /** Verifier card name (default Inji Verify). */
    verifier?: string;
    format: 'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc';
    expected?: 'Valid' | 'Invalid' | 'Valid but expired';
    scenario?: string;
    /** Tamper picker option, e.g. 'Edited claim (T-CLAIM-EDIT)'. */
    tamper?: string;
    /** How much faster than real time the mock run plays (default 4). */
    simSpeed?: number;
  },
) {
  const qs = new URLSearchParams({ simSpeed: String(opts.simSpeed ?? 4), ...(opts.scenario ? { scenario: opts.scenario } : {}) });
  await page.goto(`/?${qs}`);
  await pickImplementation(page, 'Issuer', opts.issuer ?? 'Inji Certify');
  await pickImplementation(page, 'Wallet', opts.wallet);
  await pickImplementation(page, 'Verifier', opts.verifier ?? 'Inji Verify');
  await page.getByRole('radiogroup', { name: 'Credential format' }).getByText(opts.format, { exact: true }).click();
  if (opts.tamper) await page.getByLabel('Tamper').selectOption({ label: opts.tamper });
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
