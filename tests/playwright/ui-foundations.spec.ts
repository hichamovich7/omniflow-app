import { expect, test } from 'playwright/test';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

test.describe('UI foundations', () => {
  test.skip(!storageState, 'Set PLAYWRIGHT_STORAGE_STATE to an authenticated test-session file.');
  test.use({ storageState });

  test('dashboard smoke test exposes the workspace shell', async ({ page, isMobile }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('main')).toBeVisible();
    // Below `md` the sidebar (and its OmniFlow brand link) is hidden by design;
    // the shell is reached through the "Open menu" button instead.
    if (isMobile) {
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    } else {
      await expect(page.getByRole('link', { name: /OmniFlow/i })).toBeVisible();
    }
  });

  test('sidebar navigation exposes core workspace destinations', async ({ page, isMobile }) => {
    await page.goto('/dashboard');
    // Scoped to the navigation container so the dashboard's own "Projects" KPI
    // card and "View all projects" link never collide with the nav link.
    let nav = page.getByRole('complementary');
    if (isMobile) {
      await page.getByRole('button', { name: 'Open menu' }).click();
      nav = page.getByRole('dialog', { name: 'Navigation' });
    }
    await expect(nav.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Generate', exact: true }).first()).toBeVisible();
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
    // "Pins Created" also labels a Weekly Progress tile, so target the KPI card link.
    await expect(page.getByRole('main').getByRole('link', { name: /Pins Created/ })).toBeVisible();
    await expect(page.getByText('Articles Generated')).toBeVisible();

    // Today's Priorities: up to 3 items, plus the discreet local-only Add/Replace affordance.
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

  test('the priority action button is visible and usable — "Add priority" below the limit, "Replace a priority" at it (TASK-FIX-038 Phase 1.1 Hotfix)', async ({ page }) => {
    await page.goto('/dashboard');
    // The mock data ships exactly 3 priorities (the pinned limit), so the
    // button already reads "Replace a priority" on a fresh load — this is
    // the deliberate follow-up to the Hotfix, not a regression of it.
    const actionButton = page.getByRole('button', { name: /^(Add priority|Replace a priority)$/ });
    // toBeVisible() checks real computed visibility (display/opacity/size), not just DOM presence.
    await expect(actionButton).toBeVisible();
    await expect(actionButton).toBeEnabled();
    await expect(actionButton).toHaveText('Replace a priority');

    await actionButton.click();
    const input = page.getByPlaceholder('New priority…');
    await expect(input).toBeVisible();
    await input.fill('Ship the hotfix');

    const submit = page.getByRole('button', { name: 'Replace', exact: true });
    // A replace target is required — submit stays disabled until one is chosen.
    await expect(submit).toBeDisabled();
    await page.getByRole('combobox', { name: 'Priority to replace' }).click();
    await page.getByRole('option').first().click();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText('Ship the hotfix')).toBeVisible();
    // Replacing never changes the pinned count.
    await expect(page.getByRole('list').getByRole('listitem')).toHaveCount(3);
    // Never implies persistence.
    await expect(page.getByText("Preview only — changes aren't saved yet.")).toBeVisible();
  });

  test('editing a priority title: Save applies the new title, Cancel keeps the old one, empty is rejected', async ({ page }) => {
    await page.goto('/dashboard');
    // Located by position, not by text: while editing, the title lives in the
    // input's value, so a `hasText` filter stops matching the list item.
    const firstPriority = page.getByRole('list').getByRole('listitem').first();
    await expect(firstPriority).toContainText('Finish "Free Crochet Cat Patterns"');
    await firstPriority.getByRole('button', { name: /^Edit/ }).click();

    // `textbox` role excludes the project Select's hidden native input.
    const editInput = firstPriority.getByRole('textbox');
    await expect(editInput).toHaveValue('Finish "Free Crochet Cat Patterns"');

    // Cancel must restore the original title, not just close the field.
    await editInput.fill('This should not stick');
    await firstPriority.getByRole('button', { name: 'Cancel editing' }).click();
    await expect(page.getByText('Finish "Free Crochet Cat Patterns"')).toBeVisible();
    await expect(page.getByText('This should not stick')).not.toBeVisible();

    // An empty title must never be saveable.
    await firstPriority.getByRole('button', { name: /^Edit/ }).click();
    await editInput.fill('   ');
    await expect(firstPriority.getByRole('button', { name: 'Save title' })).toBeDisabled();

    // A real edit replaces the title.
    await editInput.fill('Publish the Crochet Cat batch');
    await firstPriority.getByRole('button', { name: 'Save title' }).click();
    await expect(page.getByText('Publish the Crochet Cat batch')).toBeVisible();
    await expect(page.getByText('Finish "Free Crochet Cat Patterns"')).not.toBeVisible();
  });

  test('a priority\'s project selector lists real projects, offers "No project", and never crashes on a stale id', async ({ page }) => {
    await page.goto('/dashboard');
    const firstPriority = page.getByRole('list').getByRole('listitem').first();
    const projectBadge = firstPriority.getByRole('combobox');
    await expect(projectBadge).toBeVisible();
    // The trigger's text also carries the Select icon glyph, so match the label prefix.
    await expect(projectBadge).toHaveText(/^No project/);

    await projectBadge.click();
    await expect(page.getByRole('option', { name: 'No project' })).toBeVisible();
    // At least one real project option must be offered (seeded per-account, not asserted by name).
    await expect(page.getByRole('option').filter({ hasNotText: 'No project' }).first()).toBeVisible();
    await page.keyboard.press('Escape');

    // The page must not crash regardless of what the mock data starts with —
    // covered structurally by resolvePriorityProjectName()'s offline tests
    // (tests/renderer/dashboard-command-center.spec.ts) for the actual
    // stale-id fallback, since the mock priorities ship with no projectId.
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('replacing a priority lets the title include an optional project, and never exceeds the 3-priority limit', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Replace a priority' }).click();

    // A replace target is mandatory once at the limit — submit must not be
    // clickable, and no priority may be silently added on top of the 3.
    const submit = page.getByRole('button', { name: 'Replace', exact: true });
    await expect(submit).toBeDisabled();

    await page.getByPlaceholder('New priority…').fill('Research new niche');
    await expect(submit).toBeDisabled(); // title alone is still not enough

    await page.getByRole('combobox', { name: 'Priority to replace' }).click();
    await page.getByRole('option', { name: 'Validate the first POD niche' }).click();

    const addProjectBadge = page.getByRole('combobox', { name: 'Project for new priority' });
    await addProjectBadge.click();
    const firstRealProject = page.getByRole('option').filter({ hasNotText: 'No project' }).first();
    await firstRealProject.click();

    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText('Research new niche')).toBeVisible();
    await expect(page.getByText('Validate the first POD niche')).not.toBeVisible();
    // The count never grows past the limit — this is a replace, not an addition.
    await expect(page.getByRole('list').getByRole('listitem')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Replace a priority' })).toBeVisible();
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
    // Articles Generated / Projects now render exactly once, as Command Center
    // KPI cards — never again in a separate Metrics strip. "Pins Created" is
    // covered by the fixme test below. Scoped to <main> so the sidebar's own
    // "Projects" nav link is excluded.
    await expect(main.getByText('Articles Generated', { exact: true })).toHaveCount(1);
    await expect(main.getByText('Projects', { exact: true })).toHaveCount(1);
    // Credits now lives only in the header.
    await expect(main.getByText(/credits$/i)).toHaveCount(1);
  });

  // Pending product decision (docs/UI-ROADMAP.md, Phase 0): the dashboard now
  // shows "Pins Created" twice — the all-time KPI card and the weekly tile in
  // Weekly Progress. Whether that is intended is not decided yet, so this rule
  // is parked rather than rewritten or enforced by removing either element.
  test.fixme('"Pins Created" renders exactly once on the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('main').getByText('Pins Created', { exact: true })).toHaveCount(1);
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
