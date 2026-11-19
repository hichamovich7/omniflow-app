import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MetaGraphClient } from '@/lib/social/meta/graph-client';
import { publishFacebookContent, retryFacebookComment } from '@/lib/social/facebook-publish';
import { rescheduleFacebookPublication, runDueFacebookSchedules, scheduleFacebookContent, type DueRunDeps } from '@/lib/social/facebook-schedule';
import {
  findProjectPageConnection,
  getSocialConnection,
  listProjectFacebookConnections,
  saveFacebookPageConnection,
} from '@/lib/queries/social-connections';
import { facebookDraftCategoryIds, listFacebookPageCategoryMappings, setFacebookPageCategoryMapping } from '@/lib/queries/facebook-page-mappings';
import type { NewPublication, PublicationStore, ScheduleStore } from '@/lib/queries/social-publications';
import {
  currentPublication,
  otherPagePublication,
  resolvePublicationConnection,
  suggestFacebookPage,
  type FacebookPageCategoryMapping,
} from '@/lib/social/facebook-pages';
import { facebookPageCategorySchema } from '@/lib/validations/facebook';
import type { PublicationStatus, SocialConnection, SocialPublication } from '@/lib/social/facebook-publication';
import type { SocialContentGeneration } from '@/lib/social/social-content';

/**
 * TASK-102 — several Facebook Pages per project, one target Page per
 * publication or schedule, Page suggestion by WordPress category.
 * Offline: Meta is a fake fetch, Supabase an in-memory query builder with
 * the unique keys of migrations 046 / 053. No Meta call, no database.
 */

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = 'user-1';
const OTHER_USER = 'user-2';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const OTHER_PROJECT = '33333333-3333-4333-8333-333333333333';
const DRAFT = '66666666-6666-4666-8666-666666666666';
const PAGE_A = '1111111111';
const PAGE_B = '2222222222';
const CAT_SWEATERS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CAT_HATS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PERMALINK = 'https://crochet.example.test/sweater-patterns/';
const IMAGE = 'https://crochet.example.test/wp-content/uploads/featured.jpg';
const TOKEN = 'EAAG-page-token-SECRET';
const NOW = new Date('2026-11-19T10:00:00Z');
const IN_ONE_HOUR = new Date('2026-11-19T11:00:00Z');
const AFTER = new Date('2026-11-19T11:00:30Z');

// ---------------------------------------------------------------------------
// In-memory Supabase (just what the query modules use)

type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: { code: string } | null };

interface Builder extends PromiseLike<Result> {
  select(columns?: string): Builder;
  eq(column: string, value: unknown): Builder;
  in(column: string, values: unknown[]): Builder;
  is(column: string, value: unknown): Builder;
  neq(column: string, value: unknown): Builder;
  order(column: string, options?: unknown): Builder;
  insert(row: Row): Builder;
  upsert(row: Row, options: { onConflict: string }): Builder;
  update(patch: Row): Builder;
  delete(): Builder;
  maybeSingle(): Promise<{ data: Row | null; error: { code: string } | null }>;
  single(): Promise<{ data: Row | null; error: { code: string } | null }>;
}

function fakeSupabase(uniqueKeys: Record<string, string[][]>) {
  const tables: Record<string, Row[]> = {};
  let counter = 0;
  const rowsOf = (table: string) => (tables[table] ??= []);
  const sameKey = (a: Row, b: Row, key: string[]) => key.every((column) => a[column] === b[column]);

  function from(table: string): Builder {
    const filters: Array<(row: Row) => boolean> = [];
    let op: { kind: 'select' } | { kind: 'insert'; row: Row } | { kind: 'upsert'; row: Row; key: string[] } | { kind: 'update'; patch: Row } | { kind: 'delete' } = {
      kind: 'select',
    };
    const matches = (row: Row) => filters.every((filter) => filter(row));
    const conflicts = (candidate: Row, except?: Row) =>
      (uniqueKeys[table] ?? []).some((key) => rowsOf(table).some((row) => row !== except && sameKey(row, candidate, key)));

    function run(): Result {
      const rows = rowsOf(table);
      if (op.kind === 'select') return { data: rows.filter(matches).map((row) => ({ ...row })), error: null };
      if (op.kind === 'insert') {
        if (conflicts(op.row)) return { data: null, error: { code: '23505' } };
        const row = { id: `${table}-${++counter}`, ...op.row };
        rows.push(row);
        return { data: [{ ...row }], error: null };
      }
      if (op.kind === 'upsert') {
        const upsert = op;
        if (!(uniqueKeys[table] ?? []).some((key) => key.join(',') === upsert.key.join(','))) return { data: null, error: { code: '42P10' } };
        const existing = rows.find((row) => sameKey(row, upsert.row, upsert.key));
        if (existing) {
          Object.assign(existing, upsert.row);
          return { data: [{ ...existing }], error: null };
        }
        if (conflicts(op.row)) return { data: null, error: { code: '23505' } };
        const row = { id: `${table}-${++counter}`, ...op.row };
        rows.push(row);
        return { data: [{ ...row }], error: null };
      }
      if (op.kind === 'update') {
        const patch = op.patch;
        const hit = rows.filter(matches);
        hit.forEach((row) => Object.assign(row, patch));
        return { data: hit.map((row) => ({ ...row })), error: null };
      }
      const removed = rows.filter(matches);
      tables[table] = rows.filter((row) => !matches(row));
      return { data: removed.map((row) => ({ ...row })), error: null };
    }

    const builder: Builder = {
      select: () => builder,
      eq: (column, value) => (filters.push((row) => row[column] === value), builder),
      in: (column, values) => (filters.push((row) => values.includes(row[column])), builder),
      is: (column, value) => (filters.push((row) => (row[column] ?? null) === value), builder),
      neq: (column, value) => (filters.push((row) => row[column] !== value), builder),
      order: () => builder,
      insert: (row) => ((op = { kind: 'insert', row }), builder),
      upsert: (row, options) => ((op = { kind: 'upsert', row, key: options.onConflict.split(',') }), builder),
      update: (patch) => ((op = { kind: 'update', patch }), builder),
      delete: () => ((op = { kind: 'delete' }), builder),
      maybeSingle: async () => {
        const result = run();
        return { data: result.data?.[0] ?? null, error: result.error };
      },
      single: async () => {
        const result = run();
        return { data: result.data?.[0] ?? null, error: result.error ?? (result.data?.length ? null : { code: 'PGRST116' }) };
      },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, tables, rowsOf };
}

/** social_connections with the unique key of migration 053 (046's (project, platform) key dropped). */
function connectionsDb() {
  const db = fakeSupabase({
    social_connections: [['project_id', 'platform', 'external_account_id']],
    facebook_page_category_mappings: [['project_id', 'wordpress_category_id']],
  });
  db.rowsOf('projects').push({ id: PROJECT, user_id: USER }, { id: OTHER_PROJECT, user_id: OTHER_USER });
  db.rowsOf('wordpress_categories').push(
    { id: CAT_SWEATERS, project_id: PROJECT, user_id: USER, name: 'Sweaters' },
    { id: CAT_HATS, project_id: PROJECT, user_id: USER, name: 'Hats' }
  );
  return db;
}

async function connect(db: ReturnType<typeof connectionsDb>, pageId: string, name: string, input: { userId?: string; projectId?: string; token?: string } = {}) {
  return saveFacebookPageConnection(db.client, {
    userId: input.userId ?? USER,
    projectId: input.projectId ?? PROJECT,
    pageId,
    pageName: name,
    encryptedToken: input.token ?? `enc-${pageId}`,
    grantedScopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'pages_manage_engagement', 'pages_read_user_content'],
    now: NOW,
  });
}

