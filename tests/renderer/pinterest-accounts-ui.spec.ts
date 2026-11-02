import Module from 'node:module';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'playwright/test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { PinterestAccount } from '@/types/pinterest-accounts';
import type { PinterestStructure } from '@/lib/queries/pinterest-accounts';

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
const { PinterestAccountsManager } = require('@/components/pinterest-accounts/pinterest-accounts-manager') as typeof import('@/components/pinterest-accounts/pinterest-accounts-manager');
const { PinterestDestinationPicker } = require('@/components/pinterest/pinterest-destination-picker') as typeof import('@/components/pinterest/pinterest-destination-picker');
/* eslint-enable @typescript-eslint/no-require-imports */

test.afterAll(() => {
  if (previousRuntime) requireCache[playwrightRuntime] = previousRuntime;
  else delete requireCache[playwrightRuntime];
});

/**
 * TASK-091 UI, rendered offline (no browser session, no Supabase): the
 * account page cards and the Pinterest form's destination picker (the
 * project workspace's stream blocks: project-workspace.spec.ts, TASK-092). The authenticated desktop / mobile checks live in
 * tests/playwright/pinterest-accounts.spec.ts.
 */

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
const withRouter = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router as never }, element));

const account = (overrides: Partial<PinterestAccount>): PinterestAccount => ({
  id: 'acc-1',
  project_id: 'p1',
  user_id: 'u1',
  name: 'Air Dry Clay Projects',
  username: '@airdryclayprojects',
  profile_url: 'https://www.pinterest.com/airdryclayprojects/',
  main_keyword: 'air dry clay',
  website_url: 'https://clayidealab.com',
  language: 'en',
  market: 'US',
  account_type: 'business',
  status: 'active',
  notes: 'Pinned daily at 9am',
  created_at: '2026-11-02T00:00:00Z',
  updated_at: '2026-11-02T00:00:00Z',
  ...overrides,
});

const structure: PinterestStructure = {
  accounts: [account({}), account({ id: 'acc-2', name: 'Polymer Clay Ideas' })],
  boards: [
    {
      id: 'b1',
      name: 'Air Dry Clay Projects',
      project_id: 'p1',
      pinterest_account_id: 'acc-1',
      is_active: true,
      sections: [
        { id: 's1', name: 'Pumpkins', is_active: true },
        { id: 's2', name: 'Retired', is_active: false },
      ],
    },
    { id: 'b2', name: 'Polymer Clay Jewelry', project_id: 'p1', pinterest_account_id: 'acc-2', is_active: true, sections: [] },
    { id: 'b3', name: 'Legacy Board', project_id: 'p1', pinterest_account_id: null, is_active: true, sections: [] },
  ],
  streams: [
    {
      id: 'cs1',
      name: 'Air Dry Clay',
      project_id: 'p1',
      status: 'active',
      pinterest_account_id: 'acc-1',
      destinations: [{ id: 'd1', board_id: 'b1', section_id: 's1', is_primary: true, is_active: true, weight: 1 }],
    },
  ],
};

test('account page: every account field, counts, boards with sections, legacy boards', () => {
  const html = withRouter(
    createElement(PinterestAccountsManager, {
      projectId: 'p1',
      accounts: [
        { account: structure.accounts[0], counts: { contentStreams: 1, boards: 1, sections: 2 }, streamNames: ['Air Dry Clay'] },
        { account: account({ id: 'acc-3', name: 'Old account', status: 'archived' }), counts: { contentStreams: 0, boards: 0, sections: 0 }, streamNames: [] },
      ],
      boards: structure.boards,
    })
  );
  for (const text of ['Air Dry Clay Projects', '@airdryclayprojects', 'air dry clay', 'https://clayidealab.com', 'en · US', 'Business', 'Pinned daily at 9am', 'Pumpkins', 'Retired']) {
    expect(html).toContain(text);
  }
  expect(html).toContain('1 · 1 · 2');
  expect(html).toContain('Content Streams: <span class="text-foreground">Air Dry Clay</span>');
  expect(html).toContain('Boards without an account (legacy)');
  expect(html).toContain('Legacy Board');
  expect(html).toContain('Archived accounts');
  expect(html).toContain('aria-label="Restore &quot;Old account&quot;"');
  expect(html).toContain('aria-label="Archive &quot;Air Dry Clay Projects&quot;"');
  // TASK-094: delete for accounts (archived too), boards and sections.
  expect(html).toContain('aria-label="Delete &quot;Air Dry Clay Projects&quot;"');
  expect(html).toContain('aria-label="Delete &quot;Old account&quot;"');
  expect(html).toContain('aria-label="Delete board &quot;Air Dry Clay Projects&quot;"');
  expect(html).toContain('aria-label="Delete board &quot;Legacy Board&quot;"');
  expect(html).toContain('aria-label="Delete section &quot;Pumpkins&quot;"');
  // A board of account 2 is not listed under account 1 (only account 1 is live here).
  expect(html).not.toContain('Polymer Clay Jewelry');
});

test('destination picker: account mode shows stream, board and section lists, never the legacy fields', () => {
  const html = withRouter(
    createElement(PinterestDestinationPicker, {
      structure,
      projectId: 'p1',
      value: { mode: 'account', accountId: 'acc-1', streamId: 'cs1', boardId: 'b1', sectionId: 's1' },
      onChange() {},
      disabled: false,
      legacyFields: createElement('div', { 'data-testid': 'legacy-fields' }, 'LEGACY'),
    })
  );
  expect(html).toContain('Pinterest account');
  expect(html).toContain('Content Stream');
  expect(html).toContain('Section (optional)');
  expect(html).toContain('Pumpkins');
  expect(html).toContain('aria-label="Add a section to &quot;Air Dry Clay Projects&quot;"');
  expect(html).not.toContain('LEGACY');
});

test('destination picker: Auto on a stream explains the split; legacy mode renders the former fields', () => {
  const auto = withRouter(
    createElement(PinterestDestinationPicker, {
      structure,
      projectId: 'p1',
      value: { mode: 'account', accountId: 'acc-1', streamId: 'cs1', boardId: null, sectionId: null },
      onChange() {},
      disabled: false,
      legacyFields: null,
    })
  );
  expect(auto).toContain('Auto — 1 active destination');
  expect(auto).toContain('No Pin is duplicated on several boards');
  expect(auto).not.toContain('Section (optional)');

  const legacy = withRouter(
    createElement(PinterestDestinationPicker, {
      structure,
      projectId: 'p1',
      value: { mode: 'legacy' },
      onChange() {},
      disabled: false,
      legacyFields: createElement('div', { 'data-testid': 'legacy-fields' }, 'LEGACY'),
    })
  );
  expect(legacy).toContain('Legacy — free board (no account)');
  expect(legacy).toContain('LEGACY');
  expect(legacy).not.toContain('Content Stream');
});
