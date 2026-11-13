import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MetaGraphClient } from '@/lib/social/meta/graph-client';
import {
  publicationContent,
  publishFacebookContent,
  retryFacebookComment,
  retryFacebookPost,
} from '@/lib/social/facebook-publish';
import {
  cancelFacebookSchedule,
  rescheduleFacebookPublication,
  runDueFacebookSchedules,
  scheduleFacebookContent,
  ScheduleValidationError,
  type DueRunDeps,
} from '@/lib/social/facebook-schedule';
import {
  formatScheduledTime,
  resolveScheduleChoice,
  utcToZonedParts,
  zonedDateTimeToUtc,
} from '@/lib/social/schedule-time';
import { isAuthorizedCronRequest } from '@/lib/social/cron-auth';
import { facebookRescheduleSchema, facebookScheduleSchema } from '@/lib/validations/facebook';
import { supabaseScheduleStore, type NewPublication, type PublicationStore, type ScheduleStore } from '@/lib/queries/social-publications';
import { publicationActions, type PublicationStatus, type SocialConnection, type SocialPublication } from '@/lib/social/facebook-publication';
import type { SocialContentGeneration } from '@/lib/social/social-content';

/**
 * TASK-100 — Facebook scheduling (OmniFlow queue + cron route).
 * Offline: the Meta Graph API is a fake fetch, the database an in-memory
 * store with the same conditional-update rules. No Meta call, no database.
 */

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = 'user-1';
const OTHER = 'user-2';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SAVED_ID = '66666666-6666-4666-8666-666666666666';
const CONNECTION_ID = '99999999-9999-4999-8999-999999999999';
const PERMALINK = 'https://crochet.example.test/colorful-crochet-scarf-patterns/';
const IMAGE = 'https://crochet.example.test/wp-content/uploads/featured.jpg';
const PAGE_ID = '1122334455';
const OTHER_PAGE_ID = '5544332211';
const POST_ID = `${PAGE_ID}_667788`;
const PAGE_TOKEN = 'EAAG-page-token-SECRET-123456789';
const APP_SECRET = 'app-secret-xyz';

// "Now" for every test: Friday 2026-11-13 10:00 UTC.
const NOW = new Date('2026-11-13T10:00:00Z');
const IN_ONE_HOUR = new Date('2026-11-13T11:00:00Z');

// ---------------------------------------------------------------------------
// Fake Meta Graph API