// ---------------------------------------------------------------------------
// Fake Meta Graph API — the post id is built from the Page in the URL

interface GraphCall {
  url: string;
  method: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeGraph(options: { commentFails?: boolean } = {}) {
  const calls: GraphCall[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url: input, method });
    const path = new URL(input).pathname;
    const photo = path.match(/\/(\d+)\/photos$/);
    if (method === 'POST' && photo) return json({ id: '667788', post_id: `${photo[1]}_667788` });
    const permalink = path.match(/\/(\d+_667788)$/);
    if (method === 'GET' && permalink) return json({ permalink_url: `https://www.facebook.com/${permalink[1]}` });
    if (method === 'GET' && /\/comments$/.test(path)) return json({ data: [] });
    if (method === 'POST' && /\/comments$/.test(path)) {
      return options.commentFails ? json({ error: { code: 2, message: 'temporary' } }, 500) : json({ id: 'c1' });
    }
    return json({ error: { code: 803, message: 'unexpected call' } }, 400);
  };
  const client = new MetaGraphClient({ appId: '123456789', appSecret: 'app-secret', graphVersion: 'v25.0' }, { fetchImpl, timeoutMs: 50 });
  const pagesTouched = () => [...new Set(calls.map((call) => new URL(call.url).pathname.match(/\/(\d{10})(?:_\d+)?(?:\/|$)/)?.[1]).filter(Boolean))];
  return {
    client,
    calls,
    posts: () => calls.filter((call) => call.method === 'POST' && /\/(photos|feed)$/.test(new URL(call.url).pathname)),
    comments: () => calls.filter((call) => call.method === 'POST' && /\/comments$/.test(new URL(call.url).pathname)),
    pagesTouched,
  };
}

// ---------------------------------------------------------------------------
// In-memory social_publications (same conditional rules as Supabase, UNIQUE (draft, Page))

