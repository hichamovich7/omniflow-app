import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import {
  categoryCardStorageKey,
  categoryCountLabel,
  parseStoredCategoryCardOpen,
  projectIdFromHash,
  readCategoryCardOpen,
  serializeCategoryCardOpen,
  siteDomain,
  writeCategoryCardOpen,
  type CategoryCardStorage,
} from '@/lib/wordpress/category-cards-view';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function memoryStorage(): CategoryCardStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const throwingStorage: CategoryCardStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

test('stored state round-trips per project; anything else means no choice', () => {
  expect(categoryCardStorageKey('p1')).toBe('omniflow:wp-category-card-open:p1');
  expect(parseStoredCategoryCardOpen(serializeCategoryCardOpen(true))).toBe(true);
  expect(parseStoredCategoryCardOpen(serializeCategoryCardOpen(false))).toBe(false);
  expect(parseStoredCategoryCardOpen(null)).toBeNull();
  expect(parseStoredCategoryCardOpen('true')).toBeNull();
});

test('new sites are compact by default', () => {
  const storage = memoryStorage();
  expect(readCategoryCardOpen('new-project', new Map(), () => storage)).toBe(false);
  storage.data.set(categoryCardStorageKey('corrupt'), 'yes');
  expect(readCategoryCardOpen('corrupt', new Map(), () => storage)).toBe(false);
});

test('opening and closing a card is remembered in localStorage, per project', () => {
  const storage = memoryStorage();
  writeCategoryCardOpen(['p1'], true, new Map(), () => storage);
  expect(storage.data.get(categoryCardStorageKey('p1'))).toBe('1');
  expect(storage.data.has(categoryCardStorageKey('p2'))).toBe(false);
  // A fresh page view (empty memory) reads the stored choice back.
  expect(readCategoryCardOpen('p1', new Map(), () => storage)).toBe(true);
  expect(readCategoryCardOpen('p2', new Map(), () => storage)).toBe(false);

  writeCategoryCardOpen(['p1'], false, new Map(), () => storage);
  expect(readCategoryCardOpen('p1', new Map(), () => storage)).toBe(false);
});

test('expand all / collapse all write every card', () => {
  const storage = memoryStorage();
  const memory = new Map<string, boolean>();
  writeCategoryCardOpen(['p1', 'p2', 'p3'], true, memory, () => storage);
  expect(['p1', 'p2', 'p3'].map((id) => readCategoryCardOpen(id, memory, () => storage))).toEqual([true, true, true]);
  writeCategoryCardOpen(['p1', 'p2', 'p3'], false, memory, () => storage);
  expect(['p1', 'p2', 'p3'].map((id) => readCategoryCardOpen(id, memory, () => storage))).toEqual([false, false, false]);
});

test('without localStorage (missing or throwing) the toggle still works for the page view', () => {
  for (const getStorage of [() => null, () => throwingStorage]) {
    const memory = new Map<string, boolean>();
    expect(readCategoryCardOpen('p1', memory, getStorage)).toBe(false);
    expect(() => writeCategoryCardOpen(['p1'], true, memory, getStorage)).not.toThrow();
    expect(readCategoryCardOpen('p1', memory, getStorage)).toBe(true);
    writeCategoryCardOpen(['p1'], false, memory, getStorage);
    expect(readCategoryCardOpen('p1', memory, getStorage)).toBe(false);
  }
});

test('summary helpers: domain, category count, #project-<id> hash', () => {
  expect(siteDomain('https://www.garden.example/')).toBe('garden.example');
  expect(siteDomain('https://blog.example.com/path')).toBe('blog.example.com');
  expect(siteDomain('not a url')).toBe('not a url');
  expect(categoryCountLabel(0)).toBe('0 categories');
  expect(categoryCountLabel(1)).toBe('1 category');
  expect(categoryCountLabel(5)).toBe('5 categories');
  expect(projectIdFromHash('#project-abc-123')).toBe('abc-123');
  expect(projectIdFromHash('#other')).toBeNull();
  expect(projectIdFromHash('')).toBeNull();
});

