import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { dirname, join } from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'playwright/test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  buildCategoryRows,
  buildTodos,
  draftFromCategory,
  freeBoardsForAccount,
  occupiedBoardIds,
  prefillStreamDraft,
  suggestCategoryId,
} from '@/lib/projects/project-dashboard';
import type { PinterestStructure } from '@/lib/queries/pinterest-accounts';
import type { PinterestAccount } from '@/types/pinterest-accounts';

// Same runtime redirect as pinterest-composer-ui.spec.ts: .tsx is rendered
// with React's JSX runtime for this spec only.
type CachedModule = { exports: unknown; loaded: boolean; id: string; filename: string };
const requireCache = (Module as unknown as { _cache: Record<string, CachedModule | undefined> })._cache;
const playwrightRuntime = join(dirname(require.resolve('playwright/package.json')), 'jsx-runtime.js');
const previousRuntime = requireCache[playwrightRuntime];
requireCache[playwrightRuntime] = {
  id: playwrightRuntime,
  filename: playwrightRuntime,
  loaded: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  exports: require('react/jsx-runtime'),
};
for (const file of Object.keys(requireCache)) {
  if (file.endsWith('.tsx') && !file.includes('node_modules')) delete requireCache[file];
}

/* eslint-disable @typescript-eslint/no-require-imports -- loaded after the runtime redirect above */
const { CollapsibleSection } = require('@/components/projects/collapsible-section') as typeof import('@/components/projects/collapsible-section');
const { ProjectDialogsProvider } = require('@/components/projects/project-dialogs') as typeof import('@/components/projects/project-dialogs');
const { ProjectPinterestSection } = require('@/components/projects/project-pinterest-section') as typeof import('@/components/projects/project-pinterest-section');
const { ProjectTodoPanel } = require('@/components/projects/project-todo-panel') as typeof import('@/components/projects/project-todo-panel');
/* eslint-enable @typescript-eslint/no-require-imports */

test.afterAll(() => {
  if (previousRuntime) requireCache[playwrightRuntime] = previousRuntime;
  else delete requireCache[playwrightRuntime];
});

/**
 * TASK-092 — one-page project workspace. Offline: the pure view model
 * (lib/projects/project-dashboard.ts), the block / Pinterest / Needs attention
 * components rendered to static markup, and the validated block order of the
 * page. No Supabase, no API call, no AI.
 */

const account = (id: string, name: string, extra: Partial<PinterestAccount> = {}): PinterestAccount => ({
  id,
  project_id: 'p1',
  user_id: 'u1',
  name,
  username: null,
  profile_url: null,
  main_keyword: null,
  website_url: null,
  language: null,
  market: null,
  account_type: 'business',
  status: 'active',
  notes: null,
  created_at: '',
  updated_at: '',
  ...extra,
});

const board = (id: string, name: string, accountId: string | null, extra: Partial<PinterestStructure['boards'][number]> = {}) => ({
  id,
  name,
  project_id: 'p1',
  pinterest_account_id: accountId,
  is_active: true,
  sections: [] as { id: string; name: string; is_active: boolean }[],
  ...extra,
});

const dest = (boardId: string, extra: Partial<PinterestStructure['streams'][number]['destinations'][number]> = {}) => ({
  id: `d-${boardId}-${extra.section_id ?? ''}`,
  board_id: boardId,
  section_id: null,
  is_primary: false,
  is_active: true,
  weight: 1,
  ...extra,
});

