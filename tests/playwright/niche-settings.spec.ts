import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

/**
 * TASK-045 — Niche settings on the project page. Needs a real authenticated
 * session and at least one project, so — like every other browser case in
 * this suite — it skips without PLAYWRIGHT_STORAGE_STATE. It never clicks
 * "Save niche settings": nothing is written to the real project. Saving,
 * resetting and the migration-missing error are covered offline in
 * tests/renderer/niche-settings.spec.ts.
 */
test.describe('Niche settings (project page, TASK-045)', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE to an authenticated test-session file.');
  test.use({ storageState });

  async function gotoNicheSettings(page: import('playwright/test').Page) {
    await page.goto('/projects');
    await page.locator('a[href^="/projects/"]').first().click();
    const section = page.getByTestId('niche-settings');
    await expect(section.getByRole('heading', { name: 'Niche settings' })).toBeVisible();
    return section;
  }

  test('shows the seven fields, pre-filled, with Add custom value / Reset to defaults / Create new Content Stream', async ({ page }) => {
    const section = await gotoNicheSettings(page);
    for (const title of ['Tone', 'Audience', 'Keywords & topics', 'Pinterest angles', 'Visual style', 'CTA', 'Sub-niches (Content Streams)']) {
      await expect(section.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await expect(section.getByText('Recommended').first()).toBeVisible();
    await expect(section.getByRole('button', { name: 'Add custom value' }).first()).toBeVisible();
    await expect(section.getByRole('button', { name: 'Reset to defaults' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Create new Content Stream' })).toBeVisible();
  });

  test('adding a custom value and disabling a recommended one are shown as unsaved changes', async ({ page }) => {
    const section = await gotoNicheSettings(page);
    await section.getByLabel('Custom tone value').fill('e2e custom tone');
    await section.getByRole('button', { name: 'Add custom value' }).first().click();
    await expect(section.getByText('e2e custom tone')).toBeVisible();
    await expect(section.getByText('Unsaved changes')).toBeVisible();
    await expect(section.getByRole('button', { name: 'Save niche settings' })).toBeEnabled();
  });

  test('a link in a custom value is rejected inline', async ({ page }) => {
    const section = await gotoNicheSettings(page);
    await section.getByLabel('Custom cta value').fill('Visit https://example.com');
    await section.getByRole('button', { name: 'Add custom value' }).last().click();
    await expect(section.getByText('Custom values cannot contain links or domain names')).toBeVisible();
  });

  test('"Create new Content Stream" opens the existing stream dialog', async ({ page }) => {
    const section = await gotoNicheSettings(page);
    await section.getByRole('button', { name: 'Create new Content Stream' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
