import { expect, test, type Page } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;
// A completed WordPress article (generation id) owned by the test account.
const articleId = process.env.PLAYWRIGHT_WP_ARTICLE_ID;

/**
 * Social Content Studio (TASK-044 phases 1-2): /wordpress/[id] → Pinterest
 * form pre-filled from the article on /pinterest/create. Needs a real
 * session and a real completed article, so it skips without
 * PLAYWRIGHT_STORAGE_STATE / PLAYWRIGHT_WP_ARTICLE_ID. The generation route
 * is always mocked — no AI call, no Pin written.
 */
test.describe('Social Content Studio (TASK-044)', () => {
  test.skip(!storageState || !articleId, 'Set PLAYWRIGHT_STORAGE_STATE and PLAYWRIGHT_WP_ARTICLE_ID.');
  test.use({ storageState });

  const studio = (page: Page) => page.getByTestId('social-content-studio');

  test('shows six platforms, Pinterest active and the others disabled', async ({ page }) => {
    await page.goto(`/wordpress/${articleId}`);
    await expect(studio(page).getByRole('heading', { name: 'Social Content Studio' })).toBeVisible();
    for (const label of ['Pinterest', 'Facebook', 'Instagram', 'Reels', 'TikTok', 'Medium']) {
      await expect(studio(page).getByText(label, { exact: true })).toBeVisible();
    }
    await expect(studio(page).getByRole('link', { name: 'Generate Pinterest content' })).toBeVisible();
    await expect(studio(page).getByRole('button', { name: /^(Coming soon|Planned)$/ })).toHaveCount(5);
    for (const button of await studio(page).getByRole('button', { name: /^(Coming soon|Planned)$/ }).all()) {
      await expect(button).toBeDisabled();
    }
  });

  test('clicking an unavailable platform sends no request', async ({ page }) => {
    await page.goto(`/wordpress/${articleId}`);
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

  test('Pinterest redirects to the pre-filled page without any generation request', async ({ page }) => {
    await page.goto(`/wordpress/${articleId}`);
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/pinterest')) apiCalls.push(request.url());
    });
    await studio(page).getByRole('link', { name: 'Generate Pinterest content' }).click();
    await expect(page).toHaveURL(new RegExp(`/pinterest/create\\?source=wordpress&articleId=${articleId}`));
    await expect(page.getByTestId('article-source-summary')).toBeVisible();
    await expect(page.getByLabel('Keyword')).not.toHaveValue('');
    await expect(page.locator('#pins')).toContainText('5');
    await expect(page.getByLabel(/destination url/i)).toHaveCount(0);
    expect(apiCalls).toEqual([]);
  });

  test('Generate Pins sends the article id and never a destination URL', async ({ page }) => {
    let body: Record<string, unknown> | null = null;
    await page.route('**/api/pinterest/generate', async (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 422, json: { data: null, error: { message: 'Mock plan failure', code: 'invalid_pin_plan' } } });
    });
    await page.goto(`/pinterest/create?source=wordpress&articleId=${articleId}`);
    await page.getByRole('button', { name: 'Photo Only' }).click();
    await page.getByRole('button', { name: 'Generate Pins' }).click();
    await expect(page.getByText('Mock plan failure').first()).toBeVisible();
    expect(body).not.toBeNull();
    expect(body!.wordpressArticleId).toBe(articleId);
    expect(body!.pinsRequested).toBe(5);
    expect(body).not.toHaveProperty('websiteUrl');
    expect(body).not.toHaveProperty('pinterestUrl');
    expect(JSON.stringify(body)).not.toMatch(/https?:\/\//);
  });

  test('an unknown article shows an error state', async ({ page }) => {
    await page.goto('/pinterest/create?source=wordpress&articleId=00000000-0000-4000-8000-000000000000');
    await expect(page.getByText("This article can't be used")).toBeVisible();
  });
});
