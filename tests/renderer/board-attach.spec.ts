import Module from 'node:module';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'playwright/test';
import { attachableBoards, boardNameConflict, type ExistingBoard } from '@/lib/pinterest/board-attach';

// Same runtime redirect as pinterest-accounts-ui.spec.ts: .tsx is rendered
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
const { BoardNameConflictNotice } = require('@/components/pinterest-accounts/structure-dialogs') as typeof import('@/components/pinterest-accounts/structure-dialogs');
/* eslint-enable @typescript-eslint/no-require-imports */

test.afterAll(() => {
  if (previousRuntime) requireCache[playwrightRuntime] = previousRuntime;
  else delete requireCache[playwrightRuntime];
});

/**
 * TASK-093 — "Add board" when the board already exists in the project: the
 * legacy board is attached to the account instead of re-created; a board of
 * another account is named; the database refusal is a 409, not a 500.
 */

const ACC_CAT = 'acc-cat';
const ACC_AMI = 'acc-ami';
const boards: ExistingBoard[] = [
  { id: 'b-cat', name: 'Crochet Cat Patterns', accountId: null },
  { id: 'b-amigurumi', name: 'Amigurumi Ideas', accountId: ACC_AMI },
  { id: 'b-own', name: 'Cat Toys', accountId: ACC_CAT },
  { id: 'b-blankets', name: 'Baby Blankets', accountId: null },
];

test.describe('board name conflicts (TASK-093)', () => {
  test('a legacy board with the typed name is offered for attachment, case-insensitively', () => {
    expect(boardNameConflict(boards, 'Crochet Cat Patterns', ACC_CAT)).toEqual({ kind: 'legacy', board: boards[0], exact: true });
    expect(boardNameConflict(boards, '  crochet cat patterns ', ACC_CAT)).toEqual({ kind: 'legacy', board: boards[0], exact: false });
  });

  test('a board of the same account, or of another account, is named — not offered', () => {
    expect(boardNameConflict(boards, 'Cat Toys', ACC_CAT)?.kind).toBe('same_account');
    expect(boardNameConflict(boards, 'Amigurumi Ideas', ACC_CAT)).toMatchObject({ kind: 'other_account', board: { id: 'b-amigurumi' } });
  });

  test('a new name, or an empty one, is no conflict', () => {
    expect(boardNameConflict(boards, 'Crochet Cat Beds', ACC_CAT)).toBeNull();
    expect(boardNameConflict(boards, '   ', ACC_CAT)).toBeNull();
  });

  test('"Existing board" lists only the legacy boards, by name', () => {
    expect(attachableBoards(boards).map((b) => b.name)).toEqual(['Baby Blankets', 'Crochet Cat Patterns']);
    expect(attachableBoards(boards.filter((b) => b.accountId))).toEqual([]);
  });
});

test.describe('conflict notice (TASK-093)', () => {
  const render = (props: Parameters<typeof BoardNameConflictNotice>[0]) => renderToStaticMarkup(createElement(BoardNameConflictNotice, props));

  test('legacy board + chosen account → "Attach to <account>"', () => {
    const html = render({ conflict: { kind: 'legacy', board: boards[0], exact: true }, accountName: 'Cat Crochet Pattern', onAttach() {} });
    expect(html).toContain('Crochet Cat Patterns');
    expect(html).toContain('already exists in this project, without a Pinterest account.');
    expect(html).toContain('>Attach to Cat Crochet Pattern</button>');
  });

  test('legacy board without a chosen account asks for one, no button', () => {
    const html = render({ conflict: { kind: 'legacy', board: boards[0], exact: true }, accountName: null, onAttach() {} });
    expect(html).toContain('Choose an account below to attach it.');
    expect(html).not.toContain('<button');
  });

  test('a board of another account names that account', () => {
    const html = render({
      conflict: { kind: 'other_account', board: boards[1], exact: true },
      accountName: 'Cat Crochet Pattern',
      otherAccountName: 'Amigurumi World',
      onAttach() {},
    });
    expect(html).toContain('already belongs to Amigurumi World in this project');
    expect(html).not.toContain('<button');
  });
});

test.describe('POST /api/boards duplicate name (TASK-093)', () => {
  const PROJECT = '10000000-0000-4000-8000-000000000001';
  const USER = 'user-1';

  async function postWithInsertError(code: string) {
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          insert: () => query,
          single: async () =>
            table === 'projects'
              ? { data: { id: PROJECT, user_id: USER }, error: null }
              : { data: null, error: { code, message: 'insert failed' } },
        };
        return query;
      },
    };
    const fake = require.resolve('@/lib/supabase/server');
    const routeKey = require.resolve('@/app/api/boards/route');
    const original = require.cache[fake];
    const originalError = console.error;
    try {
      require.cache[fake] = { id: fake, filename: fake, loaded: true, exports: { createClient: async () => supabase } } as unknown as NodeJS.Module;
      delete require.cache[routeKey];
      console.error = () => {};
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { POST } = require('@/app/api/boards/route') as typeof import('@/app/api/boards/route');
      return await POST(
        new Request('http://localhost/api/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: PROJECT, name: 'Crochet Cat Patterns' }),
        })
      );
    } finally {
      console.error = originalError;
      if (original) require.cache[fake] = original;
      else delete require.cache[fake];
      delete require.cache[routeKey];
    }
  }

  test('a taken name is a 409 duplicate_name that points to the existing board', async () => {
    const res = await postWithInsertError('23505');
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe('duplicate_name');
    expect(json.error.message).toContain('attach the existing board');
  });

  test('any other database error stays a 500', async () => {
    const res = await postWithInsertError('XX000');
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('server_error');
  });
});
