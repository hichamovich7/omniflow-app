import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  describeWordPressSource,
  getGenerationsWordPressSource,
  WORDPRESS_SOURCE_LABEL,
  WORDPRESS_SOURCE_UNAVAILABLE_LABEL,
} from '@/lib/queries/wordpress-source';

type Row = Record<string, unknown>;

interface Op {
  table: string;
  filters: string[];
}

/**
 * Minimal read-only fake: supports select / eq / in / not(col, 'is', null),
 * awaited as a thenable. Each awaited chain is recorded as one query, so the
 * number of round trips can be asserted (no N+1).
 */
function fakeSupabase(tables: Record<string, Row[]>, failing: string[] = []) {
  const ops: Op[] = [];

  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const op: Op = { table, filters: [] };
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        op.filters.push(`eq:${column}`);
        rows = rows.filter((r) => r[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        op.filters.push(`in:${column}`);
        rows = rows.filter((r) => values.includes(r[column]));
        return builder;
      },
      not(column: string, operator: string, value: unknown) {
        op.filters.push(`not:${column}`);
        if (operator === 'is' && value === null) rows = rows.filter((r) => r[column] != null);
        return builder;
      },
      then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) {
        ops.push(op);
        if (failing.includes(table)) return resolve({ data: null, error: { message: 'column does not exist' } });
        return resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, ops };
}

const USER_A = 'user-a';
const USER_B = 'user-b';

function fixture() {
  return {
    generations: [
      { id: 'gen-from-article', user_id: USER_A, source_wordpress_generation_id: 'wp-1' },
      { id: 'gen-from-article-2', user_id: USER_A, source_wordpress_generation_id: 'wp-1' },
      { id: 'gen-keyword', user_id: USER_A, source_wordpress_generation_id: null },
      { id: 'gen-legacy', user_id: USER_A },
      { id: 'gen-no-article-row', user_id: USER_A, source_wordpress_generation_id: 'wp-2' },
      { id: 'gen-foreign-source', user_id: USER_A, source_wordpress_generation_id: 'wp-b' },
      { id: 'gen-of-b', user_id: USER_B, source_wordpress_generation_id: 'wp-b' },
    ],
    wordpress_generations: [
      { id: 'wp-1', user_id: USER_A },
      { id: 'wp-2', user_id: USER_A },
      { id: 'wp-b', user_id: USER_B },
    ],
    wordpress_articles: [
      { generation_id: 'wp-1', title: 'How to Organize a Small Bathroom' },
      { generation_id: 'wp-b', title: 'Secret article of user B' },
    ],
  };
}

const ALL_A = [
  'gen-from-article',
  'gen-from-article-2',
  'gen-keyword',
  'gen-legacy',
  'gen-no-article-row',
  'gen-foreign-source',
];

test.describe('Pinterest history — source WordPress article (getGenerationsWordPressSource)', () => {
  test('generation created from an article resolves to its title and /wordpress/[id] id', async () => {
    const { client } = fakeSupabase(fixture());
    const map = await getGenerationsWordPressSource(client, USER_A, ALL_A);
    expect(map.get('gen-from-article')).toEqual({
      status: 'available',
      generationId: 'wp-1',
      title: 'How to Organize a Small Bathroom',
    });
    expect(map.get('gen-from-article-2')).toEqual(map.get('gen-from-article'));
  });

  test('keyword generation and legacy row without relation have no entry', async () => {
    const { client } = fakeSupabase(fixture());
    const map = await getGenerationsWordPressSource(client, USER_A, ALL_A);
    expect(map.has('gen-keyword')).toBe(false);
    expect(map.has('gen-legacy')).toBe(false);
  });

  test('missing article row maps to unavailable', async () => {
    const { client } = fakeSupabase(fixture());
    const map = await getGenerationsWordPressSource(client, USER_A, ALL_A);
    expect(map.get('gen-no-article-row')).toEqual({ status: 'unavailable' });
  });

  test("user isolation: another user's article is never exposed", async () => {
    const { client, ops } = fakeSupabase(fixture());
    const map = await getGenerationsWordPressSource(client, USER_A, [...ALL_A, 'gen-of-b']);
    expect(map.get('gen-foreign-source')).toEqual({ status: 'unavailable' });
    expect(map.has('gen-of-b')).toBe(false);
    expect(JSON.stringify([...map.values()])).not.toContain('Secret article of user B');
    const byTable = Object.fromEntries(ops.map((o) => [o.table, o.filters]));
    expect(byTable.generations).toContain('eq:user_id');
    expect(byTable.wordpress_generations).toContain('eq:user_id');
  });

  test('no N+1: at most 3 grouped queries whatever the page size', async () => {
    const tables = fixture();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      tables.generations.push({ id: `bulk-${i}`, user_id: USER_A, source_wordpress_generation_id: 'wp-1' });
      ids.push(`bulk-${i}`);
    }
    const { client, ops } = fakeSupabase(tables);
    const map = await getGenerationsWordPressSource(client, USER_A, [...ALL_A, ...ids]);
    expect(map.size).toBe(24);
    expect(ops.map((o) => o.table)).toEqual(['generations', 'wordpress_generations', 'wordpress_articles']);
  });

  test('no linked generation: a single query, no article lookup', async () => {
    const { client, ops } = fakeSupabase(fixture());
    const map = await getGenerationsWordPressSource(client, USER_A, ['gen-keyword', 'gen-legacy']);
    expect(map.size).toBe(0);
    expect(ops).toHaveLength(1);
  });

  test('empty page: no query at all', async () => {
    const { client, ops } = fakeSupabase(fixture());
    expect((await getGenerationsWordPressSource(client, USER_A, [])).size).toBe(0);
    expect(ops).toHaveLength(0);
  });

  test('migration 040 not applied (column error): empty map, history unchanged', async () => {
    const { client } = fakeSupabase(fixture(), ['generations']);
    const map = await getGenerationsWordPressSource(client, USER_A, ALL_A);
    expect(map.size).toBe(0);
  });
});

