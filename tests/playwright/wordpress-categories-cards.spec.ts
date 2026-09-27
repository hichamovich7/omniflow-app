import { expect, test, type Page } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

/**
 * Compact / expandable project cards on /wordpress/categories. Needs a real
 * session with at least one project, so it skips without
 * PLAYWRIGHT_STORAGE_STATE. Read-only: no category is created, edited or
 * deleted.
 */
test.describe('WordPress Categories — compact cards', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE.');
  test.use({ storageState });

  const cards = (page: Page) => page.getByTestId('category-card');
  const firstToggle = (page: Page) => cards(page).first().getByRole('button', { name: /^(Show|Hide) details for / });

  async function open(page: Page) {
    await page.goto('/wordpress/categories');
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('omniflow:wp-category-card-open:')) localStorage.removeItem(key);
      }
    });
    await page.reload();
    await expect(cards(page).first()).toBeVisible();
  }

  test('compact by default, opens and closes with aria-expanded', async ({ page }) => {
    await open(page);
    for (const card of await cards(page).all()) {
      await expect(card).toHaveAttribute('data-open', 'false');
    }
    const toggle = firstToggle(page);
    const panelId = await toggle.getAttribute('aria-controls');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`#${panelId}`)).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAccessibleName(/^Hide details for /);
    await expect(page.locator(`#${panelId}`)).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`#${panelId}`)).toBeHidden();
  });

  test('state is remembered after a reload', async ({ page }) => {
    await open(page);
    await firstToggle(page).click();
    await page.reload();
    await expect(firstToggle(page)).toHaveAttribute('aria-expanded', 'true');
  });

  test('Expand all / Collapse all', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Expand all' }).click();
    for (const card of await cards(page).all()) await expect(card).toHaveAttribute('data-open', 'true');
    await page.getByRole('button', { name: 'Collapse all' }).click();
    for (const card of await cards(page).all()) await expect(card).toHaveAttribute('data-open', 'false');
  });

  test('New Category opens its dialog without toggling the card', async ({ page }) => {
    await open(page);
    await cards(page).first().getByRole('button', { name: 'New Category' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(cards(page).first()).toHaveAttribute('data-open', 'false');
    await page.keyboard.press('Escape');
  });

  test('works when localStorage throws', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('SecurityError');
        },
      });
    });
    await page.goto('/wordpress/categories');
    const toggle = firstToggle(page);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('no horizontal scroll', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Expand all' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