function publicationsDb() {
  const rows = new Map<string, SocialPublication>();
  let counter = 0;
  const stale = (row: SocialPublication, now: Date) => !row.locked_at || now.getTime() - new Date(row.locked_at).getTime() > 90_000;

  function publications(userId: string): PublicationStore {
    const own = (id: string) => {
      const row = rows.get(id);
      return row && row.user_id === userId ? row : null;
    };
    return {
      async findForGeneration(generationId, pageId) {
        const row = [...rows.values()].find((r) => r.user_id === userId && r.social_content_generation_id === generationId && r.external_account_id === pageId);
        return row ? { ...row } : null;
      },
      async insert(row: NewPublication) {
        if ([...rows.values()].some((r) => r.social_content_generation_id === row.social_content_generation_id && r.external_account_id === row.external_account_id)) {
          return { row: null, conflict: true };
        }
        const full: SocialPublication = { ...row, id: `pub-${++counter}`, created_at: NOW.toISOString(), updated_at: NOW.toISOString() };
        rows.set(full.id, full);
        return { row: { ...full }, conflict: false };
      },
      async claimPost(id, now, patch) {
        const row = own(id);
        if (!row || row.external_post_id) return null;
        if (!(['failed', 'unknown', 'cancelled'].includes(row.status) || (row.status === 'publishing' && stale(row, now)))) return null;
        Object.assign(row, patch, { status: 'publishing', locked_at: now.toISOString() });
        return { ...row };
      },
      async claimComment(id, now) {
        const row = own(id);
        if (!row || !row.external_post_id || !row.comment_requested) return null;
        if (!(['failed', 'unknown'].includes(row.comment_status) || (row.comment_status === 'pending' && stale(row, now)))) return null;
        Object.assign(row, { comment_status: 'pending', locked_at: now.toISOString() });
        return { ...row };
      },
      async update(id, patch) {
        const row = own(id);
        if (!row) return null;
        Object.assign(row, patch);
        return { ...row };
      },
    };
  }

  function schedules(userId: string): ScheduleStore {
    const base = publications(userId);
    return {
      findForGeneration: base.findForGeneration,
      insert: base.insert,
      async transition(id, from: PublicationStatus[], patch) {
        const row = rows.get(id);
        if (!row || row.user_id !== userId || row.external_post_id || !from.includes(row.status)) return null;
        Object.assign(row, patch);
        return { ...row };
      },
      async claimScheduled(id, now, patch) {
        const row = rows.get(id);
        if (!row || row.user_id !== userId || row.status !== 'scheduled' || row.external_post_id) return null;
        if (!row.scheduled_at || new Date(row.scheduled_at).getTime() > now.getTime()) return null;
        Object.assign(row, patch, { status: 'publishing', locked_at: now.toISOString() });
        return { ...row };
      },
    };
  }

  const listDue = async (now: Date, limit: number) =>
    [...rows.values()]
      .filter((r) => r.status === 'scheduled' && r.scheduled_at && new Date(r.scheduled_at).getTime() <= now.getTime())
      .slice(0, limit)
      .map((r) => ({ ...r }));

  /** ON DELETE SET NULL of social_publications.connection_id (046) when a connection row is deleted. */
  const connectionDeleted = (connectionId: string) => {
    for (const row of rows.values()) if (row.connection_id === connectionId) row.connection_id = null;
  };

  return { rows, publications, schedules, listDue, connectionDeleted };
}

function draft(overrides: Partial<SocialContentGeneration> = {}) {
  return {
    id: DRAFT,
    user_id: USER,
    project_id: PROJECT,
    content_markdown: 'Three cosy crochet sweaters to make this winter, from easy raglans to textured cables.',
    call_to_action: 'Discover the three patterns in the full article.',
    first_comment_text: 'Here is the full article:',
    link_placement: 'first_comment' as const,
    cta_url: PERMALINK,
    image_url: IMAGE,
    ...overrides,
  };
}

const asConnection = (row: SocialConnection | null): SocialConnection => {
  if (!row) throw new Error('connection not saved');
  return row;
};

/** Cron dependencies reading connections from the fake social_connections table (by id + user_id, like the route). */
function cronDeps(pubs: ReturnType<typeof publicationsDb>, conns: ReturnType<typeof connectionsDb>, graph: ReturnType<typeof fakeGraph>, at: Date): DueRunDeps {
  return {
    listDue: pubs.listDue,
    storesFor: (userId) => ({ publications: pubs.publications(userId), schedules: pubs.schedules(userId) }),
    loadConnection: (publication) =>
      publication.connection_id ? getSocialConnection(conns.client, publication.user_id, publication.connection_id) : Promise.resolve(null),
    loadPageToken: async () => TOKEN,
    graph: graph.client,
    now: () => at,
  };
}

const resolveWith = (conns: ReturnType<typeof connectionsDb>, userId = USER) => ({
  byId: (id: string) => getSocialConnection(conns.client, userId, id),
  byProjectPage: (projectId: string, pageId: string) => findProjectPageConnection(conns.client, userId, projectId, pageId),
});

// ===========================================================================