interface GraphCall {
  url: string;
  method: string;
  body: string;
}
type GraphHandler = (call: GraphCall) => Response | 'hang';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeGraph(handlers: Array<[RegExp, string, GraphHandler]>) {
  const calls: GraphCall[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const call = { url: input, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : '' };
    calls.push(call);
    const handler = handlers.find(([pattern, method]) => method === call.method && pattern.test(new URL(input).pathname));
    if (!handler) return json({ error: { code: 803, message: 'unexpected call' } }, 400);
    const out = handler[2](call);
    if (out === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return out;
  };
  const client = new MetaGraphClient({ appId: '123456789', appSecret: APP_SECRET, graphVersion: 'v25.0' }, { fetchImpl, timeoutMs: 50 });
  return { client, calls, posts: () => calls.filter((c) => c.method === 'POST' && /\/(photos|feed)$/.test(new URL(c.url).pathname)) };
}

const ok = {
  photo: [/\/photos$/, 'POST', () => json({ id: '667788', post_id: POST_ID })] as [RegExp, string, GraphHandler],
  permalink: [new RegExp(`/${POST_ID}$`), 'GET', () => json({ permalink_url: `https://www.facebook.com/${POST_ID}` })] as [RegExp, string, GraphHandler],
  comment: [/\/comments$/, 'POST', () => json({ id: `${POST_ID}_c1` })] as [RegExp, string, GraphHandler],
};

// ---------------------------------------------------------------------------
// In-memory social_publications with the same conditional rules as Supabase

function memoryDb() {
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

  async function listDue(now: Date, limit: number) {
    return [...rows.values()]
      .filter((r) => r.status === 'scheduled' && r.scheduled_at && new Date(r.scheduled_at).getTime() <= now.getTime())
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  return { rows, publications, schedules, listDue };
}

function generation(overrides: Partial<SocialContentGeneration> = {}) {
  return {
    id: SAVED_ID,
    user_id: USER,
    project_id: PROJECT_ID,
    content_markdown: 'Three colorful crochet scarves to make this winter, from easy waves to calm ombre shades.',
    call_to_action: 'Discover all three scarves in the full article.',
    first_comment_text: 'Here is the full article:',
    link_placement: 'first_comment' as const,
    cta_url: PERMALINK,
    image_url: IMAGE,
    ...overrides,
  };
}

const CONNECTION_REF = { id: CONNECTION_ID, external_account_id: PAGE_ID, external_account_name: 'Crochet Sweater Pattern' };

function connection(overrides: Partial<SocialConnection> = {}): SocialConnection {
  return {
    id: CONNECTION_ID,
    user_id: USER,
    project_id: PROJECT_ID,
    platform: 'facebook',
    account_type: 'facebook_page',
    external_account_id: PAGE_ID,
    external_account_name: 'Crochet Sweater Pattern',
    token_expires_at: null,
    granted_scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'pages_manage_engagement', 'pages_read_user_content'],
    status: 'active',
    last_verified_at: null,
    last_error_code: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

async function scheduled(db = memoryDb(), at = IN_ONE_HOUR, overrides: Partial<SocialContentGeneration> = {}) {
  const row = await scheduleFacebookContent(
    { generation: generation(overrides), connection: CONNECTION_REF, scheduledAt: at, timeZone: 'Europe/Paris' },
    { store: db.schedules(USER), now: () => NOW }
  );
  return { db, row };
}

function cronDeps(db: ReturnType<typeof memoryDb>, graph: ReturnType<typeof fakeGraph> | null, at: Date, conn: SocialConnection | null = connection()): DueRunDeps {
  return {
    listDue: db.listDue,
    storesFor: (userId) => ({ publications: db.publications(userId), schedules: db.schedules(userId) }),
    loadConnection: async (publication) => (conn && conn.id === publication.connection_id && conn.user_id === publication.user_id ? conn : null),
    loadPageToken: async () => PAGE_TOKEN,
    graph: graph?.client ?? null,
    now: () => at,
  };
}

const AFTER = new Date('2026-11-13T11:00:30Z');

// ===========================================================================

test.describe('Date, time and time zone (TASK-100)', () => {
  test('wall-clock time in an explicit zone → one UTC instant (winter, summer, New York)', () => {
    expect(zonedDateTimeToUtc('2026-11-20', '18:30', 'Europe/Paris')).toEqual({ ok: true, instant: new Date('2026-11-20T17:30:00Z') });
    expect(zonedDateTimeToUtc('2027-07-01', '18:30', 'Europe/Paris')).toEqual({ ok: true, instant: new Date('2027-07-01T16:30:00Z') });
    expect(zonedDateTimeToUtc('2026-11-20', '09:00', 'America/New_York')).toEqual({ ok: true, instant: new Date('2026-11-20T14:00:00Z') });
    expect(zonedDateTimeToUtc('2026-11-20', '09:00', 'UTC')).toEqual({ ok: true, instant: new Date('2026-11-20T09:00:00Z') });
    expect(utcToZonedParts('2026-11-20T17:30:00Z', 'Europe/Paris')).toEqual({ date: '2026-11-20', time: '18:30' });
    expect(formatScheduledTime('2026-11-20T17:30:00Z', 'Europe/Paris')).toContain('18:30');
    expect(formatScheduledTime('2026-11-20T17:30:00Z', 'Europe/Paris')).toContain('(Europe/Paris)');
  });

  test('a time skipped by a clock change, an invalid date or zone are refused', () => {
    expect(zonedDateTimeToUtc('2027-03-28', '02:30', 'Europe/Paris')).toEqual({ ok: false, reason: 'nonexistent' });
    expect(zonedDateTimeToUtc('2026-02-30', '10:00', 'Europe/Paris')).toEqual({ ok: false, reason: 'invalid' });
    expect(zonedDateTimeToUtc('2026-11-20', '25:00', 'Europe/Paris')).toEqual({ ok: false, reason: 'invalid' });
    expect(zonedDateTimeToUtc('2026-11-20', '10:00', 'Mars/Olympus')).toEqual({ ok: false, reason: 'invalid_time_zone' });
  });

  test('past dates, less than 5 minutes ahead and more than 90 days ahead are refused', () => {
    expect(resolveScheduleChoice({ date: '2026-11-13', time: '10:59', timeZone: 'Europe/Paris' }, NOW)).toMatchObject({ ok: false, message: expect.stringMatching(/past/) });
    expect(resolveScheduleChoice({ date: '2026-11-13', time: '10:03', timeZone: 'UTC' }, NOW)).toMatchObject({ ok: false, message: expect.stringMatching(/5 minutes/) });
    expect(resolveScheduleChoice({ date: '2027-03-01', time: '10:00', timeZone: 'UTC' }, NOW)).toMatchObject({ ok: false, message: expect.stringMatching(/90 days/) });
    expect(resolveScheduleChoice({ date: '2026-11-13', time: '12:00', timeZone: 'Europe/Paris' }, NOW)).toEqual({ ok: true, instant: new Date('2026-11-13T11:00:00Z') });
  });

  test('request bodies: explicit zone, explicit confirmation, strict fields', () => {
    const body = { connectionId: CONNECTION_ID, date: '2026-11-20', time: '18:30', timeZone: 'Europe/Paris', confirm: true };
    expect(facebookScheduleSchema.safeParse(body).success).toBe(true);
    expect(facebookScheduleSchema.safeParse({ ...body, timeZone: 'Nowhere/City' }).success).toBe(false);
    expect(facebookScheduleSchema.safeParse({ ...body, timeZone: undefined }).success).toBe(false);
    expect(facebookScheduleSchema.safeParse({ ...body, confirm: false }).success).toBe(false);
    expect(facebookScheduleSchema.safeParse({ ...body, scheduledAt: '2026-11-20T17:30:00Z' }).success).toBe(false);
    expect(facebookRescheduleSchema.safeParse({ date: '2026-11-20', time: '18:30', timeZone: 'UTC', confirm: true }).success).toBe(true);
  });
});

test.describe('Schedule, reschedule, cancel', () => {
  test('schedule stores the UTC instant + zone and the exact "Publish now" content; nothing is sent to Facebook', async () => {
    const { row } = await scheduled();
    const expected = publicationContent(generation(), CONNECTION_REF);
    expect(row).toMatchObject({
      status: 'scheduled',
      scheduled_at: '2026-11-13T11:00:00.000Z',
      scheduled_timezone: 'Europe/Paris',
      external_account_id: PAGE_ID,
      external_post_id: null,
      post_message: expected.post_message,
      post_image_url: IMAGE,
      comment_requested: true,
      comment_message: `Here is the full article:\n${PERMALINK}`,
      comment_status: 'pending',
      attempt_count: 0,
    });
    expect(row.post_message).not.toContain(PERMALINK);
    expect(publicationActions(row, NOW)).toEqual({
      canPublish: false,
      canRetry: false,
      canRetryComment: false,
      canEdit: false,
      canSchedule: false,
      canReschedule: true,
      canCancelSchedule: true,
    });
  });

  test('a past instant is refused by the scheduler itself', async () => {
    await expect(
      scheduleFacebookContent(
        { generation: generation(), connection: CONNECTION_REF, scheduledAt: new Date('2026-11-13T09:00:00Z'), timeZone: 'UTC' },
        { store: memoryDb().schedules(USER), now: () => NOW }
      )
    ).rejects.toBeInstanceOf(ScheduleValidationError);
  });

  test('scheduling twice is refused (use Reschedule)', async () => {
    const { db } = await scheduled();
    await expect(scheduled(db)).rejects.toMatchObject({ code: 'already_scheduled' });
    expect(db.rows.size).toBe(1);
  });

  test('reschedule moves the time; the cron then waits for the new time', async () => {
    const { db, row } = await scheduled();
    const later = new Date('2026-11-14T08:00:00Z');
    const moved = await rescheduleFacebookPublication(row, { scheduledAt: later, timeZone: 'America/New_York' }, { store: db.schedules(USER), now: () => NOW });
    expect(moved).toMatchObject({ status: 'scheduled', scheduled_at: later.toISOString(), scheduled_timezone: 'America/New_York' });

    const graph = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    expect(await runDueFacebookSchedules(cronDeps(db, graph, AFTER))).toEqual([]);
    expect(graph.calls).toHaveLength(0);
    const results = await runDueFacebookSchedules(cronDeps(db, graph, new Date('2026-11-14T08:00:10Z')));
    expect(results).toEqual([{ id: row.id, result: 'ran', status: 'published' }]);
    expect(graph.posts()).toHaveLength(1);
  });

  test('a cancelled publication never leaves; it can be published now or scheduled again', async () => {
    const { db, row } = await scheduled();
    const cancelled = await cancelFacebookSchedule(row, { store: db.schedules(USER) });
    expect(cancelled.status).toBe('cancelled');
    expect(publicationActions(cancelled, NOW)).toMatchObject({ canPublish: true, canSchedule: true, canEdit: true, canRetry: false, canReschedule: false });

    const graph = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    expect(await runDueFacebookSchedules(cronDeps(db, graph, AFTER))).toEqual([]);
    expect(graph.calls).toHaveLength(0);
    // A stale copy of the row (e.g. a cron run that listed it just before the cancel) cannot claim it.
    const staleList: DueRunDeps = { ...cronDeps(db, graph, AFTER), listDue: async () => [{ ...row }] };
    expect(await runDueFacebookSchedules(staleList)).toEqual([{ id: row.id, result: 'skipped' }]);
    expect(graph.calls).toHaveLength(0);
    // "Retry" (direct API call) does not publish a cancelled schedule either.
    await expect(retryFacebookPost(cancelled, PAGE_TOKEN, { graph: graph.client, store: db.publications(USER) })).rejects.toMatchObject({ code: 'post_not_retryable' });
    expect(graph.calls).toHaveLength(0);

    // Schedule again (same row, current text).
    const again = await scheduled(db, new Date('2026-11-13T12:00:00Z'), { content_markdown: 'Edited text after the cancel.' });
    expect(again.row).toMatchObject({ id: row.id, status: 'scheduled', post_message: expect.stringContaining('Edited text after the cancel.') });
    expect(db.rows.size).toBe(1);
  });

  test('reschedule and cancel are refused once the cron claimed the post', async () => {
    const { db, row } = await scheduled();
    await db.schedules(USER).claimScheduled(row.id, AFTER, {});
    await expect(cancelFacebookSchedule(row, { store: db.schedules(USER) })).rejects.toMatchObject({ code: 'not_scheduled' });
    await expect(
      rescheduleFacebookPublication(row, { scheduledAt: new Date('2026-11-14T08:00:00Z'), timeZone: 'UTC' }, { store: db.schedules(USER), now: () => NOW })
    ).rejects.toMatchObject({ code: 'not_scheduled' });
  });

  test('another user can neither cancel nor claim the row', async () => {
    const { db, row } = await scheduled();
    await expect(cancelFacebookSchedule(row, { store: db.schedules(OTHER) })).rejects.toMatchObject({ code: 'not_scheduled' });
    expect(await db.schedules(OTHER).claimScheduled(row.id, AFTER, {})).toBeNull();
    expect(db.rows.get(row.id)?.status).toBe('scheduled');
  });
});

test.describe('Cron run', () => {
  test('due post: photo post, id saved, then the first comment — same flow as Publish now', async () => {
    const { db, row } = await scheduled();
    const graph = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    const results = await runDueFacebookSchedules(cronDeps(db, graph, AFTER));
    expect(results).toEqual([{ id: row.id, result: 'ran', status: 'published' }]);
    expect(db.rows.get(row.id)).toMatchObject({ status: 'published', external_post_id: POST_ID, comment_status: 'published', attempt_count: 1 });
    const order = graph.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);
    expect(order).toEqual([`POST /v25.0/${PAGE_ID}/photos`, `GET /v25.0/${POST_ID}`, `POST /v25.0/${POST_ID}/comments`]);
    expect(new URLSearchParams(graph.calls[0].body).get('url')).toBe(IMAGE);
    expect(new URLSearchParams(graph.calls[2].body).get('message')).toBe(`Here is the full article:\n${PERMALINK}`);
  });

  test('not due yet: nothing happens', async () => {
    const { db, row } = await scheduled();
    const graph = fakeGraph([ok.photo]);
    expect(await runDueFacebookSchedules(cronDeps(db, graph, new Date('2026-11-13T10:59:59Z')))).toEqual([]);
    expect(db.rows.get(row.id)?.status).toBe('scheduled');
    expect(graph.calls).toHaveLength(0);
  });

  test('concurrent and repeated runs publish the post exactly once', async () => {
    const { db, row } = await scheduled();
    const graph = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    const [a, b, c] = await Promise.all([
      runDueFacebookSchedules(cronDeps(db, graph, AFTER)),
      runDueFacebookSchedules(cronDeps(db, graph, AFTER)),
      runDueFacebookSchedules(cronDeps(db, graph, AFTER)),
    ]);
    const all = [...a, ...b, ...c];
    expect(all.filter((r) => r.result === 'ran')).toHaveLength(1);
    expect(all.filter((r) => r.result === 'skipped')).toHaveLength(2);
    expect(graph.posts()).toHaveLength(1);
    expect(graph.calls.filter((c2) => c2.url.endsWith('/comments'))).toHaveLength(1);
    // A later run finds nothing to do.
    expect(await runDueFacebookSchedules(cronDeps(db, graph, new Date('2026-11-13T11:05:00Z')))).toEqual([]);
    expect(graph.posts()).toHaveLength(1);
    expect(db.rows.get(row.id)?.status).toBe('published');
  });

  test('Page disconnected: failed with a clear error, nothing sent', async () => {
    const { db, row } = await scheduled();
    const graph = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    const results = await runDueFacebookSchedules(cronDeps(db, graph, AFTER, null));
    expect(results).toEqual([{ id: row.id, result: 'blocked', code: 'page_disconnected' }]);
    expect(db.rows.get(row.id)).toMatchObject({ status: 'failed', error_code: 'page_disconnected', external_post_id: null, locked_at: null });
    expect(db.rows.get(row.id)?.error_message).toMatch(/no longer connected.*Nothing was published/);
    expect(graph.calls).toHaveLength(0);
  });

  test('Page replaced by another Page on the project: never published to the other Page', async () => {
    const { db, row } = await scheduled();
    const graph = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    const replaced = connection({ external_account_id: OTHER_PAGE_ID, external_account_name: 'Another Page' });
    const results = await runDueFacebookSchedules(cronDeps(db, graph, AFTER, replaced));
    expect(results).toEqual([{ id: row.id, result: 'blocked', code: 'page_replaced' }]);
    expect(db.rows.get(row.id)).toMatchObject({ status: 'failed', error_code: 'page_replaced' });
    expect(graph.calls).toHaveLength(0);
  });

  test('expired connection, deleted content, Meta not configured: failed, nothing sent', async () => {
    for (const [conn, code, graphOn, deleteContent] of [
      [connection({ status: 'expired' }), 'connection_expired', true, false],
      [connection(), 'content_deleted', true, true],
      [connection(), 'meta_not_configured', false, false],
    ] as const) {
      const { db, row } = await scheduled();
      if (deleteContent) db.rows.get(row.id)!.social_content_generation_id = null;
      const graph = fakeGraph([ok.photo]);
      const results = await runDueFacebookSchedules(cronDeps(db, graphOn ? graph : null, AFTER, conn));
      expect(results).toEqual([{ id: row.id, result: 'blocked', code }]);
      expect(graph.calls).toHaveLength(0);
    }
  });

  test('comment fails: post kept (partial), never posted again; Retry comment sends the comment only', async () => {
    const { db, row } = await scheduled();
    const failing = fakeGraph([ok.photo, ok.permalink, [/\/comments$/, 'POST', () => json({ error: { code: 200, message: 'nope' } }, 403)]]);
    await runDueFacebookSchedules(cronDeps(db, failing, AFTER));
    const partial = db.rows.get(row.id)!;
    expect(partial).toMatchObject({ status: 'partial', external_post_id: POST_ID, comment_status: 'failed' });
    expect(publicationActions(partial, AFTER)).toMatchObject({ canRetryComment: true, canRetry: false, canPublish: false, canSchedule: false });

    // Later cron runs and "Publish now" never send the post again.
    await runDueFacebookSchedules(cronDeps(db, failing, new Date('2026-11-13T11:10:00Z')));
    await expect(
      publishFacebookContent({ generation: generation(), connection: CONNECTION_REF, pageToken: PAGE_TOKEN }, { graph: failing.client, store: db.publications(USER) })
    ).rejects.toMatchObject({ code: 'already_published' });
    expect(failing.posts()).toHaveLength(1);

    const working = fakeGraph([ok.photo, ok.comment]);
    const retried = await retryFacebookComment({ ...partial }, PAGE_TOKEN, { graph: working.client, store: db.publications(USER) });
    expect(retried.publication).toMatchObject({ status: 'published', comment_status: 'published', external_post_id: POST_ID });
    expect(working.calls.map((c) => new URL(c.url).pathname)).toEqual([`/v25.0/${POST_ID}/comments`]);
  });

  test('uncertain post (timeout): unknown, no automatic resend; Retry checks the Page first and adopts the post', async () => {
    const { db, row } = await scheduled();
    const hanging = fakeGraph([[/\/photos$/, 'POST', () => 'hang']]);
    await runDueFacebookSchedules(cronDeps(db, hanging, AFTER));
    const unknown = db.rows.get(row.id)!;
    expect(unknown.status).toBe('unknown');

    // The next cron run does not touch it.
    const next = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    expect(await runDueFacebookSchedules(cronDeps(db, next, new Date('2026-11-13T11:02:00Z')))).toEqual([]);
    expect(next.calls).toHaveLength(0);

    const lookup = fakeGraph([
      [new RegExp(`/${PAGE_ID}/published_posts$`), 'GET', () => json({ data: [{ id: POST_ID, message: unknown.post_message, created_time: '2026-11-13T11:00:10+0000' }] })],
      ok.permalink,
      ok.comment,
    ]);
    const retried = await retryFacebookPost({ ...unknown }, PAGE_TOKEN, { graph: lookup.client, store: db.publications(USER), now: () => new Date('2026-11-13T11:03:00Z') });
    expect(retried.publication).toMatchObject({ status: 'published', external_post_id: POST_ID, comment_status: 'published' });
    expect(lookup.posts()).toHaveLength(0);
  });

  test('the Page token never appears in a log line during a cron run', async () => {
    const lines: string[] = [];
    const original = { error: console.error, warn: console.warn, log: console.log, info: console.info };
    for (const level of ['error', 'warn', 'log', 'info'] as const) {
      console[level] = (...args: unknown[]) => lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    }
    try {
      const { db } = await scheduled();
      const graph = fakeGraph([ok.photo, ok.permalink, [/\/comments$/, 'POST', () => json({ error: { code: 190, message: `bad ${PAGE_TOKEN}` } }, 400)]]);
      await runDueFacebookSchedules(cronDeps(db, graph, AFTER));
      const { db: db2 } = await scheduled();
      const throwing: DueRunDeps = { ...cronDeps(db2, graph, AFTER), loadPageToken: async () => { throw new Error(`boom ${PAGE_TOKEN}`); } };
      await runDueFacebookSchedules(throwing);
    } finally {
      Object.assign(console, original);
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(PAGE_TOKEN);
      expect(line).not.toContain(APP_SECRET);
    }
  });
});

test.describe('Publish now — non-regression', () => {
  test('first publication unchanged: photo post, id saved, then the comment', async () => {
    const db = memoryDb();
    const graph = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    const outcome = await publishFacebookContent({ generation: generation(), connection: CONNECTION_REF, pageToken: PAGE_TOKEN }, { graph: graph.client, store: db.publications(USER) });
    expect(outcome.error).toBeNull();
    expect(outcome.publication).toMatchObject({ status: 'published', external_post_id: POST_ID, comment_status: 'published', attempt_count: 1 });
    expect(graph.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      `POST /v25.0/${PAGE_ID}/photos`,
      `GET /v25.0/${POST_ID}`,
      `POST /v25.0/${POST_ID}/comments`,
    ]);
    expect(publicationActions(null)).toMatchObject({ canPublish: true, canSchedule: true, canEdit: true });
  });

  test('a scheduled post cannot be published now (cancel first); after a cancel, Publish now sends the current text once', async () => {
    const { db, row } = await scheduled();
    const graph = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    await expect(
      publishFacebookContent({ generation: generation(), connection: CONNECTION_REF, pageToken: PAGE_TOKEN }, { graph: graph.client, store: db.publications(USER) })
    ).rejects.toMatchObject({ code: 'scheduled' });
    await expect(retryFacebookPost(row, PAGE_TOKEN, { graph: graph.client, store: db.publications(USER) })).rejects.toMatchObject({ code: 'scheduled' });
    expect(graph.calls).toHaveLength(0);

    await cancelFacebookSchedule(row, { store: db.schedules(USER) });
    const outcome = await publishFacebookContent(
      { generation: generation({ content_markdown: 'New text published right away.' }), connection: CONNECTION_REF, pageToken: PAGE_TOKEN },
      { graph: graph.client, store: db.publications(USER) }
    );
    expect(outcome.publication).toMatchObject({ status: 'published', external_post_id: POST_ID, comment_status: 'published' });
    expect(new URLSearchParams(graph.calls[0].body).get('caption')).toContain('New text published right away.');
    expect(graph.posts()).toHaveLength(1);
    // The cron never sends it again.
    expect(await runDueFacebookSchedules(cronDeps(db, graph, AFTER))).toEqual([]);
    expect(graph.posts()).toHaveLength(1);
  });

  test('statuses kept for existing rows: failed / unknown / partial actions unchanged', () => {
    const base = { external_post_id: null, comment_requested: true, comment_status: 'pending', locked_at: null } as unknown as SocialPublication;
    expect(publicationActions({ ...base, status: 'failed' }, NOW)).toMatchObject({ canPublish: false, canRetry: true, canEdit: true, canRetryComment: false });
    expect(publicationActions({ ...base, status: 'unknown' }, NOW)).toMatchObject({ canPublish: false, canRetry: true, canEdit: false, canSchedule: false });
    expect(publicationActions({ ...base, status: 'partial', external_post_id: POST_ID, comment_status: 'failed' }, NOW)).toMatchObject({
      canRetryComment: true,
      canRetry: false,
      canSchedule: false,
    });
  });
});

test.describe('Store, cron route, migration and UI (source checks)', () => {
  test('the Supabase schedule store filters every write on the owner and the current status', async () => {
    const calls: Array<{ op: string; args: unknown[] }> = [];
    const builder: Record<string, unknown> = {};
    for (const op of ['update', 'eq', 'is', 'in', 'lte', 'select']) {
      builder[op] = (...args: unknown[]) => (calls.push({ op, args }), builder);
    }
    builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
    const client = { from: () => builder } as unknown as SupabaseClient;
    const store = supabaseScheduleStore(client, USER);
    await store.transition('pub-1', ['scheduled'], { status: 'cancelled' });
    await store.claimScheduled('pub-1', AFTER, {});
    const userFilters = calls.filter((c) => c.op === 'eq' && c.args[0] === 'user_id');
    expect(userFilters).toHaveLength(2);
    expect(userFilters.every((c) => c.args[1] === USER)).toBe(true);
    expect(calls).toContainEqual({ op: 'in', args: ['status', ['scheduled']] });
    expect(calls).toContainEqual({ op: 'eq', args: ['status', 'scheduled'] });
    expect(calls).toContainEqual({ op: 'lte', args: ['scheduled_at', AFTER.toISOString()] });
    expect(calls.filter((c) => c.op === 'is' && c.args[0] === 'external_post_id')).toHaveLength(2);
  });

  test('cron route: CRON_SECRET bearer in constant time; the proxy exempts /api/cron/ only; triggered externally, not by vercel.json', () => {
    const secret = 'c'.repeat(32);
    const req = (auth?: string) => new Request('https://app.test/api/cron/facebook-scheduled', { headers: auth ? { authorization: auth } : {} });
    expect(isAuthorizedCronRequest(req(`Bearer ${secret}`), secret)).toBe(true);
    expect(isAuthorizedCronRequest(req(`Bearer ${secret}x`), secret)).toBe(false);
    expect(isAuthorizedCronRequest(req(), secret)).toBe(false);
    expect(isAuthorizedCronRequest(req('Bearer short'), 'short')).toBe(false);
    expect(isAuthorizedCronRequest(req(`Bearer ${secret}`), undefined)).toBe(false);

    const route = read('app/api/cron/facebook-scheduled/route.ts');
    expect(route).toContain('isAuthorizedCronRequest(request, process.env.CRON_SECRET)');
    expect(route).toContain('runDueFacebookSchedules');
    expect(route).not.toMatch(/pageToken\s*[,}]|access_token/);
    const middleware = read('lib/supabase/middleware.ts');
    expect(middleware).toContain("pathname.startsWith('/api/cron/')");
    // The route is called by an external scheduler (VPS crontab, every 5 minutes) — never declared as a Vercel cron.
    if (existsSync(join(ROOT, 'vercel.json'))) {
      const vercel = JSON.parse(read('vercel.json')) as { crons?: Array<{ path: string }> };
      expect((vercel.crons ?? []).map((cron) => cron.path)).not.toContain('/api/cron/facebook-scheduled');
    }
    expect(read('.env.example')).toContain('CRON_SECRET=');
  });

  test('routes: auth, ownership, confirmation, rate limit, Page of the project; no Meta call when scheduling', () => {
    const schedule = read('app/api/social/generations/[id]/schedule/route.ts');
    for (const needle of ['auth.getUser()', 'isValidUuid', 'facebookScheduleSchema', 'resolveScheduleChoice', "'social/facebook-publish'", 'connection.project_id !== generation.project_id', 'supabaseScheduleStore(supabase, user.id)']) {
      expect(schedule).toContain(needle);
    }
    expect(schedule).not.toContain('loadPageToken');
    expect(schedule).not.toContain('createFacebookGraph');
    const change = read('lib/social/facebook-schedule-route.ts');
    for (const needle of ['auth.getUser()', 'getSocialPublication(supabase, user.id, id)', 'scheduledConnectionProblem', 'facebookCancelScheduleSchema', 'facebookRescheduleSchema']) {
      expect(change).toContain(needle);
    }
  });

  test('migration 048: scheduled / cancelled statuses, UTC instant + zone, due index; additive', () => {
    const sql = read('supabase/migrations/048_add_social_publication_scheduling.sql');
    expect(sql).toContain("CHECK (status IN ('scheduled', 'cancelled', 'publishing', 'published', 'partial', 'failed', 'unknown'))");
    expect(sql).toContain('ADD COLUMN scheduled_at        timestamptz');
    expect(sql).toContain('scheduled_timezone');
    expect(sql).toContain("CHECK (status <> 'scheduled' OR (scheduled_at IS NOT NULL AND scheduled_timezone IS NOT NULL))");
    expect(sql).toContain("WHERE status = 'scheduled'");
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN (?!IF EXISTS)|DELETE FROM|UNIQUE \(project_id, platform\)/);
  });

  test('UI: Schedule with date, time and explicit zone; Page and time shown before confirmation; Reschedule / Cancel', () => {
    const ui = read('components/social/facebook-post-workspace.tsx');
    for (const needle of [
      'id="facebook-schedule-date"',
      'id="facebook-schedule-time"',
      'id="facebook-schedule-zone"',
      'facebook-schedule-preview',
      'Page: &quot;{schedulePageName}&quot;',
      'Schedule post',
      'Reschedule',
      'Cancel schedule',
      'never posts to another Page',
    ]) {
      expect(ui).toContain(needle);
    }
    expect(ui).not.toContain('Scheduling is not available yet');
  });
});