test.describe('Pinterest history — WordPressSourceBadge', () => {
  const badge = readFileSync(join(process.cwd(), 'components/history/wordpress-source-badge.tsx'), 'utf-8');

  test('available: "From WordPress" label, article title and link to /wordpress/[id]', () => {
    expect(
      describeWordPressSource({ status: 'available', generationId: 'wp-1', title: 'How to Organize a Small Bathroom' })
    ).toEqual({
      kind: 'link',
      href: '/wordpress/wp-1',
      label: WORDPRESS_SOURCE_LABEL,
      title: 'How to Organize a Small Bathroom',
    });
    expect(WORDPRESS_SOURCE_LABEL).toBe('From WordPress');
  });

  test('unavailable: "WordPress article unavailable", no link', () => {
    expect(describeWordPressSource({ status: 'unavailable' })).toEqual({
      kind: 'unavailable',
      label: 'WordPress article unavailable',
    });
    expect(WORDPRESS_SOURCE_UNAVAILABLE_LABEL).toBe('WordPress article unavailable');
    const unavailableBranch = badge.slice(badge.indexOf("display.kind === 'unavailable'"), badge.indexOf('<Link'));
    expect(unavailableBranch).toContain('<span');
    expect(unavailableBranch).not.toContain('href');
  });

  test('link is a native, keyboard-focusable anchor with a screen-reader friendly name', () => {
    expect(badge).toContain('<Link');
    expect(badge).toContain('href={display.href}');
    expect(badge).not.toContain('tabIndex');
    expect(badge).toContain('focus-visible:ring-2');
    expect(badge).toContain('<span className="sr-only">, source article:</span>');
    expect(badge).toContain('aria-hidden="true"');
  });

  test('long title: truncated visually, full title kept as tooltip and accessible text', () => {
    const title = 'A very long WordPress article title '.repeat(3).trim();
    expect(describeWordPressSource({ status: 'available', generationId: 'wp-1', title })).toMatchObject({ title });
    expect(badge).toContain('title={display.title}');
    expect(badge).toContain('<span className="min-w-0 truncate">{display.title}</span>');
    expect(badge).toContain('md:max-w-64');
  });
});

test.describe('Pinterest history — wiring and reverse flow unchanged', () => {
  const root = process.cwd();
  const read = (p: string) => readFileSync(join(root, p), 'utf-8');

  test('history table renders the source badge only when a source entry exists', () => {
    const table = read('components/history/history-table.tsx');
    expect(table).toContain('{source && <WordPressSourceBadge source={source} />}');
    // Pins → WordPress article display is still rendered exactly as before.
    expect(table).toContain('<WordPressUsageBadge');
    expect(table).toContain('usedPinCount={usage.usedPinCount}');
  });

  test('history page loads sources once per page with the session user', () => {
    const page = read('app/(dashboard)/history/page.tsx');
    expect(page).toContain('getGenerationsWordPressSource(supabase, user.id, list.map((g) => g.id))');
    expect(page).toContain('getGenerationsWordPressUsage(supabase, list.map((g) => g.id))');
  });

  test('reverse-flow helper does not read the Phase 2 relation', () => {
    expect(read('lib/queries/wordpress-usage.ts')).not.toContain('source_wordpress_generation_id');
    expect(read('components/history/wordpress-usage-badge.tsx')).not.toContain('From WordPress');
  });
});