function clay(): PinterestStructure {
  return {
    accounts: [
      account('a1', 'Air Dry Clay Projects', { main_keyword: 'air dry clay' }),
      account('a2', 'Polymer Clay Ideas', { main_keyword: 'polymer clay' }),
      account('a3', 'Old account', { status: 'archived' }),
    ],
    boards: [
      board('b1', 'Air Dry Clay Projects', 'a1', { sections: [{ id: 's1', name: 'Pumpkins', is_active: true }] }),
      board('b2', 'Easy Air Dry Clay Ideas', 'a1'),
      board('b3', 'Air Dry Clay Home Decor', 'a1'),
      board('b4', 'Old Air Dry Board', 'a1', { is_active: false }),
      board('b5', 'Polymer Clay Ideas', 'a2'),
      board('b6', 'Polymer Clay Jewelry', 'a2'),
      board('b7', 'Clay Gifts', null),
    ],
    streams: [
      { id: 'cs1', name: 'Air Dry Clay', project_id: 'p1', status: 'active', pinterest_account_id: 'a1', destinations: [dest('b1', { section_id: 's1', is_primary: true }), dest('b2')] },
      { id: 'cs2', name: 'Polymer Clay', project_id: 'p1', status: 'active', pinterest_account_id: 'a2', destinations: [dest('b5', { is_primary: true })] },
      { id: 'cs3', name: 'Clay Gifts', project_id: 'p1', status: 'active', pinterest_account_id: null, destinations: [dest('b7', { is_primary: true })] },
      { id: 'cs4', name: 'Old Jewelry', project_id: 'p1', status: 'archived', pinterest_account_id: 'a2', destinations: [dest('b6', { is_primary: true })] },
    ],
  };
}

const categories = [
  { id: 'c1', name: 'Air Dry Clay' },
  { id: 'c2', name: 'Polymer Clay' },
  { id: 'c3', name: 'Clay Gifts' },
  { id: 'c4', name: 'Home Decor' },
];
const streamCategory = { cs1: 'c1', cs2: null, cs3: 'c3', cs4: 'c4' };

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

test('category table: streams, their accounts and article counts; archived streams ignored', () => {
  const rows = buildCategoryRows(clay(), categories, streamCategory, { c1: 12, c3: 3, c4: 2 });
  expect(rows.map((r) => [r.name, r.streams.map((s) => s.name), r.accounts, r.articles])).toEqual([
    ['Air Dry Clay', ['Air Dry Clay'], ['Air Dry Clay Projects'], 12],
    ['Polymer Clay', [], [], 0],
    ['Clay Gifts', ['Clay Gifts'], ['No account'], 3],
    ['Home Decor', [], [], 2],
  ]);
});

test('needs attention: legacy boards, streams without account / category, categories without stream — in that order', () => {
  expect(buildTodos(clay(), categories, streamCategory).map((t) => `${t.kind}:${t.name}`)).toEqual([
    'board_without_account:Clay Gifts',
    'stream_without_account:Clay Gifts',
    'stream_without_category:Polymer Clay',
    'category_without_stream:Polymer Clay',
    'category_without_stream:Home Decor',
  ]);
});

test('needs attention is empty once everything is linked', () => {
  const structure = clay();
  structure.boards = structure.boards.map((b) => ({ ...b, pinterest_account_id: b.pinterest_account_id ?? 'a1' }));
  structure.streams = structure.streams.map((s) => ({ ...s, pinterest_account_id: s.pinterest_account_id ?? 'a1' }));
  expect(buildTodos(structure, categories.slice(0, 3), { cs1: 'c1', cs2: 'c2', cs3: 'c3' })).toEqual([]);
});