test('first render: every card compact, with summary, actions and an accessible toggle', () => {
  const source = read('components/wordpress/categories-manager.tsx');

  // Server snapshot = every card closed, so server and first client render are compact.
  expect(source).toContain("() => '0'.repeat(projectIds.length)");
  expect(source).toContain('const open = openById[project.id] ?? false;');
  expect(source).toContain("data-open={open ? 'true' : 'false'}");

  // Toggle: real button, aria-expanded / aria-controls, Show / Hide details label, chevron.
  expect(source).toContain('aria-expanded={open}');
  expect(source).toContain('aria-controls={panelId}');
  expect(source).toContain("aria-label={`${open ? 'Hide' : 'Show'} details for ${project.name}`}");
  expect(source).toContain('<ChevronDown');
  expect(source).toContain('<div id={panelId} hidden={!open}');
  // The #project-<id> anchor used by the Project detail page is kept, and a hash opens that card.
  expect(source).toContain('id={`project-${project.id}`}');
  expect(source).toContain('projectIdFromHash(window.location.hash)');

  // Compact summary: name, domain, status, count — before the details panel.
  const header = source.slice(source.indexOf('data-testid="category-card"'), source.indexOf('id={panelId}'));
  for (const piece of ['{project.name}', 'siteDomain(site.site_url)', 'Connected', 'No WordPress site', 'categoryCountLabel(projectCategories.length)']) {
    expect(header).toContain(piece);
  }
  // Main actions stay in the compact header.
  expect(header).toContain('Import from WordPress');
  expect(header).toContain('New Category');
  expect(source).toContain('Expand all');
  expect(source).toContain('Collapse all');
  expect(source).toContain('setCardsOpen(projectIds, true)');
  expect(source).toContain('setCardsOpen(projectIds, false)');

  // Never a secret: the page only knows the site id and URL.
  expect(source).not.toMatch(/password|secret|token/i);
});

test('details keep the existing content, and actions never toggle the card', () => {
  const source = read('components/wordpress/categories-manager.tsx');
  const panel = source.slice(source.indexOf('id={panelId}'), source.indexOf('<CreateCategoryDialog'));
  // Existing details are inside the panel, kept mounted (only hidden).
  expect(panel).toContain('<CategoryManagerList');
  expect(panel).toContain('<WpCategoryMapping');
  expect(panel).toContain('No categories yet.');

  // The chevron stops propagation so it does not toggle twice via the header area.
  expect(source).toContain('e.stopPropagation();');
  // The action buttons live outside the clickable header area.
  const clickableAt = source.indexOf('onClick={toggle}');
  const clickableEnd = source.indexOf('<div className="flex flex-wrap items-center gap-2">', clickableAt);
  const actions = source.slice(clickableEnd, source.indexOf('id={panelId}'));
  expect(clickableAt).toBeGreaterThan(-1);
  expect(actions).toContain('setImportForProjectId(project.id)');
  expect(actions).toContain('setCreateForProjectId(project.id)');
  expect(source.slice(clickableAt, clickableEnd)).not.toContain('setCreateForProjectId');

  // Dialogs and their callbacks are unchanged (a created / imported category opens its card).
  expect(source).toContain('<CreateCategoryDialog');
  expect(source).toContain('<WpImportCategoriesDialog');
  expect(source).toContain('setCategories((all) => [...all, category]);');
});

test('no API, database or AI change: the page still reads the same three tables', () => {
  const page = read('app/(dashboard)/wordpress/categories/page.tsx');
  expect(page).toContain(".from('projects')");
  expect(page).toContain(".from('wordpress_categories')");
  expect(page).toContain(".select('id, project_id, site_url')");
  const source = read('components/wordpress/categories-manager.tsx');
  expect(source).not.toContain('fetch(');
});
