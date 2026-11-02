import { expect, test, type Page } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

/**
 * TASK-091 — Pinterest Accounts page, Content Stream destinations and the
 * Pinterest form's dependent lists, in the chromium (desktop) and
 * mobile-chrome projects. Read-only: every dialog is cancelled, nothing is
 * created or generated. Skips without PLAYWRIGHT_STORAGE_STATE like every
 * other browser case of this suite.
 */
test.describe('Pinterest accounts (TASK-091)', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE to an authenticated test-session file.');
  test.use({ storageState });

  async function expectNoHorizontalScroll(page: Page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  test('the accounts page shows the hierarchy and fits the viewport', async ({ page }) => {
    await page.goto('/pinterest-accounts');
    await expect(page.getByRole('heading', { name: 'Pinterest Accounts' })).toBeVisible();
    await expect(page.getByText('Project → Pinterest Account → Content Stream → Board → Section').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add account' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('opening and cancelling "Add account" creates nothing', async ({ page }) => {
    await page.goto('/pinterest-accounts');
    const cards = page.getByTestId('pinterest-account-card');
    const before = await cards.count();
    await page.getByRole('button', { name: 'Add account' }).click();
    await expect(page.getByRole('heading', { name: 'Add Pinterest account' })).toBeVisible();
    await expect(page.getByText('never asks for a Pinterest password')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Add Pinterest account' })).not.toBeVisible();
    await expect(cards).toHaveCount(before);
  });

  test('the Content Stream dialog edits Pinterest destinations', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('a[href^="/projects/"]').first().click();
    await expect(page.getByRole('heading', { name: 'Pinterest', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add content stream' }).first().click();
    await expect(page.getByLabel('Pinterest account')).toBeVisible();
    await expect(page.getByTestId('stream-destinations')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('the Pinterest form offers the account list (or the legacy fields)', async ({ page }) => {
    await page.goto('/pinterest');
    const picker = page.getByTestId('pinterest-destination-picker');
    await expect(picker).toBeVisible();
    await expect(picker.getByLabel('Pinterest account')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
