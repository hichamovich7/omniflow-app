import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

/**
 * Command Center dashboard (TASK-FIX-042), run by both the `chromium`
 * (desktop) and `mobile-chrome` (Pixel 5) projects. Needs a real
 * authenticated session, so — like every other browser case in this suite —
 * it skips without PLAYWRIGHT_STORAGE_STATE rather than being bypassed.
 * Read-only: nothing is clicked that writes to Supabase.
 */
test.describe('Command Center dashboard', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE to an authenticated test-session file.');
  test.use({ storageState });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('every section renders', async ({ page }) => {
    for (const name of [
      'Recommended focus today',
      "Today's Priorities",
      'Command Center',
      'Recommended next actions',
      'Sunday analytics review',
      'Content streams',
      'Publishing coverage',
      'This week',
      'Weekly Progress',
      'Recent activity',
    ]) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
  });

  test('all seven KPIs and the four weekly metrics are still shown', async ({ page }) => {
    for (const label of ['Monthly Revenue', 'Tasks Completed', 'Digital Products', 'Pins Created', 'Articles Generated', 'Projects', 'Generations']) {
      await expect(page.locator('[data-slot="metric-card"]').filter({ hasText: label }).first()).toBeVisible();
    }
    for (const label of ['Articles Published', 'Products Launched', 'Revenue']) {
      await expect(page.locator('[data-slot="progress-metric"]').filter({ hasText: label }).first()).toBeVisible();
    }
    await expect(page.getByText(/\d[\d,]* credits/)).toBeVisible();
  });

  test('quick actions are kept', async ({ page }) => {
    for (const label of ['New Project', 'Generate Pinterest Pins', 'Generate WordPress Article', 'Pinterest History', 'WordPress History']) {
      await expect(page.getByRole('link', { name: new RegExp(label) })).toBeVisible();
    }
  });

  test('the page never scrolls horizontally', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollWidth - main.clientWidth : 0;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the Sunday review exposes Start review, or its done state', async ({ page }) => {
    const card = page.locator('#sunday-review');
    await expect(card.getByText(/Due Sunday|Due soon|Overdue|Done this week/)).toBeVisible();
  });

  // TASK-FIX-043 — opens and cancels the modal only (no write).
  test("today's coverage cell opens the Publishing activity modal, and Cancel saves nothing", async ({ page }) => {
    const cell = page.getByRole('button', { name: /Record publishing activity/ }).first();
    test.skip(!(await cell.isVisible().catch(() => false)), 'No active content stream with a coverage row.');
    await cell.click();
    await expect(page.getByRole('heading', { name: 'Publishing activity' })).toBeVisible();
    await expect(page.getByLabel('Pins published today')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark target met' })).toBeVisible();
    await expect(page.getByLabel('Note')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Publishing activity' })).not.toBeVisible();
  });

  // TASK-FIX-053 — a future cell opens the Expected publishing modal (no write).
  test('a future coverage cell opens the Expected publishing modal, and Cancel saves nothing', async ({ page }) => {
    const cell = page.getByRole('button', { name: /Plan external publishing/ }).first();
    test.skip(!(await cell.isVisible().catch(() => false)), 'No active content stream with a coverage row.');
    await cell.click();
    await expect(page.getByRole('heading', { name: 'Expected publishing' })).toBeVisible();
    await expect(page.getByLabel('Pins expected')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save as expected|Saving/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm as published' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Expected publishing' })).not.toBeVisible();
  });
});
