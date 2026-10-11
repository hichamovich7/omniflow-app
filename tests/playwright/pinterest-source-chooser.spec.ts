import { expect, test, type Page, type Request } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

/**
 * Access to "Pinterest from an existing WordPress post" (TASK-051 UX): real
 * navigation from the Pinterest generator and the dashboard. Needs an
 * authenticated session with at least one connected WordPress site, so it
 * skips without PLAYWRIGHT_STORAGE_STATE. Nothing is generated: the test
 * fails if any AI route or any non-GET WordPress route is called.
 */
test.describe('Pinterest source chooser', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE to an authenticated test-session file.');
  test.use({ storageState });

  function watch(page: Page) {
    const forbidden: string[] = [];
    page.on('request', (request: Request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/pinterest/generate') || url.pathname.includes('/regenerate')) forbidden.push(url.pathname);
      if (url.pathname.startsWith('/api/wordpress') && request.method() !== 'GET') forbidden.push(`${request.method()} ${url.pathname}`);
      if (/openrouter\.ai|api\.openai\.com/.test(url.hostname)) forbidden.push(url.hostname);
    });
    return forbidden;
  }

  test('the generator shows the three sources and "From existing WordPress article" opens the post picker', async ({ page }) => {
    const forbidden = watch(page);
    await page.goto('/pinterest');
    const chooser = page.getByRole('navigation', { name: 'Pin source' });
    await expect(chooser).toBeVisible();
    await expect(chooser.getByRole('link', { name: /From keyword/ })).toHaveAttribute('aria-current', 'page');
    await expect(chooser.getByRole('link', { name: /From OmniFlow WordPress article/ })).toHaveAttribute('href', '/wordpress/history');
    await chooser.getByRole('link', { name: /From existing WordPress article/ }).click();
    await expect(page).toHaveURL(/\/pinterest\/from-wordpress$/);
    await expect(page.getByTestId('wordpress-post-picker')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pin source' }).getByRole('link', { name: /From existing WordPress article/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(forbidden).toEqual([]);
  });

  test('searching and selecting a post only reads WordPress; nothing is generated before "Generate Pins"', async ({ page }) => {
    const forbidden = watch(page);
    await page.goto('/pinterest/from-wordpress');
    await page.getByRole('button', { name: 'Search' }).click();
    const firstSelect = page.getByRole('list', { name: 'WordPress posts' }).getByRole('link', { name: 'Select' }).first();
    await expect(firstSelect).toBeVisible({ timeout: 30_000 });
    await firstSelect.click();
    // The post page reads WordPress server-side before the URL changes.
    await expect(page).toHaveURL(/postId=\d+/, { timeout: 60_000 });
    await expect(page.getByTestId('article-source-summary')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Generate Pins' })).toBeVisible();
    expect(forbidden).toEqual([]);
  });

  test("a connection that is not the user's is refused without any generation", async ({ page }) => {
    const forbidden = watch(page);
    await page.goto('/pinterest/from-wordpress?siteId=00000000-0000-4000-8000-000000000000&postId=1');
    await expect(page.getByText("This post can't be used")).toBeVisible();
    await expect(page.getByRole('link', { name: 'Choose another post' })).toBeVisible();
    expect(forbidden).toEqual([]);
  });

  test('dashboard quick action opens the post picker', async ({ page }) => {
    const forbidden = watch(page);
    await page.goto('/dashboard');
    await page.getByRole('link', { name: /Generate from existing WordPress article/ }).click();
    await expect(page).toHaveURL(/\/pinterest\/from-wordpress$/);
    await expect(page.getByTestId('wordpress-post-picker')).toBeVisible();
    expect(forbidden).toEqual([]);
  });
});
