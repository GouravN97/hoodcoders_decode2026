import { expect, test } from '@playwright/test';
import { openSection, pickImplementation, startRun } from './helpers';

const expected = (page: import('@playwright/test').Page) =>
  page.getByRole('radiogroup', { name: 'Expected result' }).getByRole('radio', { checked: true });

test('the tamper picker is offered only for a wallet with tamper hooks, and sets the expected result', async ({
  page,
}) => {
  await page.goto('/');
  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await pickImplementation(page, 'Verifier', 'Inji Verify');

  await pickImplementation(page, 'Wallet', 'Inji Wallet (mobile)');
  await expect(page.getByLabel('Tamper')).toHaveCount(0);
  await expect(expected(page)).toHaveValue('VALID');

  await pickImplementation(page, 'Wallet', 'Mock wallet');
  const tamper = page.getByLabel('Tamper');
  await expect(tamper).toBeVisible();
  await tamper.selectOption({ label: 'Edited claim (T-CLAIM-EDIT)' });
  await expect(expected(page)).toHaveValue('INVALID');

  await tamper.selectOption({ label: 'Expired credential (T-EXPIRED)' });
  await expect(expected(page)).toHaveValue('EXPIRED');
  await expect(page.getByText(/The issuer issues FarmerCredential(SdJwt)?Expired/)).toBeVisible();

  await tamper.selectOption({ index: 0 });
  await expect(expected(page)).toHaveValue('VALID');

  // Switching to a wallet without hooks drops the tamper and its expectation.
  await tamper.selectOption({ label: 'Broken signature (T-SIG-FLIP)' });
  await pickImplementation(page, 'Wallet', 'Inji Wallet (mobile)');
  await expect(expected(page)).toHaveValue('VALID');
});

test('a tamper and its expected result are not remembered across visits', async ({ page }) => {
  await page.goto('/');
  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await pickImplementation(page, 'Wallet', 'Mock wallet');
  await pickImplementation(page, 'Verifier', 'Inji Verify');
  await page.getByLabel('Tamper').selectOption({ label: 'Broken signature (T-SIG-FLIP)' });
  await expect(expected(page)).toHaveValue('INVALID');
  await page.reload();
  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await pickImplementation(page, 'Wallet', 'Mock wallet');
  await pickImplementation(page, 'Verifier', 'Inji Verify');
  await expect(page.getByLabel('Tamper')).toHaveValue('');
  await expect(expected(page)).toHaveValue('VALID');
});

test('a tampered run shows the before/after diff and says whether the verifier caught it', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'vc+sd-jwt', tamper: 'Edited claim (T-CLAIM-EDIT)' });

  const banner = page.getByTestId('verification-result');
  await expect(banner).toHaveAttribute('data-outcome', 'INVALID', { timeout: 20_000 });
  await expect(banner.getByTestId('tamper-verdict')).toContainText(
    'T-CLAIM-EDIT edited claim: Inji Verify rejected it as expected',
  );

  await openSection(page, 'Protocol inspector');
  const inspector = page.getByRole('region', { name: 'Protocol inspector' });
  await inspector.getByText('Tampered · T-CLAIM-EDIT').click();
  const diff = inspector.getByTestId('tamper-diff');
  await expect(diff).toBeVisible();
  await expect(diff.getByRole('table', { name: 'Tampered fields' })).toContainText('disclosure fullName');
  await expect(diff.getByRole('table', { name: 'Tampered fields' })).toContainText('Ramesh Kumar (edited)');
  await diff.getByText('Before and after, decoded').click();
  await expect(diff.getByText('Before (as issued)')).toBeVisible();
  // The edited disclosure's digest is not in the issuer JWT's _sd list.
  await expect(diff.getByText('✗ not in _sd')).toBeVisible();

  await openSection(page, 'Report');
  const report = page.getByRole('region', { name: 'Run report' });
  await expect(report.getByTestId('report-verdict')).toContainText('Pass');
  await expect(report.getByTestId('tamper-verdict')).toContainText('rejected it as expected');
});

test('a replay run replays an earlier vp_token', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'vc+sd-jwt' });
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-outcome', 'VALID', { timeout: 20_000 });

  // Same tab: the mock run above is the one to replay.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'New run' }).click();
  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await pickImplementation(page, 'Wallet', 'Mock wallet');
  await pickImplementation(page, 'Verifier', 'Inji Verify');
  await page.getByRole('radiogroup', { name: 'Credential format' }).getByText('vc+sd-jwt', { exact: true }).click();
  await page.getByLabel('Tamper').selectOption({ label: 'Replayed presentation (T-NONCE-REPLAY)' });
  await expect(page.getByLabel('Replay from')).toContainText('Newest earlier run');
  await expect(page.getByText('Expected to work')).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-outcome', 'INVALID', {
    timeout: 20_000,
  });
  await openSection(page, 'Protocol inspector');
  await page.getByRole('region', { name: 'Protocol inspector' }).getByText('Tampered · T-NONCE-REPLAY').click();
  await expect(page.getByTestId('tamper-diff')).toContainText('Resubmitted a vp_token captured in an earlier run');
});
