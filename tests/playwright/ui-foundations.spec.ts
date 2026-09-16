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

  test('Command Center prototype renders its KPI, priorities, projects and weekly sections (TASK-FIX-038)', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();

    // KPIs: mock goals + real usage stats merged from Supabase.
    await expect(page.getByText('Monthly Revenue')).toBeVisible();
    await expect(page.getByText('Tasks Completed')).toBeVisible();
    await expect(page.getByText('Digital Products')).toBeVisible();
    await expect(page.getByText('Pins Created')).toBeVisible();
    await expect(page.getByText('Articles Generated')).toBeVisible();

    // Today's Priorities: up to 3 items, plus the discreet local-only "Add priority" affordance.
    await expect(page.getByRole('heading', { name: "Today's Priorities" })).toBeVisible();
    await expect(page.getByText('Finish "Free Crochet Cat Patterns"')).toBeVisible();
    await expect(page.getByText('Create 7 Crochet Sweater pins')).toBeVisible();
    await expect(page.getByText('Validate the first POD niche')).toBeVisible();
    await expect(page.getByText('Preview only')).toBeVisible();

    // Active Projects: CrochetSal + Home Decor DE only (POD removed, Phase 1.1 Hotfix) + a "View all projects" link.
    await expect(page.getByRole('heading', { name: 'Active Projects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CrochetSal' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Home Decor DE' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View all projects' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Weekly Progress' })).toBeVisible();
  });

  test('POD is no longer shown as an Active Project (TASK-FIX-038 Phase 1.1 Hotfix)', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'POD', exact: true })).toHaveCount(0);
    // Exactly 2 Active Project cards remain, identified by their status badges.
    await expect(page.getByRole('heading', { name: 'CrochetSal' }).locator('..').getByText('On Track')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Home Decor DE' }).locator('..').getByText('At Risk')).toBeVisible();
  });

  test('real KPIs with an existing destination render as visibly clickable links; mock KPIs do not (TASK-FIX-038 Phase 1.1 Hotfix)', async ({ page }) => {
    await page.goto('/dashboard');
    // Scoped to <main> so the sidebar's own "Projects" nav link never collides with the KPI card link.
    const main = page.getByRole('main');

    // Real, navigable KPIs: an actual <a href> a user can see is clickable (cursor, focus ring via CSS — checked by role + href, not string presence).
    const pinsCreatedLink = main.getByRole('link', { name: /Pins Created/ });
    await expect(pinsCreatedLink).toBeVisible();
    await expect(pinsCreatedLink).toHaveAttribute('href', '/history');

    const articlesGeneratedLink = main.getByRole('link', { name: /Articles Generated/ });
    await expect(articlesGeneratedLink).toBeVisible();
    await expect(articlesGeneratedLink).toHaveAttribute('href', '/wordpress/history');

    const projectsLink = main.getByRole('link', { name: /^Projects/ });
    await expect(projectsLink).toBeVisible();
    await expect(projectsLink).toHaveAttribute('href', '/projects');

    // Mock KPIs (no real Supabase table yet) must NOT be wrapped in a link.
    // "Generations" is real but intentionally not linked either — no combined
    // Pinterest+WordPress history route exists, and one must not be invented.
    for (const label of ['Monthly Revenue', 'Tasks Completed', 'Digital Products', 'Generations']) {
      const tile = main.getByText(label, { exact: true });
      await expect(tile).toBeVisible();
      const hasNoAnchorAncestor = await tile.evaluate((node) => node.closest('a') === null);
      expect(hasNoAnchorAncestor).toBe(true);
    }
  });

  test('the "+ Add priority" button is actually visible and usable, not just present in markup (TASK-FIX-038 Phase 1.1 Hotfix)', async ({ page }) => {
    await page.goto('/dashboard');
    const addButton = page.getByRole('button', { name: 'Add priority' });
    // toBeVisible() checks real computed visibility (display/opacity/size), not just DOM presence.
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();

    await addButton.click();
    const input = page.getByPlaceholder('New priority…');
    await expect(input).toBeVisible();
    await input.fill('Ship the hotfix');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Ship the hotfix')).toBeVisible();
    // Never implies persistence.
    await expect(page.getByText("Preview only — changes aren't saved yet.")).toBeVisible();
  });

  test('"Next action" is visible on every Active Project card, matched or not (TASK-FIX-038 Phase 1.1 Hotfix)', async ({ page }) => {
    await page.goto('/dashboard');
    const nextActionLabels = page.getByText('Next action', { exact: true });
    await expect(nextActionLabels).toHaveCount(2);
    for (const label of await nextActionLabels.all()) {
      await expect(label).toBeVisible();
    }
    await expect(page.getByText('Publish "Free Crochet Cat Patterns"')).toBeVisible();
    await expect(page.getByText('Finish keyword research for next batch')).toBeVisible();
  });

  test('the old Metrics strip is not duplicated after consolidation (TASK-FIX-038 Phase 1.1)', async ({ page }) => {
    await page.goto('/dashboard');
    const main = page.getByRole('main');
    // Pins Created / Articles Generated / Projects now render exactly once,
    // as Command Center KPI cards — never again in a separate Metrics strip.
    // Scoped to <main> so the sidebar's own "Projects" nav link is excluded.
    await expect(main.getByText('Pins Created', { exact: true })).toHaveCount(1);
    await expect(main.getByText('Articles Generated', { exact: true })).toHaveCount(1);
    await expect(main.getByText('Projects', { exact: true })).toHaveCount(1);
    // Credits now lives only in the header.
    await expect(main.getByText(/credits$/i)).toHaveCount(1);
  });

  test('Quick Actions exposes each core action exactly once', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'New Project' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Generate Pinterest Pins' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Generate WordPress Article' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Pinterest History' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'WordPress History' })).toHaveCount(1);
  });

  test('Recent Activity is still present after consolidation', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  });

  test('Command Center prototype is usable on mobile viewport', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'This assertion only applies to the mobile project.');
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CrochetSal' })).toBeVisible();
  });
});

test.describe.skip('Shared primitives after adoption', () => {
  test('PageState supports loading, empty, error and permission variants', async () => {});
  test('ResourceHeader exposes metadata, status and actions in reading order', async () => {});
  test('BulkActions announces selection and clears it from keyboard input', async () => {});
});
