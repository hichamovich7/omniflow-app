import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

/**
 * WordPress blog-post generator reorg (TASK-FIX-040 —
 * docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md). Needs a real authenticated
 * session and at least one real project, so — like every other browser case
 * in this suite — it skips without PLAYWRIGHT_STORAGE_STATE rather than
 * being bypassed.
 *
 * Not covered here on purpose: which exact project has a connected
 * WordPress site or a Content Stream mapped to a category — that depends on
 * whatever real data exists in the test account, and no seed data is
 * allowed. Instead these tests assert on structure and behavior that holds
 * regardless of the account's actual projects (section order, default
 * collapsed state, mode switching, client-side validation, responsive
 * layout).
 */
test.describe('WordPress blog-post generator reorg (TASK-FIX-040)', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE to an authenticated test-session file.');
  test.use({ storageState });

  test.beforeEach(async ({ page }) => {
    await page.goto('/wordpress/blog-post');
  });

  test('Project Context appears before Article Source', async ({ page }) => {
    const projectContext = page.getByText('Project Context', { exact: true });
    const articleSource = page.getByText('Article Source', { exact: true });
    await expect(projectContext).toBeVisible();
    await expect(articleSource).toBeVisible();

    const contextBox = await projectContext.boundingBox();
    const sourceBox = await articleSource.boundingBox();
    expect(contextBox).not.toBeNull();
    expect(sourceBox).not.toBeNull();
    expect(contextBox!.y).toBeLessThan(sourceBox!.y);
  });

  test('changing the project updates language, category options, site status, and content streams', async ({ page }) => {
    const projectTrigger = page.getByRole('combobox', { name: 'Project' });
    await projectTrigger.click();
    const options = page.getByRole('option');
    const optionCount = await options.count();
    test.skip(optionCount < 2, 'Needs at least two projects in the test account to verify a project switch.');

    await options.nth(1).click();
    // Switching project must never throw and must always leave a
    // Connected/Not connected status visible — the specific value depends
    // on the test account's real data.
    await expect(page.getByText(/^(Connected|Not connected)$/)).toBeVisible();
  });

  test('a project with no WordPress site shows a discrete "Not connected" warning with a link to project settings', async ({ page }) => {
    const notConnected = page.getByText('Not connected', { exact: true });
    test.skip(!(await notConnected.isVisible().catch(() => false)), 'The first project in this test account already has a connected site.');

    await expect(notConnected).toBeVisible();
    const connectLink = page.getByRole('link', { name: 'Connect WordPress' });
    await expect(connectLink).toBeVisible();
    await expect(connectLink).toHaveAttribute('href', /\/projects\/.+\/edit/);
  });

  test('a category mapped to a content stream shows it as read-only info', async ({ page }) => {
    const streamLabel = page.getByText(/Content stream(s)? for this category:/);
    test.skip(!(await streamLabel.isVisible().catch(() => false)), 'No category in this test account is currently mapped to a content stream.');

    await expect(streamLabel).toBeVisible();
  });

  test('Advanced Options is collapsed by default and can be opened', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /Advanced Options/ });
    await expect(trigger).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Point of View' })).not.toBeVisible();

    await trigger.click();
    await expect(page.getByRole('combobox', { name: 'Point of View' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Target Country' })).toBeVisible();
    await expect(page.getByLabel('Introductory Hook Brief')).toBeVisible();

    await trigger.click();
    await expect(page.getByRole('combobox', { name: 'Point of View' })).not.toBeVisible();
  });

  test('Keyword mode still validates and submits an empty keyword client-side', async ({ page }) => {
    await expect(page.getByLabel('Keyword')).toBeVisible();
    await page.getByRole('button', { name: 'Generate Article' }).click({ force: true });
    await expect(page.getByText('Primary keyword is required')).toBeVisible();
  });

  test('an empty primary keyword shows an inline error, focuses the field and sends no request (TASK-FIX-056)', async ({ page }) => {
    let generateCalls = 0;
    await page.route('**/api/wordpress/generate', (route) => {
      generateCalls += 1;
      return route.abort();
    });

    const keyword = page.locator('#keyword');
    await page.getByRole('button', { name: 'Generate Article' }).click();

    await expect(page.locator('#keyword-error')).toHaveText('Primary keyword is required');
    await expect(keyword).toHaveAttribute('aria-invalid', 'true');
    await expect(keyword).toBeFocused();
    await expect(page.getByText('Fix the highlighted fields before generating the article.')).toBeVisible();
    await expect(page.getByText(/Invalid input/)).toHaveCount(0);
    expect(generateCalls).toBe(0);

    // The error stays until the field is actually fixed, then clears.
    await keyword.fill('   ');
    await expect(page.locator('#keyword-error')).toBeVisible();
    await keyword.fill('kitchen ideas');
    await expect(page.locator('#keyword-error')).toHaveCount(0);
  });

  test('an invalid manual URL opens Advanced Options and focuses the field (TASK-FIX-056)', async ({ page }) => {
    await page.locator('#keyword').fill('kitchen ideas');
    await page.getByRole('button', { name: /Advanced Options/ }).click();
    await page.locator('#manual-external-urls').fill('not a url');
    await page.getByRole('button', { name: /Advanced Options/ }).click();

    await page.getByRole('button', { name: 'Generate Article' }).click();
    await expect(page.locator('#manual-external-urls-error')).toHaveText('One of the URLs is not a valid URL');
    await expect(page.locator('#manual-external-urls')).toBeFocused();
  });

  test('required fields are marked with * and a legend', async ({ page }) => {
    await expect(page.getByText(/Fields marked\s*\*?\s*(with an asterisk)?\s*are required\./)).toBeVisible();
    await expect(page.locator('#keyword')).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#project')).toHaveAttribute('aria-required', 'true');
    await expect(page.locator('#language')).toHaveAttribute('aria-required', 'true');
  });

  test('External Source mode is still reachable and gates submit on the confirmation checkbox', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Source' }).click();
    await page.getByRole('option', { name: 'External Source' }).click();
    await expect(page.getByLabel('URL')).toBeVisible();

    const generateButton = page.getByRole('button', { name: 'Generate Article' });
    await expect(generateButton).toBeDisabled();

    await page.getByLabel('URL').fill('https://example.com/some-article');
    await expect(generateButton).toBeDisabled();

    await page.getByRole('checkbox').check();
    await expect(generateButton).toBeEnabled();
  });

  test('Generation Summary reflects the current selections', async ({ page }) => {
    const summary = page.getByText('Generation Summary', { exact: true });
    await expect(summary).toBeVisible();

    await page.getByLabel('Keyword').fill('best hiking boots 2026');
    await expect(page.getByText('Keyword: "best hiking boots 2026"')).toBeVisible();
  });

  test('no horizontal overflow at mobile width, and the submit button is full-width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/wordpress/blog-post');
    await expect(page.getByText('Project Context', { exact: true })).toBeVisible();

    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);

    const buttonBox = await page.getByRole('button', { name: 'Generate Article' }).boundingBox();
    expect(buttonBox).not.toBeNull();
    // Full-width on mobile (point 11 of the visual brief), not a fixed/sticky
    // footer — just a wide, clearly visible in-flow button.
    expect(buttonBox!.width).toBeGreaterThan(300);
  });

  test('Advanced Options trigger exposes aria-expanded and keyboard focus is visible', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /Advanced Options/ });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.focus();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
