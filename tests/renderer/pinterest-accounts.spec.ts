import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import {
  createBoardSectionSchema,
  createPinterestAccountSchema,
  pinterestAccountRow,
  updateBoardSectionSchema,
  updatePinterestAccountSchema,
} from '@/lib/validations/pinterest-accounts';
import { boardRow, createBoardSchema, updateBoardSchema } from '@/lib/validations/board';
import {
  createContentStreamSchema,
  normalizeStreamDestinations,
  streamDestinationsSchema,
  updateContentStreamSchema,
} from '@/lib/validations/content-streams';
import { generatePinsSchema, STRUCTURED_DESTINATION_MIX_MESSAGE } from '@/lib/validations/pinterest';
import {
  checkStreamDestinations,
  countAccountStructure,
  findBlockingStream,
  isAccountInProject,
  type PinterestStructure,
} from '@/lib/queries/pinterest-accounts';
import { DestinationError, distributePinDestinations, resolveGenerationDestinations } from '@/lib/pinterest/destinations';
import { destinationsOutsideAccount, legacyBoardDestinations } from '@/lib/pinterest/stream-destinations';
import {
  activeStreamDestinationCount,
  boardChoices,
  destinationRequestFields,
  destinationSelectionError,
  initialDestinationSelection,
  sectionChoices,
  selectAccount,
  streamChoices,
} from '@/lib/pinterest/destination-picker';
import { formatPinterestBoardCell, generatePinterestCsv } from '@/lib/csv/pinterest';
import type { Pin } from '@/types/database';

/**
 * TASK-091 — Project → Pinterest Account → Content Stream → Board → Section → Pin.
 * Offline: Zod schemas, pure rules, the destination resolver and the API
 * routes run against an in-memory Supabase fake; no AI, image, WordPress or
 * network call can leave this file. Live RLS / constraints of migration 047
 * were checked on a real Postgres (see TESTING.md, TASK-091).
 */

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER_USER = '00000000-0000-4000-8000-000000000002';
const PROJECT = '10000000-0000-4000-8000-000000000001';
const OTHER_PROJECT = '10000000-0000-4000-8000-000000000002';
const ACC_AIR = '50000000-0000-4000-8000-000000000001';
const ACC_POLY = '50000000-0000-4000-8000-000000000002';
const ACC_ARCHIVED = '50000000-0000-4000-8000-000000000003';
const B_PROJECTS = '20000000-0000-4000-8000-000000000001';
const B_EASY = '20000000-0000-4000-8000-000000000002';
const B_DECOR = '20000000-0000-4000-8000-000000000003';
const B_POLY = '20000000-0000-4000-8000-000000000004';
const B_LEGACY = '20000000-0000-4000-8000-000000000005';
const B_INACTIVE = '20000000-0000-4000-8000-000000000006';
const B_FOREIGN = '20000000-0000-4000-8000-000000000009';
const SEC_PUMPKINS = '60000000-0000-4000-8000-000000000001';
const SEC_COASTERS = '60000000-0000-4000-8000-000000000002';
const SEC_INACTIVE = '60000000-0000-4000-8000-000000000003';
const SEC_POLY = '60000000-0000-4000-8000-000000000004';
const S_AIR = '30000000-0000-4000-8000-000000000001';
const S_POLY = '30000000-0000-4000-8000-000000000002';
const S_LEGACY = '30000000-0000-4000-8000-000000000003';
const S_EMPTY = '30000000-0000-4000-8000-000000000004';

// ---------------------------------------------------------------------------
// In-memory Supabase fake (select / eq / neq / in / order / single, insert,
// update, delete). Writes are recorded in `events`.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
interface WriteEvent {
  table: string;
  op: 'insert' | 'update' | 'delete';
  row: unknown;
}

function fakeSupabase(tables: Record<string, Row[]>, userId = USER) {
  const events: WriteEvent[] = [];
  let seq = 0;
  const client = {
    events,
    tables,
    auth: { getUser: async () => ({ data: { user: { id: userId, email: 'user@example.com' } } }) },
    rpc: async () => ({ data: null, error: null }),
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let payload: Row | Row[] | null = null;
      let inserted: Row[] = [];
      const rows = () => (tables[table] ??= []);
      const run = (): Row[] => {
        if (op === 'insert') return inserted;
        const matched = rows().filter((row) => filters.every((f) => f(row)));
        if (op === 'update') {
          for (const row of matched) Object.assign(row, payload);
          events.push({ table, op: 'update', row: { values: payload, ids: matched.map((r) => r.id) } });
        }
        if (op === 'delete') {
          tables[table] = rows().filter((row) => !matched.includes(row));
          events.push({ table, op: 'delete', row: matched.map((r) => r.id) });
        }
        return matched;
      };
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        range: () => query,
        eq: (col: string, value: unknown) => {
          filters.push((row) => row[col] === value);
          return query;
        },
        neq: (col: string, value: unknown) => {
          filters.push((row) => row[col] !== value);
          return query;
        },
        in: (col: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[col]));
          return query;
        },
        ilike: () => query,
        insert: (value: Row | Row[]) => {
          op = 'insert';
          const list = (Array.isArray(value) ? value : [value]).map((row) => ({
            id: `generated-${table}-${++seq}`,
            ...row,
          }));
          rows().push(...list);
          inserted = list;
          events.push({ table, op: 'insert', row: value });
          return query;
        },
        update: (values: Row) => {
          op = 'update';
          payload = values;
          return query;
        },
        delete: () => {
          op = 'delete';
          return query;
        },
        single: async () => {
          const [first] = run();
          return { data: first ?? null, error: first ? null : { code: 'PGRST116', message: 'not found' } };
        },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          try {
            return Promise.resolve(resolve({ data: run(), error: null }));
          } catch (err) {
            return reject ? Promise.resolve(reject(err)) : Promise.reject(err);
          }
        },
      };
      return query;
    },
  };
  return client;
}

