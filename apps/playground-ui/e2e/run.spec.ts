import { expect, test } from '@playwright/test';
import { openSection, startRun, step } from './helpers';

test('JSON-LD run with Inji Wallet: QR, manual confirm, credential card, Valid banner, report', async ({
  page,
}) => {
  await startRun(page, { wallet: 'Inji Wallet (mobile)', format: 'ldp_vc' });

  // Issuance: the offer is shown as a QR code for the phone.
  await expect(page.getByRole('heading', { name: 'Scan to receive the credential' })).toBeVisible();
  await expect(page.getByTestId('delivery-qr')).toBeVisible();
  await expect(step(page, 'oid4vci.credential')).toHaveAttribute('data-status', 'done', {
    timeout: 15_000,
  });

  // Hold: a person confirms the credential reached the wallet.
  await openSection(page, 'Issued credential');
  const card = page.getByRole('region', { name: 'Issued credential' });
  await expect(card.getByText('Ramesh Kumar')).toBeVisible();
  await expect(card.getByText('Ed25519Signature2020')).toBeVisible();
  await page.getByRole('button', { name: 'I can see the credential in my wallet' }).click();

  // Present & verify.
  await expect(page.getByRole('heading', { name: 'Scan to share the credential' })).toBeVisible({
    timeout: 15_000,
  });
  const banner = page.getByTestId('verification-result');
  await expect(banner).toHaveAttribute('data-outcome', 'VALID', { timeout: 20_000 });
  await expect(banner.getByRole('paragraph').filter({ hasText: /^Valid$/ })).toBeVisible();

  // Inspector: the five named messages are listed in order.
  await openSection(page, 'Protocol inspector');
  const list = page.getByRole('list', { name: 'Protocol messages' });
  for (const name of [
    'Credential offer',
    'Authorization request',
    'Presentation definition',
    'vp_token',
    'Verification result',
  ]) {
    await expect(list.getByText(name, { exact: true }).first()).toBeVisible();
  }
  const rows = list.locator('[data-exchange-id]');
  const seqs = await rows
    .locator('span.font-mono')
    .filter({ hasText: /^#\d+$/ })
    .allTextContents();
  expect(seqs.map((s) => Number(s.slice(1)))).toEqual(
    [...seqs.map((s) => Number(s.slice(1)))].sort((a, b) => a - b),
  );

  // Report: all summary fields, then both downloads.
  await openSection(page, 'Report');
  const report = page.getByRole('region', { name: 'Run report' });
  await expect(report.getByTestId('report-verdict')).toContainText('Pass');
  const fields = report.getByRole('definition');
  await expect(report.getByRole('term')).toHaveText([
    'Run mode',
    'Issuer',
    'Wallet',
    'Verifier',
    'Format',
    'Proof type',
    'Outcome',
    'Error detail',
    'Credential',
    'Started / finished',
    'Correlation',
  ]);
  await expect(fields.nth(5)).toHaveText('Ed25519Signature2020');

  for (const [label, ext] of [
    ['Markdown', 'md'],
    ['JSON', 'json'],
  ] as const) {
    const download = page.waitForEvent('download');
    await report.getByRole('button', { name: label }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`^run-[0-9a-f-]+\\.${ext}$`));
    const path = await file.path();
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(path, 'utf8');
    if (ext === 'md') expect(text).toContain('| Proof type | Ed25519Signature2020 |');
    else
      expect(JSON.parse(text)).toMatchObject({
        verdict: 'PASS',
        format: 'ldp_vc',
        observedOutcome: 'VALID',
      });
  }
});

test('inspector shows each message raw and decoded, with secrets masked', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'vc+sd-jwt' });
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-outcome', 'VALID', {
    timeout: 20_000,
  });

  await openSection(page, 'Protocol inspector');
  const inspector = page.getByRole('region', { name: 'Protocol inspector' });
  const list = inspector.getByRole('list', { name: 'Protocol messages' });

  // Token exchange: access token masked in Raw, revealed on demand.
  await list.locator('button', { hasText: 'Token exchange' }).first().click();
  await inspector.getByRole('tab', { name: 'Response' }).click();
  await inspector.getByRole('tab', { name: 'Raw' }).click();
  await expect(inspector.getByText(/"access_token": "eyJh••••/)).toBeVisible();
  await inspector.getByLabel('Reveal secrets').check();
  await expect(inspector.getByText(/••••/)).toHaveCount(0);

  // Credential response: SD-JWT disclosures decoded and digests checked.
  await list.locator('button', { hasText: 'Credential request' }).first().click();
  await inspector.getByRole('tab', { name: 'Response' }).click();
  await inspector.getByRole('tab', { name: 'Decoded' }).click();
  await expect(inspector.getByText('Disclosures (10)')).toBeVisible();
  await expect(inspector.getByText('✓ matches')).toHaveCount(10);

  // vp_token: SD-JWT with key binding inside the direct_post form.
  await list.locator('button', { hasText: 'vp_token' }).first().click();
  await expect(inspector.getByText('vp_token', { exact: true }).last()).toBeVisible();
  await expect(inspector.getByText('Key-binding JWT · header')).toBeVisible();

  // Selection lives in the URL so reports can deep-link to a message.
  await expect(page).toHaveURL(/[?&]ex=/);
});

