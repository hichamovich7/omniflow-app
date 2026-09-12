import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

test.describe('UI foundations', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE to an authenticated test-session file.');
  test.use({ storageState });

  test('dashboard smoke test exposes the workspace shell', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: /OmniFlow/i })).toBeVisible();
  });

  test('sidebar navigation exposes core workspace destinations', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Generate', exact: true }).first()).toBeVisible();
  });

  test('mobile navigation opens the navigation sheet', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'This assertion only applies to the mobile project.');
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();
  });

  test('dark mode renders the dashboard without a canvas regression', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('main')).toBeVisible();
  });
});

test.describe.skip('Shared primitives after adoption', () => {
  test('PageState supports loading, empty, error and permission variants', async () => {});
  test('ResourceHeader exposes metadata, status and actions in reading order', async () => {});
  test('BulkActions announces selection and clears it from keyboard input', async () => {});
});