test('free boards: active boards of the account not used by another live stream', () => {
  const structure = clay();
  expect([...occupiedBoardIds(structure)].sort()).toEqual(['b1', 'b2', 'b5', 'b7']);
  expect(freeBoardsForAccount(structure, 'a1').map((b) => b.name)).toEqual(['Air Dry Clay Home Decor']); // b4 inactive
  // The archived stream frees its board.
  expect(freeBoardsForAccount(structure, 'a2').map((b) => b.name)).toEqual(['Polymer Clay Jewelry']);
  // A stream's own boards count as free for it.
  expect(freeBoardsForAccount(structure, 'a1', 'cs1').map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
});

test('category suggestion: longest name contained, case-insensitive, or none', () => {
  expect(suggestCategoryId('Air Dry Clay Projects air dry clay', categories)).toBe('c1');
  expect(suggestCategoryId('POLYMER CLAY IDEAS', categories)).toBe('c2');
  expect(suggestCategoryId('Crochet Cats', categories)).toBeNull();
});

test('"+ Stream" prefill: the account, every free board (first primary, weight 1), suggested category', () => {
  const structure = clay();
  structure.boards.push(board('b8', 'Air Dry Clay Ornaments', 'a1'));
  expect(prefillStreamDraft(structure, categories, 'a1')).toEqual({
    accountId: 'a1',
    name: '',
    categoryId: 'c1',
    destinations: [
      { boardId: 'b3', sectionId: null, isPrimary: true, isActive: true, weight: 1 },
      { boardId: 'b8', sectionId: null, isPrimary: false, isActive: true, weight: 1 },
    ],
  });
});

test('prefill with no free board gives an empty list (nothing pre-added)', () => {
  const structure = clay();
  structure.boards = structure.boards.filter((b) => b.id !== 'b3');
  expect(prefillStreamDraft(structure, categories, 'a1').destinations).toEqual([]);
});

test('"Create a stream" from a category: named after it, linked to it, no account', () => {
  expect(draftFromCategory({ id: 'c4', name: 'Home Decor' })).toEqual({ accountId: null, name: 'Home Decor', categoryId: 'c4', destinations: [] });
});

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

// createElement with children passed as arguments (react/no-children-prop) while
// the component types declare `children` as a required prop.
const withChildren = createElement as unknown as (type: unknown, props: object, ...children: ReactNode[]) => ReactElement;

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
const render = (children: ReactNode) =>
  renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router as never },
      withChildren(ProjectDialogsProvider, { projectId: 'p1', categories, boards: [], accounts: [] }, children)
    )
  );

test('collapsible block: anchor id, heading with an expandable button, folded body hidden', () => {
  const open = renderToStaticMarkup(withChildren(CollapsibleSection, { id: 'brand', title: 'Brand Profile' }, 'BODY'));
  expect(open).toContain('id="brand"');
  expect(open).toMatch(/<h2[^>]*><button[^>]*aria-expanded="true"/);
  expect(open).not.toMatch(/hidden=""/);
  const folded = renderToStaticMarkup(withChildren(CollapsibleSection, { id: 'niche', title: 'Niche settings', defaultOpen: false }, 'BODY'));
  expect(folded).toContain('aria-expanded="false"');
  expect(folded).toMatch(/hidden=""/);
});

const streamFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'cs1',
  name: 'Air Dry Clay',
  status: 'active' as const,
  accountId: 'a1',
  categoryName: 'Air Dry Clay',
  targetPinsPerDay: 6,
  editing: {
    id: 'cs1',
    name: 'Air Dry Clay',
    wordpressCategoryId: 'c1',
    pinterestAccountId: 'a1',
    destinations: [],
    status: 'active' as const,
    targetPinsPerDay: 6,
    targetArticlesPerWeek: null,
    targetBufferDays: null,
  },
  destinations: [],
  destinationLabels: [
    { label: 'Air Dry Clay Projects / Pumpkins', isPrimary: true, isActive: true, weight: 2 },
    { label: 'Easy Air Dry Clay Ideas', isPrimary: false, isActive: false, weight: 1 },
  ],
  freeBoards: [{ id: 'b3', name: 'Air Dry Clay Home Decor' }],
  ...overrides,
});

