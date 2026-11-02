import { expect, test, type Page } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

/**
 * TASK-092 — one-page project workspace, in the chromium (desktop) and
 * mobile-chrome projects. Read-only: dialogs are cancelled, nothing is saved.
 * Skips without PLAYWRIGHT_STORAGE_STATE like every other browser case.
 */
test.describe('Project workspace (TASK-092)', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE to an authenticated test-session file.');
  test.use({ storageState });

  async function gotoFirstProject(page: Page) {
    await page.goto('/projects');
    await page.locator('a[href^="/projects/"]').first().click();
    await expect(page.getByRole('heading', { name: 'Brand Profile' })).toBeVisible();
  }

  async function expectNoHorizontalScroll(page: Page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  test('blocks in the validated order, navigation and side column, no horizontal scroll', async ({ page }) => {
    await gotoFirstProject(page);
    const tops = await Promise.all(
      ['#brand', '#wordpress', '#niche', '#pinterest'].map((id) => page.locator(id).evaluate((el) => el.getBoundingClientRect().top))
    );
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    await expect(page.getByRole('navigation', { name: 'Project sections' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quick links' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('Niche settings is folded by default and unfolds', async ({ page }) => {
    await gotoFirstProject(page);
    const toggle = page.locator('#niche').getByRole('button', { name: 'Niche settings' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('"+ Stream" on an account opens a prefilled dialog; Cancel saves nothing', async ({ page }) => {
    await gotoFirstProject(page);
    const account = page.getByTestId('workspace-account').first();
    test.skip((await account.count()) === 0, 'This project has no Pinterest account yet.');
    await account.getByRole('button', { name: 'Stream', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Add Content Stream' })).toBeVisible();
    await expect(page.getByTestId('stream-destinations')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Add Content Stream' })).not.toBeVisible();
  });
});
