import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
// A completed WordPress article (generation id) owned by the test account.
const articleId = process.env.PLAYWRIGHT_WP_ARTICLE_ID;

/**
 * TASK-046 — custom number of Pins + "Rewrite article". Needs a real session
 * (PLAYWRIGHT_STORAGE_STATE), and a completed article for the rewrite cases
 * (PLAYWRIGHT_WP_ARTICLE_ID); skipped otherwise. Every generation route is
 * mocked — no AI call, no row written, nothing published.
 */
test.describe('Custom number of Pins (TASK-046)', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE.');
  test.use({ storageState });

  test('a custom value of 6 is sent; 0 and 31 are refused before any request', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await page.route('**/api/pinterest/generate', async (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 422, json: { data: null, error: { message: 'Mock plan failure', code: 'invalid_pin_plan' } } });
    });
    await page.goto('/pinterest/create?keyword=clay%20coasters');
    await page.getByRole('button', { name: 'Photo Only' }).click();
    await page.locator('#pins').click();
    await page.getByRole('option', { name: 'Custom…' }).click();
    const custom = page.getByTestId('pins-custom-input');

    for (const invalid of ['0', '31']) {
      await custom.fill(invalid);
      await page.getByRole('button', { name: 'Generate Pins' }).click();
      await expect(page.getByText('Choose between 1 and 30 Pins.')).toBeVisible();
    }
    expect(bodies).toEqual([]);

    await custom.fill('6');
    await page.getByRole('button', { name: 'Generate Pins' }).click();
    await expect(page.getByText('Mock plan failure').first()).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].pinsRequested).toBe(6);
    expect(bodies[0]).not.toHaveProperty('websiteUrl');
  });
});

test.describe('Rewrite article (TASK-046)', () => {
  test.skip(!storageState || !articleId, 'Set PLAYWRIGHT_STORAGE_STATE and PLAYWRIGHT_WP_ARTICLE_ID.');
  test.use({ storageState });

  test('the button asks for confirmation; Cancel sends nothing', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/rewrite')) calls.push(request.url());
    });
    await page.goto(`/wordpress/${articleId}`);
    await page.getByTestId('rewrite-article-button').click();
    await expect(page.getByRole('dialog', { name: 'Rewrite this article?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(300);
    expect(calls).toEqual([]);
  });

  test('confirming shows the progress state, then the error without leaving the page', async ({ page }) => {
    let body: unknown = null;
    await page.route(`**/api/wordpress/${articleId}/rewrite`, async (route) => {
      body = route.request().postDataJSON();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ status: 500, json: { data: null, error: { message: 'Mock rewrite failure. Your current version is unchanged.', code: 'generation_failed' } } });
    });
    await page.goto(`/wordpress/${articleId}`);
    await page.getByTestId('rewrite-article-button').click();
    await page.getByTestId('rewrite-article-confirm').click();
    await expect(page.getByRole('status').filter({ hasText: 'Rewriting the article' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Mock rewrite failure').first()).toBeVisible();
    expect(body).toEqual({ confirm: true });
    await expect(page).toHaveURL(new RegExp(`/wordpress/${articleId}$`));
  });
});