/** Clay Idea Lab: two accounts, boards, sections, streams (example of the task). */
function clayTables(): Record<string, Row[]> {
  return {
    projects: [
      { id: PROJECT, user_id: USER, name: 'Clay Idea Lab', description: 'Clay crafts', niche: 'Crafts', default_language: 'en' },
      { id: OTHER_PROJECT, user_id: USER, name: 'Other project' },
    ],
    pinterest_accounts: [
      { id: ACC_AIR, project_id: PROJECT, user_id: USER, name: 'Air Dry Clay Projects', status: 'active' },
      { id: ACC_POLY, project_id: PROJECT, user_id: USER, name: 'Polymer Clay Ideas', status: 'active' },
      { id: ACC_ARCHIVED, project_id: PROJECT, user_id: USER, name: 'Old account', status: 'archived' },
    ],
    boards: [
      { id: B_PROJECTS, project_id: PROJECT, user_id: USER, name: 'Air Dry Clay Projects', pinterest_account_id: ACC_AIR, is_active: true },
      { id: B_EASY, project_id: PROJECT, user_id: USER, name: 'Easy Air Dry Clay Ideas', pinterest_account_id: ACC_AIR, is_active: true },
      { id: B_DECOR, project_id: PROJECT, user_id: USER, name: 'Air Dry Clay Home Decor', pinterest_account_id: ACC_AIR, is_active: true },
      { id: B_INACTIVE, project_id: PROJECT, user_id: USER, name: 'Old Air Dry Board', pinterest_account_id: ACC_AIR, is_active: false },
      { id: B_POLY, project_id: PROJECT, user_id: USER, name: 'Polymer Clay Ideas', pinterest_account_id: ACC_POLY, is_active: true },
      { id: B_LEGACY, project_id: PROJECT, user_id: USER, name: 'Legacy Board', pinterest_account_id: null, is_active: true },
      { id: B_FOREIGN, project_id: OTHER_PROJECT, user_id: OTHER_USER, name: 'Foreign', pinterest_account_id: null, is_active: true },
    ],
    pinterest_board_sections: [
      { id: SEC_PUMPKINS, board_id: B_PROJECTS, user_id: USER, name: 'Pumpkins', is_active: true },
      { id: SEC_COASTERS, board_id: B_PROJECTS, user_id: USER, name: 'Coasters', is_active: true },
      { id: SEC_INACTIVE, board_id: B_PROJECTS, user_id: USER, name: 'Retired', is_active: false },
      { id: SEC_POLY, board_id: B_POLY, user_id: USER, name: 'Jewelry', is_active: true },
    ],
    content_streams: [
      { id: S_AIR, project_id: PROJECT, user_id: USER, name: 'Air Dry Clay', status: 'active', pinterest_account_id: ACC_AIR },
      { id: S_POLY, project_id: PROJECT, user_id: USER, name: 'Polymer Clay', status: 'active', pinterest_account_id: ACC_POLY },
      { id: S_LEGACY, project_id: PROJECT, user_id: USER, name: 'Legacy Stream', status: 'active', pinterest_account_id: null },
      { id: S_EMPTY, project_id: PROJECT, user_id: USER, name: 'Empty Stream', status: 'active', pinterest_account_id: ACC_AIR },
    ],
    content_stream_boards: [
      // Same board with several sections + a second board; one inactive row.
      { id: 'd1', content_stream_id: S_AIR, board_id: B_PROJECTS, section_id: SEC_PUMPKINS, user_id: USER, is_primary: true, is_active: true, weight: 2, created_at: '2026-11-01T00:00:01Z' },
      { id: 'd2', content_stream_id: S_AIR, board_id: B_PROJECTS, section_id: SEC_COASTERS, user_id: USER, is_primary: false, is_active: true, weight: 1, created_at: '2026-11-01T00:00:02Z' },
      { id: 'd3', content_stream_id: S_AIR, board_id: B_EASY, section_id: null, user_id: USER, is_primary: false, is_active: true, weight: 1, created_at: '2026-11-01T00:00:03Z' },
      { id: 'd4', content_stream_id: S_AIR, board_id: B_DECOR, section_id: null, user_id: USER, is_primary: false, is_active: false, weight: 5, created_at: '2026-11-01T00:00:04Z' },
      { id: 'd5', content_stream_id: S_POLY, board_id: B_POLY, section_id: null, user_id: USER, is_primary: true, is_active: true, weight: 1, created_at: '2026-11-01T00:00:05Z' },
      // Legacy single-board stream, as migration 047 leaves it.
      { id: 'd6', content_stream_id: S_LEGACY, board_id: B_LEGACY, section_id: null, user_id: USER, is_primary: true, is_active: true, weight: 1, created_at: '2026-10-01T00:00:00Z' },
      { id: 'd7', content_stream_id: S_EMPTY, board_id: B_DECOR, section_id: null, user_id: USER, is_primary: false, is_active: false, weight: 1, created_at: '2026-11-01T00:00:06Z' },
    ],
  };
}

function clayStructure(): PinterestStructure {
  const t = clayTables();
  return {
    accounts: t.pinterest_accounts as unknown as PinterestStructure['accounts'],
    boards: t.boards
      .filter((b) => b.project_id === PROJECT)
      .map((b) => ({
        id: b.id as string,
        name: b.name as string,
        project_id: b.project_id as string,
        pinterest_account_id: (b.pinterest_account_id as string | null) ?? null,
        is_active: b.is_active !== false,
        sections: t.pinterest_board_sections
          .filter((s) => s.board_id === b.id)
          .map((s) => ({ id: s.id as string, name: s.name as string, is_active: s.is_active as boolean })),
      })),
    streams: t.content_streams.map((s) => ({
      id: s.id as string,
      name: s.name as string,
      project_id: s.project_id as string,
      status: s.status as 'active',
      pinterest_account_id: (s.pinterest_account_id as string | null) ?? null,
      destinations: t.content_stream_boards
        .filter((d) => d.content_stream_id === s.id)
        .map((d) => ({
          id: d.id as string,
          board_id: d.board_id as string,
          section_id: (d.section_id as string | null) ?? null,
          is_primary: d.is_primary as boolean,
          is_active: d.is_active as boolean,
          weight: d.weight as number,
        })),
    })),
  };
}

// ---------------------------------------------------------------------------
// 1. Pinterest Account validation
// ---------------------------------------------------------------------------

