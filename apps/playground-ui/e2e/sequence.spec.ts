import { expect, test, type Page } from '@playwright/test';
import { openSection, pickImplementation, startRun } from './helpers';

const showSequence = async (page: Page) => {
  await openSection(page, 'Protocol inspector');
  const inspector = page.getByRole('region', { name: 'Protocol inspector' });
  await inspector.getByRole('tablist', { name: 'Show messages as' }).getByRole('tab', { name: 'Sequence' }).click();
  return inspector.getByTestId('sequence-view');
};
const arrows = (view: import('@playwright/test').Locator) => view.locator('svg text.messageText');

test('the OpenID4VP sequence draws Verifier ↔ Wallet ↔ Library as the run goes, and an arrow opens its message', async ({
  page,
}) => {
  // Real-time speed, so the diagram is open while the run is still going.
  await startRun(page, { wallet: 'Mock wallet', format: 'vc+sd-jwt', simSpeed: 1 });
  const view = await showSequence(page);
  await expect(view.getByRole('tab', { name: 'OpenID4VP' })).toHaveAttribute('aria-selected', 'true');

  // Arrows appear as live events arrive: the count only grows, and ends with the result.
  const counts: number[] = [];
  await expect(async () => {
    counts.push(await arrows(view).count());
    await expect(arrows(view).last()).toContainText('Verification result', { timeout: 100 });
  }).toPass({ timeout: 40_000, intervals: [200] });
  expect(counts).toEqual([...counts].sort((a, b) => a - b));
  expect(new Set(counts.filter((c) => c > 0)).size).toBeGreaterThan(1);

  const labels = await arrows(view).allTextContents();
  expect(labels.findIndex((l) => l.includes('Request to library (inferred)'))).toBeLessThan(
    labels.findIndex((l) => l.startsWith('Presentation response')),
  );
  for (const lane of ['Inji Verify', 'Mock wallet', 'Mock wallet OpenID4VP code'])
    await expect(view.locator('.seq-diagram svg').getByText(lane, { exact: true }).first()).toBeVisible();
  await expect(view.locator('svg text.seq-inferred').first()).toBeVisible();

  await view.locator('svg text.messageText', { hasText: /^Presentation response/ }).click();
  const detail = page.getByRole('region', { name: 'Protocol inspector' });
  await expect(detail.getByText(/vp-submission\/direct-post/)).toBeVisible();
  await expect(view.locator('svg text.seq-selected')).toContainText('Presentation response');
});

test('an external issuer’s unobserved token and credential steps are drawn as inferred, not captured', async ({ page }) => {
  await page.goto('/?simSpeed=4');
  await pickImplementation(page, 'Issuer', 'Hovi Playground');
  await pickImplementation(page, 'Wallet', 'Inji Wallet (mobile)');
  await pickImplementation(page, 'Verifier', 'Inji Verify');
  await page.getByRole('radiogroup', { name: 'What to run' }).getByText('Issue only', { exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Credential format' }).getByText('dc+sd-jwt', { exact: true }).click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'I can see the credential in my wallet' }).click();
  await expect(page.getByTestId('report-verdict')).toContainText('Pass', { timeout: 20_000 });

  const view = await showSequence(page);
  await expect(view.getByRole('tab', { name: 'Full run' })).toHaveAttribute('aria-selected', 'true');
  const inferred = view.locator('svg text.seq-inferred');
  await expect(inferred).toHaveCount(2);
  await expect(inferred.first()).toContainText('Token exchange · not observed (holder confirmed)');
  await expect(view.locator('.seq-diagram svg')).toContainText('outside the Protocol Tap');
  // Only the offer was captured.
  await expect(view.locator('svg text.seq-observed')).toHaveCount(0);
  await expect(view.locator('svg text.seq-oob')).toHaveCount(1);
});

test('the diagram follows the theme', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'ldp_vc' });
  await expect(page.getByTestId('report-verdict')).toBeVisible({ timeout: 20_000 });
  const view = await showSequence(page);
  const actorFill = () => view.locator('svg rect.actor').first().evaluate((el) => getComputedStyle(el).fill);
  await expect(arrows(view).first()).toBeVisible();
  const light = await actorFill();
  await page.getByRole('group', { name: 'Theme' }).getByText('Dashdark').click();
  await expect.poll(actorFill).not.toBe(light);
  await expect(arrows(view).first()).toBeVisible();
});
