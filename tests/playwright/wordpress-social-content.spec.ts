import { expect, test, type Page } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
// A completed WordPress article (generation id) owned by the test account.
const articleId = process.env.PLAYWRIGHT_WP_ARTICLE_ID;

/**
 * Social Content Studio phase 1 (TASK-044) on /wordpress/[id]. Needs a real
 * session and a real completed article, so it skips without
 * PLAYWRIGHT_STORAGE_STATE / PLAYWRIGHT_WP_ARTICLE_ID. The generation route is
 * always mocked — no AI call.
 */
test.describe('Social Content Studio (TASK-044)', () => {
  test.skip(!storageState || !articleId, 'Set PLAYWRIGHT_STORAGE_STATE and PLAYWRIGHT_WP_ARTICLE_ID.');
  test.use({ storageState });

  const studio = (page: Page) => page.getByTestId('social-content-studio');

  test.beforeEach(async ({ page }) => {
    await page.goto(`/wordpress/${articleId}`);
  });

  test('shows six platforms, Pinterest active and the others disabled', async ({ page }) => {
    await expect(studio(page).getByRole('heading', { name: 'Social Content Studio' })).toBeVisible();
    for (const label of ['Pinterest', 'Facebook', 'Instagram', 'Reels', 'TikTok', 'Medium']) {
      await expect(studio(page).getByText(label, { exact: true })).toBeVisible();
    }
    await expect(studio(page).getByRole('button', { name: 'Generate Pinterest content' })).toBeEnabled();
    await expect(studio(page).getByRole('button', { name: /^(Coming soon|Planned)$/ })).toHaveCount(5);
    for (const button of await studio(page).getByRole('button', { name: /^(Coming soon|Planned)$/ }).all()) {
      await expect(button).toBeDisabled();
    }
  });

  test('clicking an unavailable platform sends no request', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/')) requests.push(request.url());
    });
    for (const id of ['facebook', 'instagram', 'reels', 'tiktok', 'medium']) {
      await page.locator(`[data-platform="${id}"] button`).click({ force: true });
    }
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
  });

  test('generates Pinterest content with loading state and shows the result', async ({ page }) => {
    let body: unknown = null;
    await page.route('**/api/wordpress/*/social', async (route) => {
      body = route.request().postDataJSON();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        json: {
          data: {
            platform: 'pinterest',
            keyword: 'mock keyword',
            language: 'en',
            articleTitle: 'Mock article',
            featuredImageUrl: null,
            pins: [{ angle: 'curiosity', title: 'Mock Pin title', description: 'Mock description', keywords: 'a, b', board: 'Mock board' }],
          },
          error: null,
        },
      });
    });

    await studio(page).getByRole('button', { name: 'Generate Pinterest content' }).click();
    await expect(studio(page).getByText('Generating Pinterest content from this article…')).toBeVisible();
    await expect(studio(page).getByText('Mock Pin title')).toBeVisible();
    expect(body).toEqual({ platform: 'pinterest' });
  });

  test('shows the API error message', async ({ page }) => {
    await page.route('**/api/wordpress/*/social', (route) =>
      route.fulfill({ status: 422, json: { data: null, error: { message: 'Mock plan failure', code: 'invalid_pin_plan' } } })
    );
    await studio(page).getByRole('button', { name: 'Generate Pinterest content' }).click();
    await expect(studio(page).getByRole('alert')).toContainText('Mock plan failure');
  });
});