test.describe('Pinterest account validation', () => {
  test('create: minimal input gets Business / Active defaults', () => {
    const parsed = createPinterestAccountSchema.parse({ projectId: PROJECT, name: '  Air Dry Clay Projects ' });
    expect(parsed.name).toBe('Air Dry Clay Projects');
    expect(parsed.accountType).toBe('business');
    expect(parsed.status).toBe('active');
  });

  test('create: every field is mapped to its column, blanks become null', () => {
    const parsed = createPinterestAccountSchema.parse({
      projectId: PROJECT,
      name: 'Polymer Clay Ideas',
      username: '@polymerclayideas',
      profileUrl: 'https://www.pinterest.com/polymerclayideas/',
      mainKeyword: 'polymer clay',
      websiteUrl: 'https://clayidealab.com',
      language: 'en',
      market: 'US',
      accountType: 'personal',
      status: 'paused',
      notes: '   ',
    });
    expect(pinterestAccountRow(parsed)).toEqual({
      name: 'Polymer Clay Ideas',
      username: '@polymerclayideas',
      profile_url: 'https://www.pinterest.com/polymerclayideas/',
      main_keyword: 'polymer clay',
      website_url: 'https://clayidealab.com',
      language: 'en',
      market: 'US',
      notes: null,
      account_type: 'personal',
      status: 'paused',
    });
  });

  test('create: invalid URL, type or status refused; no credential field exists', () => {
    expect(createPinterestAccountSchema.safeParse({ projectId: PROJECT, name: 'A', profileUrl: 'not a url' }).success).toBe(false);
    expect(createPinterestAccountSchema.safeParse({ projectId: PROJECT, name: 'A', accountType: 'creator' }).success).toBe(false);
    expect(createPinterestAccountSchema.safeParse({ projectId: PROJECT, name: 'A', status: 'deleted' }).success).toBe(false);
    const parsed = createPinterestAccountSchema.parse({ projectId: PROJECT, name: 'A', password: 'secret', token: 'x', cookie: 'y' });
    expect(Object.keys(pinterestAccountRow(parsed)).some((key) => /password|token|cookie|secret/.test(key))).toBe(false);
  });

  test('update: only the provided fields are written; archive is a status change', () => {
    expect(pinterestAccountRow(updatePinterestAccountSchema.parse({ status: 'archived' }))).toEqual({ status: 'archived' });
    expect(pinterestAccountRow(updatePinterestAccountSchema.parse({ notes: 'Pinned weekly' }))).toEqual({ notes: 'Pinned weekly' });
    expect(updatePinterestAccountSchema.safeParse({ name: '' }).success).toBe(false);
  });

  test('ownership: an account must be the caller\'s and in the same project', () => {
    const account = { id: ACC_AIR, user_id: USER, project_id: PROJECT, status: 'active' };
    expect(isAccountInProject(account, PROJECT, USER)).toBe(true);
    expect(isAccountInProject(account, OTHER_PROJECT, USER)).toBe(false);
    expect(isAccountInProject(account, PROJECT, OTHER_USER)).toBe(false);
    expect(isAccountInProject(null, PROJECT, USER)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Boards and sections
// ---------------------------------------------------------------------------

test.describe('Boards and sections', () => {
  test('board create / update accept an account, an active flag and an external id', () => {
    const created = createBoardSchema.parse({ projectId: PROJECT, name: 'Air Dry Clay Projects', pinterestAccountId: ACC_AIR });
    expect(boardRow(created)).toEqual({ name: 'Air Dry Clay Projects', pinterest_account_id: ACC_AIR });
    expect(boardRow(updateBoardSchema.parse({ isActive: false }))).toEqual({ is_active: false });
    expect(boardRow(updateBoardSchema.parse({ pinterestAccountId: null, externalId: '  ' }))).toEqual({
      pinterest_account_id: null,
      external_id: null,
    });
    // Name-only update keeps the pre-TASK-091 contract.
    expect(boardRow(updateBoardSchema.parse({ name: 'Renamed' }))).toEqual({ name: 'Renamed' });
  });

  test('section: name kept exactly (case, accents) apart from surrounding spaces', () => {
    const parsed = createBoardSectionSchema.parse({ boardId: B_PROJECTS, name: '  Citrouilles d\'Automne ' });
    expect(parsed.name).toBe('Citrouilles d\'Automne');
  });

  test('section: "/", "\\", line breaks, empty and over-long names refused', () => {
    for (const name of ['A/B', 'A\\B', 'A\nB', '   ', 'x'.repeat(101)]) {
      expect(createBoardSectionSchema.safeParse({ boardId: B_PROJECTS, name }).success).toBe(false);
    }
  });

  test('section: (de)activation and rename', () => {
    expect(updateBoardSectionSchema.parse({ isActive: false })).toMatchObject({ isActive: false });
    expect(updateBoardSectionSchema.parse({ name: 'Ornaments' }).name).toBe('Ornaments');
  });

  test('a board cannot move to another account while a stream of another account uses it', () => {
    const streams = [
      { name: 'Air Dry Clay', status: 'active', pinterest_account_id: ACC_AIR },
      { name: 'Legacy Stream', status: 'active', pinterest_account_id: null },
      { name: 'Archived', status: 'archived', pinterest_account_id: ACC_POLY },
    ];
    expect(findBlockingStream(streams, ACC_POLY)).toBe('Air Dry Clay');
    expect(findBlockingStream(streams, null)).toBe('Air Dry Clay');
    expect(findBlockingStream(streams, ACC_AIR)).toBeNull();
  });

  test('account page counts: streams, boards and sections per account', () => {
    const structure = clayStructure();
    expect(countAccountStructure(structure, ACC_AIR)).toEqual({ contentStreams: 2, boards: 4, sections: 3 });
    expect(countAccountStructure(structure, ACC_POLY)).toEqual({ contentStreams: 1, boards: 1, sections: 1 });
  });
});

// ---------------------------------------------------------------------------
// 3. Content Stream destinations (content_stream_boards)
// ---------------------------------------------------------------------------

test.describe('Content Stream destinations', () => {
  const dest = (boardId: string, extra: Record<string, unknown> = {}) => ({ boardId, ...extra });

  test('several boards, and the same board with several sections, are accepted', () => {
    const parsed = streamDestinationsSchema.safeParse([
      dest(B_PROJECTS, { sectionId: SEC_PUMPKINS, isPrimary: true }),
      dest(B_PROJECTS, { sectionId: SEC_COASTERS }),
      dest(B_PROJECTS),
      dest(B_EASY, { weight: 3 }),
    ]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data[3]).toMatchObject({ isActive: true, isPrimary: false, weight: 3 });
    }
  });

  test('duplicate stream + board + section refused (with and without section)', () => {
    expect(streamDestinationsSchema.safeParse([dest(B_EASY), dest(B_EASY)]).success).toBe(false);
    expect(
      streamDestinationsSchema.safeParse([dest(B_PROJECTS, { sectionId: SEC_PUMPKINS }), dest(B_PROJECTS, { sectionId: SEC_PUMPKINS })]).success
    ).toBe(false);
  });

  test('at most one primary, and the primary is active', () => {
    expect(streamDestinationsSchema.safeParse([dest(B_EASY, { isPrimary: true }), dest(B_DECOR, { isPrimary: true })]).success).toBe(false);
    expect(streamDestinationsSchema.safeParse([dest(B_EASY, { isPrimary: true, isActive: false })]).success).toBe(false);
  });

  test('weights are whole numbers from 1 to 100', () => {
    for (const weight of [0, 101, 1.5]) expect(streamDestinationsSchema.safeParse([dest(B_EASY, { weight })]).success).toBe(false);
  });

  test('without a primary, the first active destination becomes primary', () => {
    const normalized = normalizeStreamDestinations(
      streamDestinationsSchema.parse([dest(B_EASY, { isActive: false }), dest(B_DECOR), dest(B_PROJECTS)])
    );
    expect(normalized.map((d) => d.isPrimary)).toEqual([false, true, false]);
  });

  test('stream schemas accept an account and a destination list', () => {
    expect(createContentStreamSchema.safeParse({ projectId: PROJECT, name: 'Air Dry Clay', pinterestAccountId: ACC_AIR, destinations: [dest(B_EASY)] }).success).toBe(true);
    expect(updateContentStreamSchema.safeParse({ pinterestAccountId: null }).success).toBe(true);
  });

  test('legacy boardId becomes one primary active destination; null clears', () => {
    expect(legacyBoardDestinations(B_LEGACY)).toEqual([{ boardId: B_LEGACY, sectionId: null, isPrimary: true, isActive: true, weight: 1 }]);
    expect(legacyBoardDestinations(null)).toEqual([]);
  });

  test('ownership: board of another account / section of another board / other project refused', () => {
    const t = clayTables();
    const context = {
      userId: USER,
      projectId: PROJECT,
      accountId: ACC_AIR,
      boards: t.boards as never,
      sections: t.pinterest_board_sections as never,
    };
    expect(checkStreamDestinations([{ boardId: B_PROJECTS, sectionId: SEC_PUMPKINS }, { boardId: B_EASY }], context)).toBeNull();
    expect(checkStreamDestinations([{ boardId: B_POLY }], context)?.code).toBe('board_account_mismatch');
    expect(checkStreamDestinations([{ boardId: B_LEGACY }], context)?.code).toBe('board_account_mismatch');
    expect(checkStreamDestinations([{ boardId: B_EASY, sectionId: SEC_PUMPKINS }], context)?.code).toBe('section_board_mismatch');
    expect(checkStreamDestinations([{ boardId: B_FOREIGN }], context)?.code).toBe('board_forbidden');
    // Legacy stream (no account): any board of its project, as before.
    expect(checkStreamDestinations([{ boardId: B_LEGACY }, { boardId: B_POLY }], { ...context, accountId: null })).toBeNull();
  });

  test('changing a stream\'s account keeps only boards of the new account', () => {
    const boards = [
      { id: B_EASY, pinterest_account_id: ACC_AIR },
      { id: B_POLY, pinterest_account_id: ACC_POLY },
    ];
    expect(destinationsOutsideAccount(boards, ACC_POLY)).toEqual([B_EASY]);
    expect(destinationsOutsideAccount(boards, null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Distribution (no AI request, deterministic)
// ---------------------------------------------------------------------------

test.describe('Pin distribution across destinations', () => {
  const A = { name: 'A', isPrimary: false, weight: 1 };
  const P = { name: 'P', isPrimary: true, weight: 1 };
  const W2 = { name: 'W2', isPrimary: true, weight: 2 };

  test('the primary destination gets the first Pin and wins ties', () => {
    expect(distributePinDestinations([A, P], 4).map((d) => d.name)).toEqual(['P', 'A', 'P', 'A']);
  });

  test('weights split the Pins proportionally (2 / 1 → 2 of 3)', () => {
    const plan = distributePinDestinations([W2, A], 6).map((d) => d.name);
    expect(plan).toEqual(['W2', 'A', 'W2', 'W2', 'A', 'W2']);
    expect(plan.filter((n) => n === 'W2')).toHaveLength(4);
  });

  test('one destination per Pin, count preserved (no duplication on several boards)', () => {
    const plan = distributePinDestinations([P, A, { name: 'B', isPrimary: false, weight: 3 }], 10);
    expect(plan).toHaveLength(10);
  });

  test('deterministic, and empty for no destination or no Pin', () => {
    expect(distributePinDestinations([P, A], 7)).toEqual(distributePinDestinations([P, A], 7));
    expect(distributePinDestinations([], 5)).toEqual([]);
    expect(distributePinDestinations([P], 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Server-side resolution of a generation's destinations
// ---------------------------------------------------------------------------

test.describe('resolveGenerationDestinations', () => {
  async function resolve(request: Parameters<typeof resolveGenerationDestinations>[3], tables = clayTables()) {
    const supabase = fakeSupabase(tables);
    return resolveGenerationDestinations(supabase as never, USER, PROJECT, request);
  }

  async function expectCode(request: Parameters<typeof resolveGenerationDestinations>[3], code: string, tables?: Record<string, Row[]>) {
    const error = await resolve(request, tables).catch((err) => err);
    expect(error).toBeInstanceOf(DestinationError);
    expect((error as DestinationError).code).toBe(code);
  }

  test('board + section chosen: every Pin goes there, with exact names', async () => {
    const resolved = await resolve({ pinterestAccountId: ACC_AIR, contentStreamId: S_AIR, boardId: B_PROJECTS, boardSectionId: SEC_PUMPKINS });
    const plan = resolved.plan(3);
    expect(plan).toHaveLength(3);
    for (const destination of plan) {
      expect(destination).toEqual({ accountId: ACC_AIR, boardId: B_PROJECTS, boardName: 'Air Dry Clay Projects', sectionId: SEC_PUMPKINS, sectionName: 'Pumpkins' });
    }
    expect(resolved.contentStreamName).toBe('Air Dry Clay');
  });

  test('stream only: active destinations by weight, primary first, inactive never used', async () => {
    const resolved = await resolve({ pinterestAccountId: ACC_AIR, contentStreamId: S_AIR });
    const plan = resolved.plan(8).map((d) => `${d.boardName}${d.sectionName ? `/${d.sectionName}` : ''}`);
    expect(plan[0]).toBe('Air Dry Clay Projects/Pumpkins');
    expect(plan.filter((p) => p === 'Air Dry Clay Projects/Pumpkins')).toHaveLength(4); // weight 2 of 4
    expect(plan).toContain('Air Dry Clay Projects/Coasters');
    expect(plan).toContain('Easy Air Dry Clay Ideas');
    expect(plan.some((p) => p.startsWith('Air Dry Clay Home Decor'))).toBe(false); // inactive row
  });

  test('fallback: with only the primary active, every Pin uses the primary', async () => {
    const tables = clayTables();
    for (const row of tables.content_stream_boards) if (row.content_stream_id === S_AIR && !row.is_primary) row.is_active = false;
    const plan = (await resolve({ pinterestAccountId: ACC_AIR, contentStreamId: S_AIR }, tables)).plan(3);
    expect(plan.every((d) => d.sectionName === 'Pumpkins')).toBe(true);
  });

  test('an inactive section of a destination is skipped', async () => {
    const tables = clayTables();
    tables.pinterest_board_sections.find((s) => s.id === SEC_COASTERS)!.is_active = false;
    const plan = (await resolve({ pinterestAccountId: ACC_AIR, contentStreamId: S_AIR }, tables)).plan(12);
    expect(plan.some((d) => d.sectionName === 'Coasters')).toBe(false);
  });

  test('refusals: board of another account, section of another board, inactive board / section', async () => {
    await expectCode({ pinterestAccountId: ACC_AIR, boardId: B_POLY }, 'board_account_mismatch');
    await expectCode({ pinterestAccountId: ACC_AIR, boardId: B_LEGACY }, 'board_account_mismatch');
    await expectCode({ pinterestAccountId: ACC_AIR, boardId: B_EASY, boardSectionId: SEC_PUMPKINS }, 'section_board_mismatch');
    await expectCode({ pinterestAccountId: ACC_POLY, boardId: B_POLY, boardSectionId: SEC_PUMPKINS }, 'section_board_mismatch');
    await expectCode({ pinterestAccountId: ACC_AIR, boardId: B_INACTIVE }, 'board_inactive');
    await expectCode({ pinterestAccountId: ACC_AIR, boardId: B_PROJECTS, boardSectionId: SEC_INACTIVE }, 'section_inactive');
    await expectCode({ pinterestAccountId: ACC_AIR, boardId: B_FOREIGN }, 'board_not_found');
  });

  test('refusals: stream of another account, board outside the stream, archived / foreign account', async () => {
    await expectCode({ pinterestAccountId: ACC_AIR, contentStreamId: S_POLY }, 'stream_account_mismatch');
    await expectCode({ pinterestAccountId: ACC_AIR, contentStreamId: S_LEGACY }, 'stream_account_mismatch');
    await expectCode({ pinterestAccountId: ACC_AIR, contentStreamId: S_AIR, boardId: B_DECOR }, 'board_not_in_stream');
    await expectCode({ pinterestAccountId: ACC_ARCHIVED, boardId: B_PROJECTS }, 'account_archived');
    const tables = clayTables();
    tables.pinterest_accounts[0].project_id = OTHER_PROJECT;
    await expectCode({ pinterestAccountId: ACC_AIR, boardId: B_PROJECTS }, 'account_not_found', tables);
  });

  test('a stream without any active destination is refused before any write', async () => {
    await expectCode({ pinterestAccountId: ACC_AIR, contentStreamId: S_EMPTY }, 'no_active_destination');
    await expectCode({ pinterestAccountId: ACC_AIR }, 'destination_required');
  });
});

// ---------------------------------------------------------------------------
// 6. Generation request + route
// ---------------------------------------------------------------------------

const baseRequest = {
  projectId: PROJECT,
  keyword: 'air dry clay ideas',
  language: 'en',
  pinsRequested: 3,
  generationMode: 'legacy-composite',
};

test.describe('Generation request schema', () => {
  test('structured destination accepted; free-text board refused alongside it', () => {
    expect(generatePinsSchema.safeParse({ ...baseRequest, pinterestAccountId: ACC_AIR, contentStreamId: S_AIR }).success).toBe(true);
    expect(generatePinsSchema.safeParse({ ...baseRequest, pinterestAccountId: ACC_AIR, boardId: B_PROJECTS, boardSectionId: SEC_PUMPKINS }).success).toBe(true);
    const mixed = generatePinsSchema.safeParse({ ...baseRequest, pinterestAccountId: ACC_AIR, boardId: B_PROJECTS, board: 'Free text' });
    expect(mixed.success).toBe(false);
    if (!mixed.success) expect(mixed.error.issues[0].message).toBe(STRUCTURED_DESTINATION_MIX_MESSAGE);
  });

  test('a section needs a board; a stream or board needs an account', () => {
    expect(generatePinsSchema.safeParse({ ...baseRequest, pinterestAccountId: ACC_AIR, contentStreamId: S_AIR, boardSectionId: SEC_PUMPKINS }).success).toBe(false);
    expect(generatePinsSchema.safeParse({ ...baseRequest, boardId: B_PROJECTS }).success).toBe(false);
    expect(generatePinsSchema.safeParse({ ...baseRequest, pinterestAccountId: ACC_AIR }).success).toBe(false);
  });

  test('legacy request (free board + section) is unchanged', () => {
    expect(generatePinsSchema.safeParse({ ...baseRequest, board: 'Legacy Board', boardSection: 'Old section' }).success).toBe(true);
  });
});

const ANGLES = ['curiosity', 'problem-solution', 'listicle', 'discovery', 'article-promise'] as const;
const TITLES = [
  'The Detail Most Clay Makers Overlook',
  'Stuck On What To Make? Start Here',
  'Clay Ideas Worth Saving For Later',
  'How A Calm Clay Corner Comes Together',
  'A Practical Guide To Effortless Clay Crafts',
];

function modelPlan(count: number) {
  return JSON.stringify({
    pins: Array.from({ length: count }, (_, index) => ({
      angle: ANGLES[index % ANGLES.length],
      title: TITLES[index % TITLES.length],
      description:
        'Short on inspiration for your next craft session? These clay ideas keep your shelf light, colorful and personal. Save them for your next weekend project.',
      keywords: 'air dry clay, clay crafts, diy decor',
      // The model suggests a board: it must be ignored in account mode.
      board: 'Invented Board By The Model',
      image_prompt: `A bright air dry clay project on a linen tablecloth, scene variant ${index}, warm natural light, editorial craft photography, photorealistic.`,
      visualFormat: 'photo',
    })),
  });
}

async function withRoute(
  routePath: string,
  tables: Record<string, Row[]>,
  run: (call: (body: unknown, method?: string, params?: Record<string, string>) => Promise<Response>, supabase: ReturnType<typeof fakeSupabase>, ai: { calls: number }) => Promise<void>
) {
  const supabase = fakeSupabase(tables);
  const ai = { calls: 0 };
  const fakes: Record<string, unknown> = {
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/rate-limit': {
      checkRateLimit: async () => ({ allowed: true }),
      rateLimitErrorResponse: () => {
        throw new Error('rate limit response must not be reached');
      },
    },
    '@/lib/ai/engine': {
      generateText: async () => {
        ai.calls++;
        return modelPlan(3);
      },
      analyzeImage: async () => {
        throw new Error('Vision must not be called');
      },
      generateImage: async () => {
        throw new Error('Image generation must not be called');
      },
      resolveImageModel: () => {
        throw new Error('Image routing must not be called');
      },
    },
    '@/lib/queries/boards': {
      findOrCreateBoardIds: async (_c: unknown, _p: string, _u: string, names: string[]) =>
        new Map(names.map((name, index) => [name.trim(), `legacy-board-${index}`])),
    },
  };
  const routeKey = require.resolve(routePath);
  const keys = [...Object.keys(fakes).map((s) => require.resolve(s)), routeKey];
  const originals = new Map(keys.map((key) => [key, require.cache[key]]));
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  try {
    for (const [specifier, exports] of Object.entries(fakes)) {
      const filename = require.resolve(specifier);
      require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [], path: '', parent: null, isPreloading: false, require } as unknown as NodeJS.Module;
    }
    delete require.cache[routeKey];
    globalThis.fetch = (async () => {
      throw new Error('No network call is allowed in this test');
    }) as typeof fetch;
    console.error = () => {};
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require(routePath) as Record<string, (request: Request, ctx?: unknown) => Promise<Response>>;
    await run(
      (body, method = 'POST', params) =>
        route[method](
          new Request('http://localhost/api/test', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
          params ? { params: Promise.resolve(params) } : undefined
        ),
      supabase,
      ai
    );
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }
}

const insertedPins = (supabase: ReturnType<typeof fakeSupabase>) =>
  supabase.events.find((event) => event.table === 'pins' && event.op === 'insert')?.row as Array<Record<string, unknown>> | undefined;

test.describe('POST /api/pinterest/generate with Pinterest destinations', () => {
  const ROUTE = '@/app/api/pinterest/generate/route';

  test('stream (Auto): each Pin gets one configured destination; the model\'s board is ignored', async () => {
    await withRoute(ROUTE, clayTables(), async (post, supabase, ai) => {
      const res = await post({ ...baseRequest, pinterestAccountId: ACC_AIR, contentStreamId: S_AIR });
      expect(res.status).toBe(201);
      expect(ai.calls).toBe(1); // one text call, no extra request to pick a board
      const pins = insertedPins(supabase)!;
      expect(pins).toHaveLength(3);
      expect(pins.map((p) => `${p.board}/${p.board_section ?? ''}`)).toEqual([
        'Air Dry Clay Projects/Pumpkins',
        'Air Dry Clay Projects/Coasters',
        'Easy Air Dry Clay Ideas/',
      ]);
      expect(pins[0]).toMatchObject({ board_id: B_PROJECTS, pinterest_account_id: ACC_AIR, pinterest_section_id: SEC_PUMPKINS });
      expect(pins[2]).toMatchObject({ board_id: B_EASY, pinterest_section_id: null });
      expect(pins.some((p) => p.board === 'Invented Board By The Model')).toBe(false);
      // No board or section is created from the model's answer.
      expect(supabase.events.some((e) => e.op === 'insert' && (e.table === 'boards' || e.table === 'pinterest_board_sections'))).toBe(false);
    });
  });

  test('board + section chosen: every Pin uses it, CSV writes "Board/Section"', async () => {
    await withRoute(ROUTE, clayTables(), async (post, supabase) => {
      const res = await post({ ...baseRequest, pinterestAccountId: ACC_AIR, contentStreamId: S_AIR, boardId: B_PROJECTS, boardSectionId: SEC_COASTERS });
      expect(res.status).toBe(201);
      const pins = insertedPins(supabase)!;
      expect(pins.every((p) => p.board === 'Air Dry Clay Projects' && p.board_section === 'Coasters')).toBe(true);
      const csv = generatePinterestCsv(pins.map((p) => ({ ...p, media_url: null, publish_date: null, link_url: null }) as unknown as Pin));
      expect(csv.split('\n')[1]).toContain('Air Dry Clay Projects/Coasters');
    });
  });

  test('invalid destination: 400, no generation row, no AI call, no Pin', async () => {
    await withRoute(ROUTE, clayTables(), async (post, supabase, ai) => {
      const res = await post({ ...baseRequest, pinterestAccountId: ACC_AIR, boardId: B_POLY });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('board_account_mismatch');
      expect(ai.calls).toBe(0);
      expect(supabase.events.filter((e) => e.op === 'insert')).toHaveLength(0);
    });
    await withRoute(ROUTE, clayTables(), async (post, _supabase, ai) => {
      const res = await post({ ...baseRequest, pinterestAccountId: ACC_AIR, boardId: B_EASY, boardSectionId: SEC_PUMPKINS });
      expect((await res.json()).error.code).toBe('section_board_mismatch');
      expect(ai.calls).toBe(0);
    });
  });

  test('legacy request: free-text board + section stored as before, no new columns written', async () => {
    await withRoute(ROUTE, clayTables(), async (post, supabase) => {
      const res = await post({ ...baseRequest, board: 'Legacy Board', boardSection: 'Old Free Section' });
      expect(res.status).toBe(201);
      const pins = insertedPins(supabase)!;
      for (const pin of pins) {
        expect(pin.board).toBe('Legacy Board');
        expect(pin.board_section).toBe('Old Free Section');
        expect('pinterest_account_id' in pin).toBe(false);
        expect('pinterest_section_id' in pin).toBe(false);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Content Stream / account / section routes
// ---------------------------------------------------------------------------

test.describe('Content Stream API with destinations', () => {
  test('POST creates the stream with its account and destinations (primary written last)', async () => {
    const tables = clayTables();
    tables.content_stream_boards = [];
    await withRoute('@/app/api/content-streams/route', tables, async (post, supabase) => {
      const res = await post({
        projectId: PROJECT,
        name: 'Air Dry Clay 2',
        pinterestAccountId: ACC_AIR,
        destinations: [
          { boardId: B_PROJECTS, sectionId: SEC_PUMPKINS, isPrimary: true, weight: 2 },
          { boardId: B_PROJECTS, sectionId: SEC_COASTERS },
          { boardId: B_EASY, isActive: false },
        ],
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.boardLinked).toBe(true);
      const streamInsert = supabase.events.find((e) => e.table === 'content_streams' && e.op === 'insert')!.row as Row;
      expect(streamInsert.pinterest_account_id).toBe(ACC_AIR);
      const links = supabase.events.filter((e) => e.table === 'content_stream_boards' && e.op === 'insert').map((e) => e.row as Row);
      expect(links).toHaveLength(3);
      expect(links[links.length - 1]).toMatchObject({ board_id: B_PROJECTS, section_id: SEC_PUMPKINS, is_primary: true, weight: 2 });
      expect(links.filter((l) => l.is_primary)).toHaveLength(1);
    });
  });

  test('POST refuses a board of another account before creating anything', async () => {
    await withRoute('@/app/api/content-streams/route', clayTables(), async (post, supabase) => {
      const res = await post({ projectId: PROJECT, name: 'Mixed', pinterestAccountId: ACC_AIR, destinations: [{ boardId: B_POLY }] });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('board_account_mismatch');
      expect(supabase.events.filter((e) => e.op === 'insert')).toHaveLength(0);
    });
  });

  test('POST refuses a section of another board', async () => {
    await withRoute('@/app/api/content-streams/route', clayTables(), async (post) => {
      const res = await post({ projectId: PROJECT, name: 'Wrong section', pinterestAccountId: ACC_AIR, destinations: [{ boardId: B_EASY, sectionId: SEC_PUMPKINS }] });
      expect((await res.json()).error.code).toBe('section_board_mismatch');
    });
  });

  test('POST with the legacy boardId still creates a single-board stream (primary)', async () => {
    const tables = clayTables();
    tables.content_stream_boards = [];
    await withRoute('@/app/api/content-streams/route', tables, async (post, supabase) => {
      const res = await post({ projectId: PROJECT, name: 'Legacy 2', boardId: B_LEGACY });
      expect(res.status).toBe(201);
      const links = supabase.events.filter((e) => e.table === 'content_stream_boards' && e.op === 'insert').map((e) => e.row as Row);
      expect(links).toEqual([expect.objectContaining({ board_id: B_LEGACY, section_id: null, is_primary: true, is_active: true, weight: 1 })]);
      const streamInsert = supabase.events.find((e) => e.table === 'content_streams' && e.op === 'insert')!.row as Row;
      expect('pinterest_account_id' in streamInsert).toBe(false);
    });
  });

  test('PATCH: changing the account while old boards stay is refused; with matching destinations it is accepted', async () => {
    await withRoute('@/app/api/content-streams/[id]/route', clayTables(), async (call) => {
      const refused = await call({ pinterestAccountId: ACC_POLY }, 'PATCH', { id: S_AIR });
      expect(refused.status).toBe(400);
      expect((await refused.json()).error.code).toBe('destination_account_mismatch');
    });
    await withRoute('@/app/api/content-streams/[id]/route', clayTables(), async (call, supabase) => {
      const res = await call({ pinterestAccountId: ACC_POLY, destinations: [{ boardId: B_POLY, sectionId: SEC_POLY }] }, 'PATCH', { id: S_LEGACY });
      expect(res.status).toBe(200);
      const remaining = supabase.tables.content_stream_boards.filter((r) => r.content_stream_id === S_LEGACY);
      expect(remaining).toEqual([expect.objectContaining({ board_id: B_POLY, section_id: SEC_POLY, is_primary: true })]);
    });
  });

  test('PATCH: switching the primary never leaves two primaries; kept rows keep their id', async () => {
    await withRoute('@/app/api/content-streams/[id]/route', clayTables(), async (call, supabase) => {
      const res = await call(
        {
          destinations: [
            { boardId: B_PROJECTS, sectionId: SEC_PUMPKINS, weight: 2 },
            { boardId: B_EASY, isPrimary: true },
          ],
        },
        'PATCH',
        { id: S_AIR }
      );
      expect(res.status).toBe(200);
      const rows = supabase.tables.content_stream_boards.filter((r) => r.content_stream_id === S_AIR);
      expect(rows.map((r) => r.id).sort()).toEqual(['d1', 'd3']);
      expect(rows.filter((r) => r.is_primary).map((r) => r.board_id)).toEqual([B_EASY]);
    });
  });

  test('an account of another project cannot be used', async () => {
    const tables = clayTables();
    tables.pinterest_accounts[1].project_id = OTHER_PROJECT;
    await withRoute('@/app/api/content-streams/route', tables, async (post) => {
      const res = await post({ projectId: PROJECT, name: 'X', pinterestAccountId: ACC_POLY });
      expect((await res.json()).error.code).toBe('account_forbidden');
    });
  });
});

test.describe('Account, board and section routes', () => {
  test('POST /api/pinterest-accounts attaches the account to the caller\'s project', async () => {
    await withRoute('@/app/api/pinterest-accounts/route', clayTables(), async (post, supabase) => {
      const res = await post({ projectId: PROJECT, name: 'Clay Gifts', username: '@claygifts' });
      expect(res.status).toBe(201);
      const row = supabase.events.find((e) => e.table === 'pinterest_accounts')!.row as Row;
      expect(row).toMatchObject({ project_id: PROJECT, user_id: USER, name: 'Clay Gifts', username: '@claygifts', account_type: 'business', status: 'active' });
    });
  });

  test('POST /api/pinterest-accounts refuses another user\'s project', async () => {
    const tables = clayTables();
    tables.projects[1].user_id = OTHER_USER;
    await withRoute('@/app/api/pinterest-accounts/route', tables, async (post, supabase) => {
      const res = await post({ projectId: OTHER_PROJECT, name: 'Steal' });
      expect(res.status).toBe(403);
      expect(supabase.events).toHaveLength(0);
    });
  });

  test('PATCH /api/pinterest-accounts/[id] edits and archives', async () => {
    await withRoute('@/app/api/pinterest-accounts/[id]/route', clayTables(), async (call, supabase) => {
      expect((await call({ notes: 'Pinned daily', status: 'archived' }, 'PATCH', { id: ACC_POLY })).status).toBe(200);
      expect(supabase.tables.pinterest_accounts.find((a) => a.id === ACC_POLY)).toMatchObject({ notes: 'Pinned daily', status: 'archived' });
    });
  });

  test('POST /api/board-sections: several sections in one board; foreign board refused', async () => {
    await withRoute('@/app/api/board-sections/route', clayTables(), async (post, supabase) => {
      expect((await post({ boardId: B_EASY, name: 'Coasters' })).status).toBe(201);
      expect((await post({ boardId: B_EASY, name: 'Ornaments' })).status).toBe(201);
      expect(supabase.tables.pinterest_board_sections.filter((s) => s.board_id === B_EASY).map((s) => s.name)).toEqual(['Coasters', 'Ornaments']);
      expect((await post({ boardId: B_FOREIGN, name: 'Steal' })).status).toBe(403);
    });
  });

  test('PATCH /api/board-sections/[id] deactivates a section', async () => {
    await withRoute('@/app/api/board-sections/[id]/route', clayTables(), async (call, supabase) => {
      expect((await call({ isActive: false }, 'PATCH', { id: SEC_COASTERS })).status).toBe(200);
      expect(supabase.tables.pinterest_board_sections.find((s) => s.id === SEC_COASTERS)!.is_active).toBe(false);
    });
  });

  test('POST /api/boards creates a board under an account; another project\'s account is refused', async () => {
    await withRoute('@/app/api/boards/route', clayTables(), async (post, supabase) => {
      expect((await post({ projectId: PROJECT, name: 'Clay Earrings', pinterestAccountId: ACC_POLY })).status).toBe(201);
      expect(supabase.tables.boards.find((b) => b.name === 'Clay Earrings')).toMatchObject({ pinterest_account_id: ACC_POLY });
      const res = await post({ projectId: OTHER_PROJECT, name: 'Wrong', pinterestAccountId: ACC_POLY });
      expect((await res.json()).error.code).toBe('account_forbidden');
    });
  });

  // The "used by another account's stream" block reads an embedded relation
  // the fake does not emulate: its rule is covered by findBlockingStream above.
  test('PATCH /api/boards/[id]: (de)activate; an account of another project is refused', async () => {
    const tables = clayTables();
    tables.pinterest_accounts.push({ id: '50000000-0000-4000-8000-0000000000aa', project_id: OTHER_PROJECT, user_id: USER, name: 'Elsewhere', status: 'active' });
    await withRoute('@/app/api/boards/[id]/route', tables, async (call, supabase) => {
      expect((await call({ isActive: false }, 'PATCH', { id: B_EASY })).status).toBe(200);
      expect(supabase.tables.boards.find((b) => b.id === B_EASY)!.is_active).toBe(false);
      const res = await call({ pinterestAccountId: '50000000-0000-4000-8000-0000000000aa' }, 'PATCH', { id: B_EASY });
      expect((await res.json()).error.code).toBe('account_forbidden');
      expect(supabase.tables.boards.find((b) => b.id === B_EASY)!.pinterest_account_id).toBe(ACC_AIR);
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Form lists (Account → Stream → Board → Section)
// ---------------------------------------------------------------------------

test.describe('Pinterest form dependent lists', () => {
  const structure = clayStructure();

  test('accounts: archived ones are never offered', () => {
    expect(selectAccount(structure, ACC_AIR)).toEqual({ mode: 'account', accountId: ACC_AIR, streamId: S_AIR, boardId: null, sectionId: null });
    expect(initialDestinationSelection(structure, PROJECT).mode).toBe('account');
  });

  test('streams and boards are filtered by account — never a board of another account', () => {
    expect(streamChoices(structure, ACC_POLY).map((s) => s.name)).toEqual(['Polymer Clay']);
    const airBoards = boardChoices(structure, ACC_AIR, null).map((b) => b.name);
    expect(airBoards).not.toContain('Polymer Clay Ideas');
    expect(airBoards).not.toContain('Legacy Board');
    expect(airBoards).not.toContain('Old Air Dry Board'); // inactive
  });

  test('with a stream, boards are its active destinations (primary first, once each)', () => {
    expect(boardChoices(structure, ACC_AIR, S_AIR).map((b) => b.name)).toEqual(['Air Dry Clay Projects', 'Easy Air Dry Clay Ideas']);
    expect(activeStreamDestinationCount(structure, ACC_AIR, S_AIR)).toBe(3);
  });

  test('sections are filtered by the chosen board, inactive ones hidden', () => {
    expect(sectionChoices(structure, B_PROJECTS).map((s) => s.name)).toEqual(['Pumpkins', 'Coasters']);
    expect(sectionChoices(structure, B_EASY)).toEqual([]);
  });

  test('request fields: ids only, section only with a board; legacy sends none', () => {
    expect(destinationRequestFields({ mode: 'account', accountId: ACC_AIR, streamId: S_AIR, boardId: null, sectionId: SEC_PUMPKINS })).toEqual({
      pinterestAccountId: ACC_AIR,
      contentStreamId: S_AIR,
    });
    expect(destinationRequestFields({ mode: 'legacy' })).toBeNull();
  });

  test('legacy mode when the project has no account; the suggested board picks its account', () => {
    expect(initialDestinationSelection({ ...structure, accounts: [] }, PROJECT)).toEqual({ mode: 'legacy' });
    expect(initialDestinationSelection(structure, PROJECT, 'Polymer Clay Ideas')).toEqual({
      mode: 'account',
      accountId: ACC_POLY,
      streamId: S_POLY,
      boardId: B_POLY,
      sectionId: null,
    });
  });

  test('blocking messages: no board, empty stream', () => {
    expect(destinationSelectionError(structure, { mode: 'account', accountId: ACC_AIR, streamId: null, boardId: null, sectionId: null })).toBe(
      'Choose a Content Stream or a board.'
    );
    expect(destinationSelectionError(structure, { mode: 'account', accountId: ACC_AIR, streamId: S_EMPTY, boardId: null, sectionId: null })).toContain(
      'no active board'
    );
    expect(destinationSelectionError(structure, { mode: 'legacy' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. CSV and legacy compatibility
// ---------------------------------------------------------------------------

test.describe('CSV and legacy Pins', () => {
  const pin = (board: string, section: string | null) => ({ board, board_section: section }) as unknown as Pin;

  test('exact board and section names in the "Pinterest board" column', () => {
    expect(formatPinterestBoardCell(pin('Air Dry Clay Projects', 'Pumpkins'))).toBe('Air Dry Clay Projects/Pumpkins');
    expect(formatPinterestBoardCell(pin('Easy Air Dry Clay Ideas', null))).toBe('Easy Air Dry Clay Ideas');
  });

  test('older Pins with a free-text pins.board_section are still read and exported', () => {
    expect(formatPinterestBoardCell(pin('Legacy Board', 'Old Free Section'))).toBe('Legacy Board/Old Free Section');
  });

  test('CSV columns unchanged (Pinterest bulk format has no account column) and UTM still applied', () => {
    const csv = generatePinterestCsv(
      [{ ...pin('Air Dry Clay Projects', 'Pumpkins'), title: 'T', description: 'D', keywords: 'k', media_url: 'https://m/x.jpg', link_url: 'https://clayidealab.com/a/', publish_date: null } as unknown as Pin],
      { utmTracking: true }
    );
    const [header, row] = csv.replace('﻿', '').split('\n');
    expect(header).toBe('Title,Media URL,Pinterest board,Description,Link,Publish date,Keywords or tags');
    expect(row).toContain('Air Dry Clay Projects/Pumpkins');
    expect(row).toContain('utm_source=pinterest');
  });
});

// ---------------------------------------------------------------------------
// 10. Migration 047 (static guard; the live run is documented in TESTING.md)
// ---------------------------------------------------------------------------

test.describe('Migration 047', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/047_add_pinterest_accounts_and_sections.sql'), 'utf8');
  const code = sql.replace(/--.*$/gm, '');

  test('extends content_stream_boards instead of creating a second destination table', () => {
    expect(code).not.toMatch(/CREATE TABLE\s+content_stream_destinations/i);
    expect(code).toMatch(/ALTER TABLE content_stream_boards ADD COLUMN section_id/);
    expect(code).toMatch(/content_stream_boards_board_unique[\s\S]*WHERE section_id IS NULL/);
    expect(code).toMatch(/content_stream_boards_board_section_unique[\s\S]*WHERE section_id IS NOT NULL/);
    expect(code).toMatch(/content_stream_boards_one_primary[\s\S]*WHERE is_primary/);
    expect(code).toMatch(/CHECK \(NOT is_primary OR is_active\)/);
    expect(code).toMatch(/FOREIGN KEY \(section_id, board_id\)\s+REFERENCES pinterest_board_sections \(id, board_id\)/);
  });

  test('boards and streams can only point at an account of their own project', () => {
    expect(code).toMatch(/boards_pinterest_account_fkey\s+FOREIGN KEY \(pinterest_account_id, project_id\)/);
    expect(code).toMatch(/content_streams_pinterest_account_fkey\s+FOREIGN KEY \(pinterest_account_id, project_id\)/);
    expect(code).toMatch(/pinterest_board_sections_board_name_unique ON pinterest_board_sections \(board_id, lower\(name\)\)/);
  });

  test('non-destructive: no table dropped, no row deleted, every new table has RLS', () => {
    expect(code).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM|DROP COLUMN/i);
    for (const table of ['pinterest_accounts', 'pinterest_board_sections']) {
      expect(code).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(code).toMatch(/cs\.pinterest_account_id IS NULL OR b\.pinterest_account_id = cs\.pinterest_account_id/);
    expect(code).not.toMatch(/password|cookie|token/i);
  });
});
