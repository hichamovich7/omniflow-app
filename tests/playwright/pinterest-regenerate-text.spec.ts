import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
const generationUrl = process.env.PLAYWRIGHT_PIN_GENERATION_URL;

/**
 * "Regenerate text" (TASK-076) on the real /pinterest/[id] page. The POST is
 * intercepted and answered by the test: no AI call, nothing written.
 */
test.describe('Pinterest Regenerate text', () => {
  test.skip(
    !storageState || !generationUrl,
    'Set PLAYWRIGHT_STORAGE_STATE and PLAYWRIGHT_PIN_GENERATION_URL to an authenticated generation.'
  );
  test.use({ storageState });

  test('visible on the grid and in the Pin dialog, and calls POST /regenerate-text', async ({ page }) => {
    const requests: string[] = [];
    await page.route('**/api/pinterest/pins/*/regenerate-text', async (route) => {
      requests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ data: null, error: { message: 'Intercepted by the test', code: 'invalid_pin_plan' } }),
      });
    });

    await page.goto(generationUrl!);
    const card = page.getByTestId('pin-card').first();
    const gridButton = card.getByRole('button', { name: 'Regenerate text', exact: true });
    await expect(gridButton).toBeVisible();
    await expect(gridButton).toHaveText('Regenerate text');

    await gridButton.click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toMatch(/^POST \/api\/pinterest\/pins\/[0-9a-f-]{36}\/regenerate-text$/);
    await expect(page.getByText('Intercepted by the test')).toBeVisible();

    // The click did not open the dialog; opening it shows the same button.
    await card.locator('h3').click();
    const dialog = page.getByRole('dialog');
    const dialogButton = dialog.getByRole('button', { name: 'Regenerate text', exact: true });
    await expect(dialogButton).toBeVisible();
    await dialogButton.click();
    await expect.poll(() => requests.length).toBe(2);
  });
});