test('Valid-but-Expired SD-JWT run passes when expiry is expected', async ({ page }) => {
  await startRun(page, {
    wallet: 'Mock wallet',
    format: 'vc+sd-jwt',
    expected: 'Valid but expired',
  });
  const banner = page.getByTestId('verification-result');
  await expect(banner).toHaveAttribute('data-outcome', 'EXPIRED', { timeout: 20_000 });
  await expect(
    banner.getByRole('paragraph').filter({ hasText: /^Valid but expired$/ }),
  ).toBeVisible();
  await expect(page.getByTestId('report-verdict')).toContainText('Pass');
  await expect(
    page.getByRole('region', { name: 'Run report' }).getByText('SD-JWT VC'),
  ).toBeVisible();
});

test('Invalid result is shown when a tampered credential is expected', async ({ page }) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'ldp_vc', expected: 'Invalid' });
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-outcome', 'INVALID', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('report-verdict')).toContainText('Pass');
});

test('a failed token exchange names the failed step on screen and in the report', async ({
  page,
}) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'ldp_vc', scenario: 'fail-at-token' });
  const alert = page.getByRole('alert', { name: /Token exchange failed/ });
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(alert).toContainText('invalid_grant');
  await expect(alert).toContainText('HTTP 400');
  await expect(step(page, 'oid4vci.token')).toHaveAttribute('data-status', 'failed');

  const report = page.getByRole('region', { name: 'Run report' });
  await expect(report.getByTestId('report-verdict')).toContainText('Fail');
  await expect(report.getByText(/Token exchange:/)).toBeVisible();

  // Jumping to the failed message switches the side menu to the inspector.
  await alert.getByRole('button', { name: 'Show the message' }).click();
  await expect(page.getByRole('tab', { name: /^Protocol inspector/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page
      .getByRole('region', { name: 'Protocol inspector' })
      .getByText('400', { exact: true })
      .last(),
  ).toBeVisible();
});

test('cancelling a run stops it and still produces a report', async ({ page }) => {
  await startRun(page, { wallet: 'Inji Wallet (mobile)', format: 'ldp_vc' });
  await expect(
    page.getByRole('button', { name: 'I can see the credential in my wallet' }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Cancel run' }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(page.getByTestId('report-verdict')).toHaveText('Inconclusive');
  await expect(page.getByTestId('report-verdict-detail')).toContainText('Cancelled before it finished');
});

test('side menu shows one section at a time and remembers the choice in the URL', async ({
  page,
}) => {
  await startRun(page, { wallet: 'Mock wallet', format: 'vc+sd-jwt' });
  await expect(page.getByTestId('report-verdict')).toBeVisible({ timeout: 20_000 });

  // A finished run opens on the report; the other sections are hidden.
  const credential = page.getByRole('region', { name: 'Issued credential' });
  const inspector = page.getByRole('region', { name: 'Protocol inspector' });
  const report = page.getByRole('region', { name: 'Run report' });
  await expect(report).toBeVisible();
  await expect(credential).toBeHidden();
  await expect(inspector).toBeHidden();
  // 14 protocol messages plus the second opinion the mock verifier gives on the credential.
  await expect(page.getByRole('tab', { name: /^Protocol inspector/ })).toContainText('15 messages');

  await openSection(page, 'Issued credential');
  await expect(credential).toBeVisible();
  await expect(report).toBeHidden();
  await expect(page).toHaveURL(/[?&]view=credential/);

  // Arrow keys move through the menu.
  await page.keyboard.press('ArrowDown');
  await expect(inspector).toBeVisible();
  await expect(credential).toBeHidden();

  await expect(page).toHaveURL(/[?&]view=inspector/);
});
