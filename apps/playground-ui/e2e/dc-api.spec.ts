import { expect, test, type Page } from '@playwright/test';
import { pickImplementation } from './helpers';

// No wallet in the catalog advertises the Digital Credentials API, so these runs use a stubbed
// navigator.credentials.get (page.addInitScript) or a browser without the API.
async function startDcApiRun(page: Page) {
  await page.goto('/?simSpeed=4');
  await pickImplementation(page, 'Issuer', 'Inji Certify');
  await pickImplementation(page, 'Wallet', 'Mock wallet');
  await pickImplementation(page, 'Verifier', 'Mock verifier');
  await page.getByRole('radiogroup', { name: 'Credential format' }).getByText('vc+sd-jwt', { exact: true }).click();
  await page.getByLabel('How to present').selectOption({ label: 'Digital Credentials API' });
  await expect(
    page.getByText('No wallet in the catalog advertises the Digital Credentials API; it is tested only with a stubbed browser API'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+/);
}

test('a stubbed browser wallet answers the DC API request and the mock verifier checks the response', async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as Record<string, unknown>).DigitalCredential = class DigitalCredential {};
    Object.defineProperty(navigator, 'credentials', {
      value: {
        get: async (options: { digital: { requests: Array<{ protocol: string; data: { dcql_query: { credentials: Array<{ id: string }> } } }> } }) => {
          const request = options.digital.requests[0]!;
          (globalThis as Record<string, unknown>).__dcApiRequest = request;
          return { protocol: request.protocol, data: { vp_token: { [request.data.dcql_query.credentials[0]!.id]: ['eyJhbGciOiJFUzI1NiJ9.e30.c3R1Yg~'] } } };
        },
      },
    });
  });
  await startDcApiRun(page);

  await page.getByRole('button', { name: 'Request with browser wallet' }).click({ timeout: 20_000 });
  const result = page.getByTestId('verification-result');
  await expect(result).toHaveAttribute('data-outcome', 'VALID', { timeout: 20_000 });
  await expect(result.getByTestId('verifier-checks').locator('[data-stage="state"]')).toHaveAttribute('data-status', 'skip');
  // The page sent an unsigned OpenID4VP 1.0 request with a DCQL query.
  const sent = await page.evaluate(() => (globalThis as Record<string, unknown>).__dcApiRequest as { protocol: string; data: Record<string, unknown> });
  expect(sent.protocol).toBe('openid4vp-v1-unsigned');
  expect(sent.data).toMatchObject({ response_mode: 'dc_api', response_type: 'vp_token' });
});

test('a browser without the Digital Credentials API is told so instead of being offered a button', async ({ page }) => {
  // Current Chromium ships the API, so take it away.
  await page.addInitScript(() => {
    delete (globalThis as Record<string, unknown>).DigitalCredential;
  });
  await startDcApiRun(page);
  await expect(page.getByTestId('dc-api-unsupported')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Request with browser wallet' })).toHaveCount(0);
});

test('a refused browser request fails the delivery step with the browser’s error', async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as Record<string, unknown>).DigitalCredential = class DigitalCredential {};
    Object.defineProperty(navigator, 'credentials', {
      value: { get: async () => Promise.reject(Object.assign(new Error('The user declined'), { name: 'NotAllowedError' })) },
    });
  });
  await startDcApiRun(page);
  await page.getByRole('button', { name: 'Request with browser wallet' }).click({ timeout: 20_000 });
  await expect(page.locator('[data-step="request_delivered"]')).toHaveAttribute('data-status', 'failed', { timeout: 20_000 });
  await expect(page.getByText(/NotAllowedError: The user declined/).first()).toBeVisible();
});