test('Pinterest block: account with its stream, ★ primary "Board / Section", weights, one-click free board', () => {
  const html = render(
    createElement(ProjectPinterestSection, {
      projectId: 'p1',
      archivedAccounts: 1,
      accounts: [{ id: 'a1', name: 'Air Dry Clay Projects', meta: '@airdry · Business', status: 'active', counts: '1 streams · 3 boards · 1 sections', draft: { accountId: 'a1', name: '', categoryId: 'c1', destinations: [] } }],
      streams: [
        streamFixture(),
        streamFixture({ id: 'cs3', name: 'Clay Gifts', accountId: null, categoryName: null, freeBoards: [], destinationLabels: [{ label: 'Clay Gifts', isPrimary: true, isActive: true, weight: 1 }] }),
        streamFixture({ id: 'cs4', name: 'Old Jewelry', status: 'archived', freeBoards: [] }),
      ],
    })
  );
  expect(html).toContain('Air Dry Clay Projects');
  expect(html).toContain('6 Pins / day');
  expect(html).toContain('Air Dry Clay Projects / Pumpkins');
  expect(html).toContain('aria-label="Primary"');
  expect(html).toContain('×2');
  expect(html).toContain('aria-label="Add board &quot;Air Dry Clay Home Decor&quot; to &quot;Air Dry Clay&quot;"');
  expect(html).toContain('aria-label="Edit &quot;Air Dry Clay&quot;"');
  expect(html).toContain('aria-label="Archive &quot;Air Dry Clay&quot;"');
  // Legacy stream grouped apart, archived streams folded.
  expect(html).toContain('Content Streams without account');
  expect(html).toContain('no category');
  expect(html).toContain('Archived streams (1)');
  expect(html).toContain('1 archived account hidden.');
  expect(html).toContain('href="/pinterest-accounts?project=p1"');
});

test('Pinterest block: empty project shows the empty state with both actions', () => {
  const html = render(createElement(ProjectPinterestSection, { projectId: 'p1', archivedAccounts: 0, accounts: [], streams: [] }));
  expect(html).toContain('No content streams yet');
  expect(html).toContain('Add content stream');
  expect(html).toContain('Pinterest account');
});

test('Needs attention: one fix per kind; empty list says everything is linked', () => {
  const html = render(
    createElement(ProjectTodoPanel, {
      todos: buildTodos(clay(), categories, streamCategory),
      accounts: [
        { id: 'a1', name: 'Air Dry Clay Projects' },
        { id: 'a2', name: 'Polymer Clay Ideas' },
      ],
      categories,
      legacyBoardsByStream: { cs3: ['b7'] },
    })
  );
  expect(html).toContain('Board without account');
  expect(html).toContain('→ Air Dry Clay Projects');
  expect(html).toContain('Stream without account');
  expect(html).toContain('Stream without WordPress category');
  expect(html).toContain('aria-label="WordPress category for &quot;Polymer Clay&quot;"');
  expect(html).toContain('Category without stream');
  expect(html).toContain('Create a stream for it');

  const empty = render(createElement(ProjectTodoPanel, { todos: [], accounts: [], categories: [], legacyBoardsByStream: {} }));
  expect(empty).toContain('Everything is linked.');
});

test('Needs attention without account offers to add one first', () => {
  const html = render(
    createElement(ProjectTodoPanel, {
      todos: [{ kind: 'board_without_account', id: 'b7', name: 'Clay Gifts' }],
      accounts: [],
      categories: [],
      legacyBoardsByStream: {},
    })
  );
  expect(html).toContain('Add a Pinterest account first');
});

// ---------------------------------------------------------------------------
// Page layout (validated mockup order)
// ---------------------------------------------------------------------------

test('project page: Brand Profile → WordPress → Niche settings → Pinterest, then Needs attention and Quick links', () => {
  const source = readFileSync(join(process.cwd(), 'app/(dashboard)/projects/[id]/page.tsx'), 'utf8');
  const order = ['id="brand"', 'id="wordpress"', 'id="niche"', 'id="pinterest"', 'id="needs-attention"', 'id="quick-links"'].map((anchor) =>
    source.indexOf(anchor)
  );
  expect(order.every((index) => index > 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // Niche settings folded by default; every block reachable from the navigation.
  expect(source).toMatch(/id="niche"[\s\S]{0,200}defaultOpen=\{false\}/);
  for (const href of ['#brand', '#wordpress', '#niche', '#pinterest', '#quick-links']) expect(source).toContain(`href: '${href}'`);
  // The page writes nothing itself: no supabase insert / update / delete.
  expect(source).not.toMatch(/\.(insert|update|delete|upsert)\(/);
});