test.describe('Several Pages per project (migration 053)', () => {
  test('a second Page is added next to the first one; reconnecting a Page refreshes the same row (no duplicate)', async () => {
    const conns = connectionsDb();
    const a = asConnection(await connect(conns, PAGE_A, 'Crochet Sweater Pattern'));
    const b = asConnection(await connect(conns, PAGE_B, 'Crochet Hats'));
    expect(a.id).not.toBe(b.id);
    let pages = await listProjectFacebookConnections(conns.client, USER, PROJECT);
    expect(pages.map((page) => page.external_account_id).sort()).toEqual([PAGE_A, PAGE_B]);

    // Page A expired, then reconnected with a new token: same id, status back to active, still two Pages.
    conns.rowsOf('social_connections').find((row) => row.id === a.id)!.status = 'expired';
    const again = asConnection(await connect(conns, PAGE_A, 'Crochet Sweater Pattern', { token: 'enc-new-token' }));
    expect(again.id).toBe(a.id);
    pages = await listProjectFacebookConnections(conns.client, USER, PROJECT);
    expect(pages).toHaveLength(2);
    const rowA = conns.rowsOf('social_connections').find((row) => row.id === a.id)!;
    expect(rowA).toMatchObject({ status: 'active', encrypted_access_token: 'enc-new-token' });
    expect(conns.rowsOf('social_connections').find((row) => row.id === b.id)).toMatchObject({ status: 'active', encrypted_access_token: `enc-${PAGE_B}` });
  });

  test('existing single-Page connections keep working: same row, pre-selected as the only Page', async () => {
    const conns = connectionsDb();
    // A row created before 053 (one Page per project) — nothing to migrate.
    conns.rowsOf('social_connections').push({
      id: 'legacy-connection',
      user_id: USER,
      project_id: PROJECT,
      platform: 'facebook',
      account_type: 'facebook_page',
      external_account_id: PAGE_A,
      external_account_name: 'Crochet Sweater Pattern',
      encrypted_access_token: 'enc-legacy',
      granted_scopes: ['pages_manage_posts', 'pages_manage_engagement'],
      status: 'active',
    });
    const pages = await listProjectFacebookConnections(conns.client, USER, PROJECT);
    expect(pages.map((page) => page.id)).toEqual(['legacy-connection']);
    expect(suggestFacebookPage({ connections: pages, mappings: [], categoryIds: [] })).toEqual({ connectionId: 'legacy-connection', reason: 'only_page' });
    // Reconnecting it keeps the id (so its publications keep connection_id).
    expect(asConnection(await connect(conns, PAGE_A, 'Crochet Sweater Pattern')).id).toBe('legacy-connection');
  });

  test('migration 053: new unique key per Page, mapping table with qualified RLS checks; 046-052 untouched; 049 still free', () => {
    const sql = read('supabase/migrations/053_add_facebook_multiple_pages.sql');
    expect(sql).toContain('DROP CONSTRAINT social_connections_project_platform_key;');
    expect(sql).toContain('ADD CONSTRAINT social_connections_project_platform_account_key UNIQUE (project_id, platform, external_account_id);');
    expect(sql).toContain('CONSTRAINT facebook_page_category_mappings_category_key UNIQUE (project_id, wordpress_category_id)');
    expect(sql).toContain('ALTER TABLE facebook_page_category_mappings ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('wc.project_id = facebook_page_category_mappings.project_id');
    expect(sql).toContain('c.external_account_id = facebook_page_category_mappings.external_account_id');
    expect(sql).not.toMatch(/encrypted_access_token|DROP TABLE|DROP COLUMN|DELETE FROM|UPDATE social_/);
    expect(sql).not.toMatch(/GRANT[^;]*social_connections/);
    const migrations = execSync('git ls-files supabase/migrations', { cwd: ROOT, encoding: 'utf8' });
    expect(migrations).not.toContain('049_');
    const changed = execSync('git status --porcelain -- supabase/migrations', { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    expect(changed.every((line) => /053_add_facebook_multiple_pages\.sql|054_grant_service_role_social_publications\.sql/.test(line))).toBe(true);
    // 046 itself is never edited: its old key stays documented there.
    expect(read('supabase/migrations/046_add_social_connections_and_publications.sql')).toContain('UNIQUE (project_id, platform)');
  });
});

test.describe('Migration 054 — service_role privileges on social_publications (TASK-100 follow-up)', () => {
  test('exactly SELECT and UPDATE for service_role, nothing else; 046 / 048 unchanged', () => {
    const sql = read('supabase/migrations/054_grant_service_role_social_publications.sql');
    const statements = sql
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('--'))
      .join(' ')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements).toEqual(['GRANT SELECT, UPDATE ON public.social_publications TO service_role']);
    expect(read('supabase/migrations/046_add_social_connections_and_publications.sql')).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_publications TO authenticated;');
    expect(read('supabase/migrations/046_add_social_connections_and_publications.sql')).not.toMatch(/social_publications TO service_role/);
    // The live check (PGlite) of 053 + 054 is versioned next to the 047 one.
    expect(read('tests/sql/053-054-facebook-pages-grants.verify.mjs')).toContain("['SELECT', true], ['UPDATE', true], ['INSERT', false], ['DELETE', false]");
  });
});

test.describe('Ownership — user and project', () => {
  test('connections of another user or another project are never returned', async () => {
    const conns = connectionsDb();
    const mine = asConnection(await connect(conns, PAGE_A, 'Mine'));
    const theirs = asConnection(await connect(conns, PAGE_B, 'Theirs', { userId: OTHER_USER, projectId: OTHER_PROJECT }));
    expect(await getSocialConnection(conns.client, USER, theirs.id)).toBeNull();
    expect(await getSocialConnection(conns.client, OTHER_USER, mine.id)).toBeNull();
    expect(await findProjectPageConnection(conns.client, USER, OTHER_PROJECT, PAGE_B)).toBeNull();
    expect(await findProjectPageConnection(conns.client, USER, PROJECT, PAGE_B)).toBeNull();
    expect((await listProjectFacebookConnections(conns.client, USER, PROJECT)).map((c) => c.id)).toEqual([mine.id]);
    expect(await listProjectFacebookConnections(conns.client, USER, OTHER_PROJECT)).toEqual([]);
  });

  test('a publication only resolves to its own Page, project and user — never another Page', async () => {
    const conns = connectionsDb();
    const a = asConnection(await connect(conns, PAGE_A, 'A'));
    const b = asConnection(await connect(conns, PAGE_B, 'B'));
    const other = asConnection(await connect(conns, PAGE_A, 'A elsewhere', { userId: OTHER_USER, projectId: OTHER_PROJECT }));
    const row = { user_id: USER, project_id: PROJECT, connection_id: b.id, external_account_id: PAGE_B };
    expect(await resolvePublicationConnection(row, resolveWith(conns))).toEqual({ connection: expect.objectContaining({ id: b.id }), relinked: false });
    // Connection id of another Page (corrupted / legacy replaced row) → refused, Page A is not used instead.
    expect(await resolvePublicationConnection({ ...row, connection_id: a.id }, resolveWith(conns))).toEqual({ connection: null, relinked: false });
    // Another user's connection id → not readable → falls back to the same Page in the same project only.
    const fallback = await resolvePublicationConnection({ ...row, connection_id: other.id }, resolveWith(conns));
    expect(fallback.connection?.id).toBe(b.id);
    expect(fallback.connection?.external_account_id).toBe(PAGE_B);
    // Page B disconnected: nothing, even though Page A is still connected to the project.
    conns.tables.social_connections = conns.rowsOf('social_connections').filter((r) => r.id !== b.id);
    expect(await resolvePublicationConnection({ ...row, connection_id: null }, resolveWith(conns))).toEqual({ connection: null, relinked: false });
    // Same Page id connected to another user's project: never used.
    expect(await resolvePublicationConnection({ ...row, external_account_id: PAGE_A, project_id: OTHER_PROJECT, connection_id: null }, resolveWith(conns))).toEqual({
      connection: null,
      relinked: false,
    });
  });

  test('category → Page mapping: own project, own category of that project, connected Page of that project only', async () => {
    const conns = connectionsDb();
    await connect(conns, PAGE_A, 'A');
    await connect(conns, PAGE_B, 'Other project Page', { userId: OTHER_USER, projectId: OTHER_PROJECT });
    conns.rowsOf('wordpress_categories').push({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', project_id: OTHER_PROJECT, user_id: OTHER_USER, name: 'X' });

    expect(await setFacebookPageCategoryMapping(conns.client, OTHER_USER, { projectId: PROJECT, categoryId: CAT_SWEATERS, pageId: PAGE_A })).toMatchObject({ ok: false, code: 'not_found' });
    expect(
      await setFacebookPageCategoryMapping(conns.client, USER, { projectId: PROJECT, categoryId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', pageId: PAGE_A })
    ).toMatchObject({ ok: false, code: 'category_not_found' });
    expect(await setFacebookPageCategoryMapping(conns.client, USER, { projectId: PROJECT, categoryId: CAT_SWEATERS, pageId: PAGE_B })).toMatchObject({
      ok: false,
      code: 'page_not_connected',
    });
    expect(conns.rowsOf('facebook_page_category_mappings')).toHaveLength(0);

    expect(await setFacebookPageCategoryMapping(conns.client, USER, { projectId: PROJECT, categoryId: CAT_SWEATERS, pageId: PAGE_A })).toMatchObject({ ok: true });
    await connect(conns, PAGE_B, 'B');
    // One suggestion per category: changing it replaces the row.
    expect(await setFacebookPageCategoryMapping(conns.client, USER, { projectId: PROJECT, categoryId: CAT_SWEATERS, pageId: PAGE_B })).toMatchObject({ ok: true });
    const { mappings } = await listFacebookPageCategoryMappings(conns.client, USER, PROJECT);
    expect(mappings).toEqual([expect.objectContaining({ wordpress_category_id: CAT_SWEATERS, external_account_id: PAGE_B })]);
    expect(await listFacebookPageCategoryMappings(conns.client, OTHER_USER, PROJECT)).toEqual({ mappings: [], unavailable: false });
    // Clear.
    expect(await setFacebookPageCategoryMapping(conns.client, USER, { projectId: PROJECT, categoryId: CAT_SWEATERS, pageId: null })).toEqual({ ok: true, mapping: null });
    expect(conns.rowsOf('facebook_page_category_mappings')).toHaveLength(0);

    expect(facebookPageCategorySchema.safeParse({ categoryId: CAT_SWEATERS, pageId: PAGE_A }).success).toBe(true);
    expect(facebookPageCategorySchema.safeParse({ categoryId: CAT_SWEATERS, pageId: null }).success).toBe(true);
    expect(facebookPageCategorySchema.safeParse({ categoryId: CAT_SWEATERS, pageId: 'abc' }).success).toBe(false);
    expect(facebookPageCategorySchema.safeParse({ categoryId: CAT_SWEATERS, pageId: PAGE_A, projectId: PROJECT }).success).toBe(false);
  });

  test('routes: auth + project ownership of the chosen Page, one Page per draft, own Page for Retry / Reschedule, no token in responses', () => {
    for (const path of ['app/api/social/generations/[id]/publish/route.ts', 'app/api/social/generations/[id]/schedule/route.ts']) {
      const code = read(path);
      expect(code, path).toContain('getSocialConnection(supabase, user.id, parsed.data.connectionId)');
      expect(code, path).toContain('connection.project_id !== generation.project_id');
      expect(code, path).toContain('otherPageConflictResponse(supabase, user.id, generation.id, connection.external_account_id)');
    }
    for (const path of ['lib/social/facebook-retry-route.ts', 'lib/social/facebook-schedule-route.ts']) {
      const code = read(path);
      expect(code, path).toContain('publicationConnection(supabase, user.id, publication)');
      expect(code, path).not.toContain('getSocialConnection');
    }
    expect(read('lib/social/facebook-retry-route.ts')).toContain('connection.external_account_id !== publication.external_account_id');
    // The cron is unchanged: a row whose connection was deleted is never sent (no lookup by Page).
    expect(read('app/api/cron/facebook-scheduled/route.ts')).toContain('publication.connection_id ? getSocialConnection(admin, publication.user_id, publication.connection_id)');
    const mapping = read('app/api/projects/[id]/facebook-page-categories/route.ts');
    expect(mapping).toContain('supabase.auth.getUser()');
    expect(mapping).toContain('facebookPageCategorySchema.safeParse(body)');
    expect(mapping).toContain('setFacebookPageCategoryMapping(supabase, user.id, { projectId: id, ...parsed.data })');
    expect(read('lib/queries/social-connections.ts')).toContain("{ onConflict: 'project_id,platform,external_account_id' }");
    for (const path of ['app/api/projects/[id]/facebook-page-categories/route.ts', 'lib/queries/facebook-page-mappings.ts', 'components/projects/facebook-page-categories-section.tsx']) {
      expect(read(path), path).not.toMatch(/encrypted_access_token|loadPageToken|decryptSocialToken|readEncryptedConnectionToken/);
    }
    // Client components never import server modules.
    for (const path of ['components/projects/facebook-page-categories-section.tsx', 'components/social/facebook-post-workspace.tsx', 'components/social/facebook-connections.tsx']) {
      expect(read(path), path).not.toMatch(/from '@\/lib\/(queries|supabase|social\/meta|social\/facebook-server)/);
    }
  });
});

test.describe('Publish now and schedule on the chosen Page only', () => {
  test('Publish now on Page B: post and first comment go to Page B only; the row is frozen on B', async () => {
    const conns = connectionsDb();
    await connect(conns, PAGE_A, 'A');
    const b = asConnection(await connect(conns, PAGE_B, 'B'));
    const pubs = publicationsDb();
    const graph = fakeGraph();
    const outcome = await publishFacebookContent(
      { generation: draft(), connection: b, pageToken: TOKEN },
      { graph: graph.client, store: pubs.publications(USER), now: () => NOW }
    );
    expect(outcome.publication).toMatchObject({ status: 'published', comment_status: 'published', external_account_id: PAGE_B, connection_id: b.id, external_account_name: 'B' });
    expect(graph.posts()).toHaveLength(1);
    expect(new URL(graph.posts()[0].url).pathname).toContain(`/${PAGE_B}/photos`);
    expect(graph.comments()).toHaveLength(1);
    expect(new URL(graph.comments()[0].url).pathname).toContain(`/${PAGE_B}_667788/comments`);
    expect(graph.pagesTouched()).toEqual([PAGE_B]);
  });

  test('Schedule on Page B, then the cron: post and comment on Page B only, Page A never touched', async () => {
    const conns = connectionsDb();
    await connect(conns, PAGE_A, 'A');
    const b = asConnection(await connect(conns, PAGE_B, 'B'));
    const pubs = publicationsDb();
    const row = await scheduleFacebookContent(
      { generation: draft(), connection: b, scheduledAt: IN_ONE_HOUR, timeZone: 'Europe/Paris' },
      { store: pubs.schedules(USER), now: () => NOW }
    );
    expect(row).toMatchObject({ status: 'scheduled', external_account_id: PAGE_B, connection_id: b.id });
    const graph = fakeGraph();
    const results = await runDueFacebookSchedules(cronDeps(pubs, conns, graph, AFTER));
    expect(results).toEqual([{ id: row.id, result: 'ran', status: 'published' }]);
    expect(graph.posts()).toHaveLength(1);
    expect(graph.comments()).toHaveLength(1);
    expect(graph.pagesTouched()).toEqual([PAGE_B]);
  });

  test('one draft targets one Page: a draft published, scheduled or running on Page A cannot be sent to Page B', () => {
    const base = { external_post_id: null, external_account_name: 'A', updated_at: NOW.toISOString() };
    const on = (status: PublicationStatus, extra: Partial<SocialPublication> = {}) => ({ ...base, status, external_account_id: PAGE_A, ...extra });
    for (const status of ['scheduled', 'publishing', 'unknown'] as const) expect(otherPagePublication([on(status)], PAGE_B)).not.toBeNull();
    expect(otherPagePublication([on('published', { external_post_id: `${PAGE_A}_1` })], PAGE_B)).not.toBeNull();
    expect(otherPagePublication([on('partial', { external_post_id: `${PAGE_A}_1` })], PAGE_B)).not.toBeNull();
    // Nothing on Facebook: a cancelled schedule or a refused post does not hold its Page.
    expect(otherPagePublication([on('cancelled'), on('failed')], PAGE_B)).toBeNull();
    // The same Page is never "another" Page (retry / schedule again reuse the row).
    expect(otherPagePublication([on('scheduled')], PAGE_A)).toBeNull();
    // The publication shown: the one holding a Page wins over a newer cancelled one.
    const older = { ...on('published', { external_post_id: `${PAGE_A}_1` }), updated_at: '2026-11-18T10:00:00Z' };
    const newer = { ...on('cancelled'), external_account_id: PAGE_B, updated_at: '2026-11-19T10:00:00Z' };
    expect(currentPublication([newer, older])).toBe(older);
    expect(currentPublication([{ ...on('failed'), updated_at: '2026-11-18T10:00:00Z' }, newer])).toBe(newer);
  });
});

test.describe('Page suggestion by WordPress category', () => {
  const A = { id: 'conn-a', external_account_id: PAGE_A };
  const B = { id: 'conn-b', external_account_id: PAGE_B };
  const map = (category: string, page: string) => ({ wordpress_category_id: category, external_account_id: page });

  test('only Page pre-selected; a mapped category suggests its Page; no mapping or several Pages → explicit choice', () => {
    expect(suggestFacebookPage({ connections: [], mappings: [], categoryIds: [CAT_SWEATERS] })).toEqual({ connectionId: null, reason: 'no_pages' });
    expect(suggestFacebookPage({ connections: [A], mappings: [map(CAT_HATS, PAGE_B)], categoryIds: [CAT_HATS] })).toEqual({ connectionId: 'conn-a', reason: 'only_page' });
    expect(suggestFacebookPage({ connections: [A, B], mappings: [map(CAT_SWEATERS, PAGE_B)], categoryIds: [CAT_SWEATERS] })).toEqual({ connectionId: 'conn-b', reason: 'category' });
    expect(suggestFacebookPage({ connections: [A, B], mappings: [map(CAT_SWEATERS, PAGE_B)], categoryIds: [CAT_HATS] })).toEqual({ connectionId: null, reason: 'none' });
    expect(suggestFacebookPage({ connections: [A, B], mappings: [], categoryIds: [] })).toEqual({ connectionId: null, reason: 'none' });
    expect(
      suggestFacebookPage({ connections: [A, B], mappings: [map(CAT_SWEATERS, PAGE_B), map(CAT_HATS, PAGE_A)], categoryIds: [CAT_SWEATERS, CAT_HATS] })
    ).toEqual({ connectionId: null, reason: 'ambiguous' });
    // Two categories → the same Page is not ambiguous.
    expect(
      suggestFacebookPage({ connections: [A, B], mappings: [map(CAT_SWEATERS, PAGE_B), map(CAT_HATS, PAGE_B)], categoryIds: [CAT_SWEATERS, CAT_HATS] })
    ).toEqual({ connectionId: 'conn-b', reason: 'category' });
    // A mapping to a Page that is not connected any more suggests nothing.
    expect(suggestFacebookPage({ connections: [A, { id: 'conn-c', external_account_id: '3333333333' }], mappings: [map(CAT_SWEATERS, PAGE_B)], categoryIds: [CAT_SWEATERS] })).toEqual({
      connectionId: null,
      reason: 'none',
    });
  });

  test("a draft's categories: its OmniFlow article's category and its Content Stream's category (read-only)", async () => {
    const db = fakeSupabase({});
    db.rowsOf('wordpress_articles').push({ generation_id: 'wp-gen-1', category_id: CAT_SWEATERS });
    db.rowsOf('content_streams').push({ id: 'stream-1', user_id: USER, wordpress_category_id: CAT_HATS }, { id: 'stream-2', user_id: OTHER_USER, wordpress_category_id: 'x' });
    expect(await facebookDraftCategoryIds(db.client, USER, { source_wordpress_generation_id: 'wp-gen-1', content_stream_id: null })).toEqual([CAT_SWEATERS]);
    expect((await facebookDraftCategoryIds(db.client, USER, { source_wordpress_generation_id: 'wp-gen-1', content_stream_id: 'stream-1' })).sort()).toEqual([CAT_SWEATERS, CAT_HATS].sort());
    expect(await facebookDraftCategoryIds(db.client, USER, { source_wordpress_generation_id: null, content_stream_id: 'stream-2' })).toEqual([]);
    expect(await facebookDraftCategoryIds(db.client, USER, { source_wordpress_generation_id: null, content_stream_id: null })).toEqual([]);
  });

  test('changing the category → Page mapping never changes an existing schedule', async () => {
    const conns = connectionsDb();
    const a = asConnection(await connect(conns, PAGE_A, 'A'));
    const b = asConnection(await connect(conns, PAGE_B, 'B'));
    await setFacebookPageCategoryMapping(conns.client, USER, { projectId: PROJECT, categoryId: CAT_SWEATERS, pageId: PAGE_B });
    const suggestionBefore = suggestFacebookPage({
      connections: [a, b],
      mappings: (await listFacebookPageCategoryMappings(conns.client, USER, PROJECT)).mappings,
      categoryIds: [CAT_SWEATERS],
    });
    expect(suggestionBefore.connectionId).toBe(b.id);

    const pubs = publicationsDb();
    const row = await scheduleFacebookContent(
      { generation: draft(), connection: b, scheduledAt: IN_ONE_HOUR, timeZone: 'Europe/Paris' },
      { store: pubs.schedules(USER), now: () => NOW }
    );
    // The project setting now suggests Page A for this category.
    await setFacebookPageCategoryMapping(conns.client, USER, { projectId: PROJECT, categoryId: CAT_SWEATERS, pageId: PAGE_A });
    const mappings: FacebookPageCategoryMapping[] = (await listFacebookPageCategoryMappings(conns.client, USER, PROJECT)).mappings;
    expect(suggestFacebookPage({ connections: [a, b], mappings, categoryIds: [CAT_SWEATERS] }).connectionId).toBe(a.id);
    expect(pubs.rows.get(row.id)).toMatchObject({ status: 'scheduled', external_account_id: PAGE_B, connection_id: b.id });

    const graph = fakeGraph();
    await runDueFacebookSchedules(cronDeps(pubs, conns, graph, AFTER));
    expect(graph.pagesTouched()).toEqual([PAGE_B]);
    expect(pubs.rows.get(row.id)).toMatchObject({ status: 'published', external_account_id: PAGE_B });
  });
});

test.describe('Disconnect / reconnect — no silent redirection', () => {
  test('scheduled Page disconnected: nothing sent (not even to the other Page), history kept', async () => {
    const conns = connectionsDb();
    await connect(conns, PAGE_A, 'A');
    const b = asConnection(await connect(conns, PAGE_B, 'B'));
    const pubs = publicationsDb();
    const row = await scheduleFacebookContent(
      { generation: draft(), connection: b, scheduledAt: IN_ONE_HOUR, timeZone: 'Europe/Paris' },
      { store: pubs.schedules(USER), now: () => NOW }
    );
    conns.tables.social_connections = conns.rowsOf('social_connections').filter((r) => r.id !== b.id);
    pubs.connectionDeleted(b.id);

    const graph = fakeGraph();
    const results = await runDueFacebookSchedules(cronDeps(pubs, conns, graph, AFTER));
    expect(results).toEqual([{ id: row.id, result: 'blocked', code: 'page_disconnected' }]);
    expect(graph.calls).toHaveLength(0);
    expect(pubs.rows.get(row.id)).toMatchObject({ status: 'failed', error_code: 'page_disconnected', external_account_id: PAGE_B, external_account_name: 'B' });
  });

  test('scheduled Page disconnected then reconnected: still not sent until the person confirms (Reschedule), then on the same Page', async () => {
    const conns = connectionsDb();
    await connect(conns, PAGE_A, 'A');
    const b = asConnection(await connect(conns, PAGE_B, 'B'));
    const pubs = publicationsDb();
    const row = await scheduleFacebookContent(
      { generation: draft(), connection: b, scheduledAt: IN_ONE_HOUR, timeZone: 'Europe/Paris' },
      { store: pubs.schedules(USER), now: () => NOW }
    );
    conns.tables.social_connections = conns.rowsOf('social_connections').filter((r) => r.id !== b.id);
    pubs.connectionDeleted(b.id);
    const b2 = asConnection(await connect(conns, PAGE_B, 'B'));
    expect(b2.id).not.toBe(b.id);
    // Before any confirmation the cron finds no connection for the row (connection_id NULL): it would be blocked, never sent.
    expect(await cronDeps(pubs, conns, fakeGraph(), AFTER).loadConnection(pubs.rows.get(row.id)!)).toBeNull();

    // Reschedule (explicit confirmation) links the row to the same Page again — the route's publicationConnection().
    const resolved = await resolvePublicationConnection(pubs.rows.get(row.id)!, resolveWith(conns));
    expect(resolved).toEqual({ connection: expect.objectContaining({ id: b2.id, external_account_id: PAGE_B }), relinked: true });
    await pubs.publications(USER).update(row.id, { connection_id: b2.id });
    await rescheduleFacebookPublication(pubs.rows.get(row.id)!, { scheduledAt: IN_ONE_HOUR, timeZone: 'Europe/Paris' }, { store: pubs.schedules(USER), now: () => NOW });

    const graph = fakeGraph();
    await runDueFacebookSchedules(cronDeps(pubs, conns, graph, AFTER));
    expect(graph.pagesTouched()).toEqual([PAGE_B]);
    expect(pubs.rows.get(row.id)).toMatchObject({ status: 'published', connection_id: b2.id });
  });

  test('partial publication, Page disconnected and reconnected: Retry comment adds the comment on the same post of Page B, no second post', async () => {
    const conns = connectionsDb();
    await connect(conns, PAGE_A, 'A');
    const b = asConnection(await connect(conns, PAGE_B, 'B'));
    const pubs = publicationsDb();
    const first = await publishFacebookContent(
      { generation: draft(), connection: b, pageToken: TOKEN },
      { graph: fakeGraph({ commentFails: true }).client, store: pubs.publications(USER), now: () => NOW }
    );
    expect(first.publication).toMatchObject({ status: 'partial', comment_status: 'failed', external_post_id: `${PAGE_B}_667788` });

    conns.tables.social_connections = conns.rowsOf('social_connections').filter((r) => r.id !== b.id);
    pubs.connectionDeleted(b.id);
    // While disconnected: no connection for this publication, Page A is never offered instead.
    expect(await resolvePublicationConnection(pubs.rows.get(first.publication.id)!, resolveWith(conns))).toEqual({ connection: null, relinked: false });

    const b2 = asConnection(await connect(conns, PAGE_B, 'B'));
    const resolved = await resolvePublicationConnection(pubs.rows.get(first.publication.id)!, resolveWith(conns));
    expect(resolved.connection?.id).toBe(b2.id);

    const graph = fakeGraph();
    const retry = await retryFacebookComment(pubs.rows.get(first.publication.id)!, TOKEN, { graph: graph.client, store: pubs.publications(USER), now: () => AFTER });
    expect(retry.publication).toMatchObject({ status: 'published', comment_status: 'published', external_post_id: `${PAGE_B}_667788` });
    expect(graph.posts()).toHaveLength(0);
    expect(graph.comments()).toHaveLength(1);
    expect(graph.pagesTouched()).toEqual([PAGE_B]);
    // History kept: one row, on Page B.
    expect([...pubs.rows.values()].map((r) => r.external_account_id)).toEqual([PAGE_B]);
  });
});

test.describe('UI wiring (source checks)', () => {
  test('Page selector, preview / confirmation name the target Page, frozen Page for Retry / Reschedule, mapping in project settings', () => {
    const workspace = read('components/social/facebook-post-workspace.tsx');
    expect(workspace).toContain('data-testid="facebook-page-selector"');
    expect(workspace).toContain('data-testid="facebook-preview-page"');
    expect(workspace).toContain("'Choose a Facebook Page first.'");
    expect(workspace).toContain('publicationHoldsPage(publication)');
    expect(workspace).toContain("retry('post')} disabled={!configured || !publicationPageUsable");
    expect(workspace).toContain('This post will be published now on the Facebook Page &quot;{connection?.external_account_name}&quot;');
    // other_page_publication: explained, with the way out to "Create new post with this image" (the "Post image" block).
    expect(workspace).toContain('response.error?.code === OTHER_PAGE_PUBLICATION_CODE');
    expect(workspace).toContain('data-testid="facebook-other-page-refusal"');
    expect(workspace).toContain('href="#facebook-post-image"');
    expect(workspace).toContain('Create new post with this image');
    expect(read('components/social/facebook-image-variants.tsx')).toContain('id="facebook-post-image"');
    expect(read('lib/social/facebook-server.ts')).toContain('jsonError(409, OTHER_PAGE_PUBLICATION_CODE, otherPageConflictMessage(blocking))');
    const connections = read('components/social/facebook-connections.tsx');
    expect(connections).toContain('Add another Page');
    expect(connections).toContain('Already connected to this project');
    expect(read('app/(dashboard)/projects/[id]/page.tsx')).toContain('<FacebookPageCategoriesSection');
    expect(read('app/(dashboard)/facebook/[id]/page.tsx')).toContain('suggestFacebookPage({ connections, mappings: mappings.mappings, categoryIds })');
    expect(read('components/social/facebook-article-posts.tsx')).toContain('Page &quot;{publication.external_account_name}&quot;');
  });
});
