import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildFacebookPostPrompt,
  checkFacebookPost,
  cleanFacebookText,
  FacebookPostError,
  facebookPostRow,
  generateFacebookPost,
  loadFacebookPostSource,
  saveFacebookPost,
  type FacebookGenerateTextFn,
  type FacebookPostSource,
} from '@/lib/social/facebook-post';
import {
  allowedLinkPlacements,
  composeFacebookFirstComment,
  composeFacebookPostMessage,
  facebookPartsFromRow,
  type SocialContentGeneration,
} from '@/lib/social/social-content';
import { facebookPostUpdateSchema, facebookPublishSchema, facebookSelectPageSchema } from '@/lib/validations/facebook';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { encryptSecret } from '@/lib/wordpress/crypto';
import { decryptSocialToken, encryptSocialToken } from '@/lib/social/meta/token-crypto';
import { getMetaConfig, META_BUSINESS_SCOPE, META_PAGE_SCOPES, oauthRedirectUri } from '@/lib/social/meta/config';
import { appSecretProof, buildOAuthDialogUrl, MetaGraphClient } from '@/lib/social/meta/graph-client';
import { classifyMetaError, metaErrorFromBody } from '@/lib/social/meta/errors';
import { newOAuthState, openOAuthState, openPendingConnection, sealOAuthState, sealPendingConnection, statesMatch } from '@/lib/social/meta/oauth-session';
import { publishFacebookContent, PublishConflictError, retryFacebookComment, retryFacebookPost } from '@/lib/social/facebook-publish';
import type { NewPublication, PublicationPatch, PublicationStore } from '@/lib/queries/social-publications';
import { supabasePublicationStore } from '@/lib/queries/social-publications';
import { facebookDisplayStatus, publicationActions, type SocialPublication } from '@/lib/social/facebook-publication';
import { SOCIAL_PLATFORMS } from '@/lib/social/platforms';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * TASK-068 — Facebook Content Studio + publication on Facebook Pages.
 * Offline: Supabase, WordPress and the Meta Graph API are all simulated;
 * no AI call, no Meta call, no database.
 */

process.env.WORDPRESS_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'b'.repeat(64);
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
process.env.R2_PUBLIC_URL = 'https://media.n8nflow.org';

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = 'user-1';
const OTHER = 'user-2';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '11111111-1111-4111-8111-111111111111';
const WP_GEN_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '77777777-7777-4777-8777-777777777777';
const STREAM_ID = '88888888-8888-4888-8888-888888888888';
const SAVED_ID = '66666666-6666-4666-8666-666666666666';
const CONNECTION_ID = '99999999-9999-4999-8999-999999999999';
const SITE_URL = 'https://crochet.example.test';
const PERMALINK = `${SITE_URL}/colorful-crochet-scarf-patterns/`;
const IMAGE = `${SITE_URL}/wp-content/uploads/featured.jpg`;
const PAGE_ID = '1122334455';
const POST_ID = `${PAGE_ID}_667788`;
const PAGE_TOKEN = 'EAAG-page-token-SECRET-123456789';
const APP_SECRET = 'app-secret-xyz';

const SECTIONS: Array<[string, string]> = [
  [
    'Waves Scarf',
    'A simple repeat of taller and shorter stitches turns the rows into soft waves across the whole piece. The waves look great in bright colors and the pattern stays easy to memorize after the first rows.',
  ],
  [
    'Color-Block Scarf',
    'Large blocks of color are joined row by row, which keeps the finishing quick and tidy. You can pick warm colors for winter or soft pastel colors for spring, and the blocks hide small mistakes well.',
  ],
  [
    'Ombre Scarf',
    'The shades move slowly from light to dark, so the scarf feels calm and easy to match with jackets. Changing the yarn every few rows creates the gradient without any complicated technique.',
  ],
];
const ARTICLE_MD = SECTIONS.map(([heading, text]) => `## ${heading}\n\n${text} ${text}`).join('\n\n');
const POST_HTML = SECTIONS.map(([heading, text]) => `<h2>${heading}</h2><p>${text} ${text}</p>`).join('');

// ---------------------------------------------------------------------------
// Fake Supabase

type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: string;
  args: unknown[];
}

function fakeSupabase(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    let mode: 'select' | 'insert' = 'select';
    let inserted: Row | null = null;
    const record = (op: string, ...args: unknown[]) => calls.push({ table, op, args });
    const result = () => (mode === 'insert' ? { data: { id: SAVED_ID, ...inserted }, error: null } : { data: rows, error: null, count: rows.length });
    const builder = {
      select: (...args: unknown[]) => (record('select', ...args), builder),
      eq: (column: string, value: unknown) => (record('eq', column, value), (rows = rows.filter((r) => r[column] === value)), builder),
      neq: (column: string, value: unknown) => ((rows = rows.filter((r) => r[column] !== value)), builder),
      in: (column: string, values: unknown[]) => (record('in', column, values), (rows = rows.filter((r) => values.includes(r[column]))), builder),
      is: (column: string, value: unknown) => (record('is', column, value), builder),
      not: (...args: unknown[]) => (record('not', ...args), builder),
      or: (filter: string) => (record('or', filter), builder),
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: async () => {
        const out = result();
        if (mode === 'insert') return out;
        const first = (out.data as Row[])[0];
        return { data: first ?? null, error: first ? null : { message: 'no rows' } };
      },
      maybeSingle: async () => ({ data: (result().data as Row[])[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve(result()),
      insert: (row: Row) => (record('insert', row), (mode = 'insert'), (inserted = row), builder),
      update: (patch: Row) => (record('update', patch), builder),
      upsert: () => (record('upsert'), builder),
      delete: () => (record('delete'), builder),
    };
    return builder;
  }
  return { client: { from } as unknown as SupabaseClient, calls };
}

function world(overrides: { generation?: Row; project?: Row; wpCategoryIds?: number[] } = {}) {
  return fakeSupabase({
    wordpress_generations: [
      { id: WP_GEN_ID, user_id: USER, project_id: PROJECT_ID, status: 'completed', language: 'en', keyword: 'scarf', ...overrides.generation },
    ],
    wordpress_articles: [
      {
        id: 'art-1',
        generation_id: WP_GEN_ID,
        status: 'completed',
        title: 'Colorful Crochet Scarf Patterns',
        meta_description: 'Three scarves to crochet.',
        content: ARTICLE_MD,
        wp_post_id: 1527,
        featured_image_url: null,
        category_id: CATEGORY_ID,
      },
    ],
    wordpress_article_images: [],
    wordpress_sites: [
      { id: SITE_ID, project_id: PROJECT_ID, user_id: USER, site_url: SITE_URL, wp_username: 'editor', encrypted_application_password: encryptSecret('pw pw pw'), created_at: '' },
    ],
    wordpress_categories: [{ id: CATEGORY_ID, project_id: PROJECT_ID, wp_category_id: 12 }],
    projects: [{ id: PROJECT_ID, user_id: USER, default_language: 'en', niche: 'Crochet', description: 'Friendly crochet blog for makers.', ...overrides.project }],
    content_streams: [{ id: STREAM_ID, user_id: USER, project_id: PROJECT_ID, wordpress_category_id: CATEGORY_ID, name: 'Crochet Scarves', status: 'active' }],
    social_content_generations: [],
  });
}

const wpPost = (categoryIds: number[] = [12]) => ({
  id: 1527,
  date: '2026-10-02T09:00:00',
  status: 'publish',
  link: PERMALINK,
  title: { rendered: 'Colorful Crochet Scarf Patterns' },
  excerpt: { rendered: '' },
  content: { rendered: POST_HTML, protected: false },
  categories: categoryIds,
  featured_media: 0,
  _embedded: { 'wp:featuredmedia': [{ source_url: IMAGE, alt_text: 'Three colorful crochet scarves' }] },
});

function wordpressFetch(categoryIds?: number[]) {
  const calls: Array<{ url: string; method: string }> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return new Response(JSON.stringify(wpPost(categoryIds)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fn, calls };
}

const GOOD_POST =
  'Soft waves, bold color blocks and a calm ombre gradient: these three crochet scarves are all about color. The waves scarf repeats taller and shorter stitches, the color-block scarf joins large blocks row by row, and the ombre scarf moves slowly from light to dark shades. Pick the one that matches your jackets and your favorite colors this season.';

function draft(overrides: Partial<{ post: string; cta: string; firstComment: string }> = {}) {
  return JSON.stringify({
    post: GOOD_POST,
    cta: 'Discover all three scarves in the full article.',
    firstComment: 'Here is the full article with every scarf:',
    ...overrides,
  });
}

function fakeGenerate(responses: string[]) {
  const prompts: ChatMessage[][] = [];
  const fn: FacebookGenerateTextFn = async ({ messages }) => {
    prompts.push(messages);
    return responses[Math.min(prompts.length - 1, responses.length - 1)];
  };
  return { fn, prompts };
}

async function omniflowSource(db = world()): Promise<FacebookPostSource> {
  return loadFacebookPostSource(db.client, USER, { wordpressArticleId: WP_GEN_ID }, { fetchImpl: wordpressFetch().fn });
}

// ---------------------------------------------------------------------------
// Fake Meta Graph API + in-memory publication store

interface GraphCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

type GraphHandler = (call: GraphCall) => Response | Promise<Response> | 'hang';

function fakeGraph(handlers: Array<[RegExp, string, GraphHandler]>) {
  const calls: GraphCall[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const call: GraphCall = {
      url: input,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : '',
    };
    calls.push(call);
    const handler = handlers.find(([pattern, method]) => method === call.method && pattern.test(new URL(input).pathname));
    if (!handler) return json({ error: { code: 803, message: 'unexpected call' } }, 400);
    const out = await handler[2](call);
    if (out === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return out;
  };
  const client = new MetaGraphClient({ appId: '123456789', appSecret: APP_SECRET, graphVersion: 'v25.0' }, { fetchImpl, timeoutMs: 50 });
  return { client, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ok = {
  photo: [/\/photos$/, 'POST', () => json({ id: '667788', post_id: POST_ID })] as [RegExp, string, GraphHandler],
  feed: [/\/feed$/, 'POST', () => json({ id: POST_ID })] as [RegExp, string, GraphHandler],
  permalink: [new RegExp(`/${POST_ID}$`), 'GET', () => json({ permalink_url: `https://www.facebook.com/${POST_ID}` })] as [RegExp, string, GraphHandler],
  comment: [/\/comments$/, 'POST', () => json({ id: `${POST_ID}_c1` })] as [RegExp, string, GraphHandler],
};

function memoryStore(initial: SocialPublication[] = []) {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]));
  const updates: Array<{ id: string; patch: PublicationPatch }> = [];
  let counter = 0;
  const store: PublicationStore = {
    async findForGeneration(generationId, pageId) {
      return [...rows.values()].find((row) => row.social_content_generation_id === generationId && row.external_account_id === pageId) ?? null;
    },
    async insert(row: NewPublication) {
      if ([...rows.values()].some((r) => r.social_content_generation_id === row.social_content_generation_id && r.external_account_id === row.external_account_id)) {
        return { row: null, conflict: true };
      }
      const full: SocialPublication = { ...row, id: `pub-${++counter}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      rows.set(full.id, full);
      return { row: { ...full }, conflict: false };
    },
    async claimPost(id, now, patch) {
      const row = rows.get(id);
      if (!row || row.external_post_id) return null;
      const stale = !row.locked_at || now.getTime() - new Date(row.locked_at).getTime() > 90_000;
      if (!(row.status === 'failed' || row.status === 'unknown' || (row.status === 'publishing' && stale))) return null;
      Object.assign(row, patch, { status: 'publishing', locked_at: now.toISOString() });
      return { ...row };
    },
    async claimComment(id, now) {
      const row = rows.get(id);
      if (!row || !row.external_post_id || !row.comment_requested) return null;
      const stale = !row.locked_at || now.getTime() - new Date(row.locked_at).getTime() > 90_000;
      if (!(row.comment_status === 'failed' || row.comment_status === 'unknown' || (row.comment_status === 'pending' && stale))) return null;
      Object.assign(row, { comment_status: 'pending', locked_at: now.toISOString() });
      return { ...row };
    },
    async update(id, patch) {
      updates.push({ id, patch });
      const row = rows.get(id);
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row };
    },
  };
  return { store, rows, updates };
}

function facebookRow(overrides: Partial<SocialContentGeneration> = {}): SocialContentGeneration {
  return {
    id: SAVED_ID,
    user_id: USER,
    project_id: PROJECT_ID,
    platform: 'facebook',
    status: 'completed',
    source_type: 'omniflow_article',
    source_wordpress_generation_id: WP_GEN_ID,
    source_wordpress_site_id: SITE_ID,
    source_wordpress_article_id: 1527,
    source_pinterest_generation_id: null,
    source_title: 'Colorful Crochet Scarf Patterns',
    language: 'en',
    title: 'Colorful Crochet Scarf Patterns',
    subtitle: null,
    content_markdown: GOOD_POST,
    content_html: '<p>x</p>',
    word_count: 60,
    image_url: IMAGE,
    image_alt: 'Scarves',
    cta_url: PERMALINK,
    call_to_action: 'Discover all three scarves in the full article.',
    first_comment_text: 'Here is the full article:',
    link_placement: 'first_comment',
    content_stream_id: STREAM_ID,
    created_at: '2026-10-15T08:00:00Z',
    updated_at: '2026-10-15T08:00:00Z',
    ...overrides,
  };
}

const CONNECTION = { id: CONNECTION_ID, external_account_id: PAGE_ID, external_account_name: 'Crochet Corner' };

function captureLogs() {
  const lines: string[] = [];
  const original = { error: console.error, warn: console.warn, log: console.log, info: console.info };
  for (const level of ['error', 'warn', 'log', 'info'] as const) {
    console[level] = (...args: unknown[]) => lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  }
  return {
    lines,
    restore: () => Object.assign(console, original),
  };
}

// ===========================================================================
// 1-8, 12-13 — generation

test.describe('Facebook post generation (TASK-068)', () => {
  test('1. from an OmniFlow article: WordPressArticleContext, exact permalink, article image, default first comment', async () => {
    const wp = wordpressFetch();
    const db = world();
    const source = await loadFacebookPostSource(db.client, USER, { wordpressArticleId: WP_GEN_ID }, { fetchImpl: wp.fn });
    expect(source.sourceType).toBe('omniflow_article');
    expect(source.permalink).toBe(PERMALINK);
    const generate = fakeGenerate([draft()]);
    const result = await generateFacebookPost(source, generate.fn);
    expect(result.post).toBe(GOOD_POST);
    expect(result.ctaUrl).toBe(PERMALINK);
    expect(result.linkPlacement).toBe('first_comment');
    expect(result.imageUrl).toBe(IMAGE);
    expect(result.language).toBe('en');
    expect(result.wordCount).toBeGreaterThan(30);
    expect(generate.prompts).toHaveLength(1);
    // 26. Only WordPress GETs — the source article is never written.
    expect(wp.calls.every((call) => call.method === 'GET')).toBe(true);
  });

  test('2. from an existing WordPress post of a connected site', async () => {
    const wp = wordpressFetch([12]);
    const source = await loadFacebookPostSource(world().client, USER, { wordpressPost: { siteId: SITE_ID, postId: 1527 } }, { fetchImpl: wp.fn });
    expect(source.sourceType).toBe('external_wordpress_post');
    expect(source.ref).toMatchObject({ sourceType: 'external_wordpress_post', wordpressSiteId: SITE_ID, wordpressPostId: 1527 });
    expect(source.permalink).toBe(PERMALINK);
    expect(source.contentStreams).toEqual([{ id: STREAM_ID, name: 'Crochet Scarves' }]);
    const result = await generateFacebookPost(source, fakeGenerate([draft()]).fn);
    expect(result.ctaUrl).toBe(PERMALINK);
    expect(wp.calls.every((call) => call.method === 'GET')).toBe(true);
  });

  test('3-5. the prompt reuses the article context (sections), the niche, the Content Stream and the Brand Profile', async () => {
    const source = await omniflowSource();
    const [system, user] = buildFacebookPostPrompt(source);
    for (const [heading] of SECTIONS) expect(user.content).toContain(heading);
    expect(user.content).toContain('<article>');
    expect(system.content).toContain('<niche_context>');
    expect(system.content).toContain('Niche: Crochet');
    expect(system.content).toContain('Content Stream (sub-niche): Crochet Scarves');
    expect(system.content).toContain('Friendly crochet blog for makers.');
    expect(`${system.content}${user.content}`).not.toContain(PERMALINK);
    expect(`${system.content}${user.content}`).not.toMatch(/https?:\/\//);
    const result = await generateFacebookPost(source, fakeGenerate([draft()]).fn);
    expect(result.contentStreamId).toBe(STREAM_ID);
  });

  test('6. language: the article language is required; a post in another language is refused', async () => {
    const source = await omniflowSource(world({ generation: { language: 'de' } }));
    expect(source.language).toBe('de');
    expect(buildFacebookPostPrompt(source)[0].content).toContain('Write in German');
    const issues = checkFacebookPost({ post: GOOD_POST, callToAction: '', firstCommentText: '' }, source);
    expect(issues.join(' ')).toMatch(/written in English; write it in German/);
  });

  test('7. no invented facts: a number or a material absent from the article is refused, then retried with feedback', async () => {
    const source = await omniflowSource();
    const parsedDraft = { post: `${GOOD_POST} Over 37 makers loved it.`, callToAction: 'Read it.', firstCommentText: '' };
    expect(checkFacebookPost(parsedDraft, source).join(' ')).toMatch(/Numbers not in the article: 37/);

    const generate = fakeGenerate([draft({ post: `${GOOD_POST} Over 37 makers loved it.` }), draft()]);
    const result = await generateFacebookPost(source, generate.fn);
    expect(result.post).toBe(GOOD_POST);
    expect(generate.prompts).toHaveLength(2);
    expect(generate.prompts[1][1].content).toMatch(/Numbers not in the article: 37/);

    const always = fakeGenerate([draft({ post: `${GOOD_POST} Over 37 makers loved it.` })]);
    await expect(generateFacebookPost(source, always.fn)).rejects.toBeInstanceOf(FacebookPostError);
  });

  test('8/11. URLs written by the model are removed; the only link is the validated permalink', async () => {
    const source = await omniflowSource();
    const result = await generateFacebookPost(
      source,
      fakeGenerate([draft({ post: `${GOOD_POST} https://evil.example.com/promo`, cta: 'Read more at www.other-site.com', firstComment: 'See crochet.example.test/fake' })]).fn
    );
    expect(`${result.post} ${result.callToAction} ${result.firstCommentText}`).not.toMatch(/https?:|www\.|\.com|\.test/);
    expect(result.ctaUrl).toBe(PERMALINK);
    expect(cleanFacebookText('Look [here](https://x.example.com) now')).toBe('Look here now');
  });

  test('11. without a permalink only "No link" is possible, and a stored placement cannot bring a link back', async () => {
    const source = await omniflowSource();
    const noLink = { ...source, permalink: null, permalinkWarning: 'none' };
    const result = await generateFacebookPost(noLink, fakeGenerate([draft()]).fn);
    expect(result.linkPlacement).toBe('none');
    expect(result.ctaUrl).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/only be published without a link/);
    expect(allowedLinkPlacements(null)).toEqual(['none']);
    const parts = facebookPartsFromRow(facebookRow({ cta_url: null, link_placement: 'first_comment' }));
    expect(parts.linkPlacement).toBe('none');
    expect(composeFacebookFirstComment(parts)).toBeNull();
    expect(composeFacebookPostMessage(parts)).not.toMatch(/https?:/);
  });

  test('12. saved in the social history with every Facebook field', async () => {
    const db = world();
    const source = await omniflowSource(db);
    const result = await generateFacebookPost(source, fakeGenerate([draft()]).fn);
    const saved = await saveFacebookPost(db.client, USER, source, result);
    expect(saved.id).toBe(SAVED_ID);
    const insert = db.calls.find((c) => c.table === 'social_content_generations' && c.op === 'insert')?.args[0] as Row;
    expect(insert).toMatchObject({
      user_id: USER,
      project_id: PROJECT_ID,
      platform: 'facebook',
      status: 'completed',
      source_type: 'omniflow_article',
      source_wordpress_generation_id: WP_GEN_ID,
      source_title: 'Colorful Crochet Scarf Patterns',
      language: 'en',
      content_markdown: GOOD_POST,
      cta_url: PERMALINK,
      image_url: IMAGE,
      call_to_action: 'Discover all three scarves in the full article.',
      first_comment_text: 'Here is the full article with every scarf:',
      link_placement: 'first_comment',
      content_stream_id: STREAM_ID,
    });
    expect(facebookPostRow(USER, source.ref, result).content_html).toContain('<p>');
  });

  test('13-14. ownership: another user cannot generate from this article', async () => {
    const db = world();
    await expect(loadFacebookPostSource(db.client, OTHER, { wordpressArticleId: WP_GEN_ID }, { fetchImpl: wordpressFetch().fn })).rejects.toBeInstanceOf(
      SocialGenerationError
    );
    await expect(loadFacebookPostSource(db.client, OTHER, { wordpressArticleId: WP_GEN_ID }, { fetchImpl: wordpressFetch().fn })).rejects.toMatchObject({
      status: 403,
    });
  });
});

// ===========================================================================
// 9-11 — link placement and edits

test.describe('Link placement', () => {
  test('9-10. first comment: no URL in the post; the comment is the lead-in then the exact permalink', () => {
    const parts = facebookPartsFromRow(facebookRow());
    const message = composeFacebookPostMessage(parts);
    expect(message).not.toContain(PERMALINK);
    expect(message).not.toMatch(/https?:/);
    expect(message).toContain('Discover all three scarves');
    expect(composeFacebookFirstComment(parts)).toBe(`Here is the full article:\n${PERMALINK}`);
  });

  test('main post: the exact permalink at the end of the post, no comment; no link: nothing anywhere', () => {
    const main = facebookPartsFromRow(facebookRow({ link_placement: 'main_post' }));
    expect(composeFacebookPostMessage(main).endsWith(`\n\n${PERMALINK}`)).toBe(true);
    expect(composeFacebookFirstComment(main)).toBeNull();
    const none = facebookPartsFromRow(facebookRow({ link_placement: 'none' }));
    expect(composeFacebookPostMessage(none)).not.toMatch(/https?:/);
    expect(composeFacebookFirstComment(none)).toBeNull();
  });

  test('11. edits never accept a URL; publishing needs an explicit confirmation and a Page', () => {
    const base = { post: 'A post.', callToAction: '', firstCommentText: '', linkPlacement: 'first_comment' };
    expect(facebookPostUpdateSchema.safeParse(base).success).toBe(true);
    for (const field of ['post', 'callToAction', 'firstCommentText'] as const) {
      for (const url of ['https://evil.example.com', 'www.evil.net', 'evil.com/path', 'shop.example.test', 'blog.example.at/page']) {
        const parsed = facebookPostUpdateSchema.safeParse({ ...base, [field]: `Text ${url}` });
        expect(parsed.success, `${field} ${url}`).toBe(false);
      }
    }
    expect(facebookPostUpdateSchema.safeParse({ ...base, linkPlacement: 'profile' }).success).toBe(false);
    // 15. No Page selected / no confirmation → refused before anything else.
    expect(facebookPublishSchema.safeParse({ confirm: true }).success).toBe(false);
    expect(facebookPublishSchema.safeParse({ connectionId: CONNECTION_ID }).success).toBe(false);
    expect(facebookPublishSchema.safeParse({ connectionId: CONNECTION_ID, confirm: true }).success).toBe(true);
    expect(facebookSelectPageSchema.safeParse({ projectId: PROJECT_ID, pageId: 'me/feed' }).success).toBe(false);
  });
});

// ===========================================================================
// 16-24 — Meta client and publication

test.describe('Meta Graph client', () => {
  test('tokens never in a URL: Authorization header + appsecret_proof; only Page endpoints', async () => {
    const graph = fakeGraph([ok.photo, ok.permalink]);
    await graph.client.createPhotoPost(PAGE_TOKEN, PAGE_ID, { imageUrl: IMAGE, caption: 'Hello' });
    const call = graph.calls[0];
    expect(call.url).toBe(`https://graph.facebook.com/v25.0/${PAGE_ID}/photos`);
    expect(call.url).not.toContain(PAGE_TOKEN);
    expect(call.headers.Authorization).toBe(`Bearer ${PAGE_TOKEN}`);
    expect(new URLSearchParams(call.body).get('appsecret_proof')).toBe(appSecretProof(PAGE_TOKEN, APP_SECRET));
    expect(call.body).not.toContain(PAGE_TOKEN);
    await expect(graph.client.createFeedPost(PAGE_TOKEN, 'me', { message: 'x' })).rejects.toMatchObject({ kind: 'page_unavailable' });
  });

  test('22-24. errors: OAuth / expired token, missing permission, deleted Page, rate limit, timeout', async () => {
    expect(classifyMetaError(190, 463, 400)).toBe('token_expired');
    expect(classifyMetaError(190, null, 400)).toBe('token_expired');
    expect(classifyMetaError(200, null, 403)).toBe('permission_denied');
    expect(classifyMetaError(10, null, 403)).toBe('permission_denied');
    expect(classifyMetaError(100, 33, 400)).toBe('page_unavailable');
    expect(classifyMetaError(4, null, 400)).toBe('rate_limited');
    expect(classifyMetaError(506, null, 400)).toBe('duplicate_post');
    const err = metaErrorFromBody(400, { error: { code: 190, error_subcode: 460, message: 'Session invalidated token=EAAG...', fbtrace_id: 'Ab12_c' } });
    expect(err.kind).toBe('token_expired');
    expect(err.message).not.toMatch(/EAAG|Session invalidated/);
    expect(err.codeLabel).toBe('190/460');
    expect(err.fbtraceId).toBe('Ab12_c');

    const hanging = fakeGraph([[/\/feed$/, 'POST', () => 'hang']]);
    await expect(hanging.client.createFeedPost(PAGE_TOKEN, PAGE_ID, { message: 'x' })).rejects.toMatchObject({ kind: 'timeout', ambiguous: true });

    const noToken = fakeGraph([[/\/oauth\/access_token$/, 'POST', () => json({ token_type: 'bearer' })]]);
    await expect(noToken.client.exchangeCode('code', 'https://app.example.test/cb')).rejects.toMatchObject({ kind: 'oauth_failed' });
  });

  test('OAuth exchanges send the App Secret and tokens in the POST body, never in the URL', async () => {
    const graph = fakeGraph([[/\/oauth\/access_token$/, 'POST', () => json({ access_token: 'LONG-USER-TOKEN', expires_in: 5183944 })]]);
    await graph.client.exchangeLongLived('SHORT-USER-TOKEN');
    expect(graph.calls[0].url).not.toMatch(/SHORT-USER-TOKEN|app-secret|client_secret/);
    expect(graph.calls[0].body).toContain('fb_exchange_token=SHORT-USER-TOKEN');
  });
});

test.describe('Publication flow', () => {
  test('17-18. success: photo post saved first, then the first comment; never a WordPress call', async () => {
    const graph = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    const { store, updates } = memoryStore();
    const outcome = await publishFacebookContent({ generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: graph.client, store });
    expect(outcome.error).toBeNull();
    expect(outcome.publication).toMatchObject({ status: 'published', external_post_id: POST_ID, comment_status: 'published', external_comment_id: `${POST_ID}_c1` });
    expect(facebookDisplayStatus(outcome.publication)).toBe('comment_published');
    // The post id is saved before the comment request is sent.
    expect(updates[0].patch).toMatchObject({ status: 'published', external_post_id: POST_ID });
    const order = graph.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);
    expect(order).toEqual([`POST /v25.0/${PAGE_ID}/photos`, `GET /v25.0/${POST_ID}`, `POST /v25.0/${POST_ID}/comments`]);
    expect(new URLSearchParams(graph.calls[0].body).get('caption')).not.toContain(PERMALINK);
    expect(new URLSearchParams(graph.calls[2].body).get('message')).toBe(`Here is the full article:\n${PERMALINK}`);
    expect(graph.calls.every((c) => c.url.startsWith('https://graph.facebook.com/'))).toBe(true);
  });

  test('text post when there is no image; main post link has no comment', async () => {
    const graph = fakeGraph([ok.feed, ok.permalink]);
    const { store } = memoryStore();
    const outcome = await publishFacebookContent(
      { generation: facebookRow({ image_url: null, link_placement: 'main_post' }), connection: CONNECTION, pageToken: PAGE_TOKEN },
      { graph: graph.client, store }
    );
    expect(outcome.publication).toMatchObject({ status: 'published', comment_requested: false, comment_status: 'not_requested' });
    expect(new URLSearchParams(graph.calls[0].body).get('message')).toContain(PERMALINK);
    expect(graph.calls.some((c) => c.url.endsWith('/comments'))).toBe(false);
  });

  test('19-20. comment fails → partial, post kept; Retry comment posts the comment only, never the post', async () => {
    const failing = fakeGraph([ok.photo, ok.permalink, [/\/comments$/, 'POST', () => json({ error: { code: 200, message: 'nope' } }, 403)]]);
    const memory = memoryStore();
    const first = await publishFacebookContent({ generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: failing.client, store: memory.store });
    expect(first.publication).toMatchObject({ status: 'partial', external_post_id: POST_ID, comment_status: 'failed' });
    expect(first.error?.kind).toBe('permission_denied');
    expect(publicationActions(first.publication)).toMatchObject({ canPublish: false, canRetry: false, canRetryComment: true, canEdit: false });

    // Publishing again is refused (never a second post).
    await expect(
      publishFacebookContent({ generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: failing.client, store: memory.store })
    ).rejects.toMatchObject({ code: 'already_published' });
    await expect(retryFacebookPost(first.publication, PAGE_TOKEN, { graph: failing.client, store: memory.store })).rejects.toBeInstanceOf(PublishConflictError);

    const working = fakeGraph([ok.photo, ok.comment]);
    const retried = await retryFacebookComment(first.publication, PAGE_TOKEN, { graph: working.client, store: memory.store });
    expect(retried.publication).toMatchObject({ status: 'published', comment_status: 'published' });
    expect(working.calls.map((c) => new URL(c.url).pathname)).toEqual([`/v25.0/${POST_ID}/comments`]);
  });

  test('post refused → failed, no comment sent; Retry sends the post again once', async () => {
    const refused = fakeGraph([[/\/photos$/, 'POST', () => json({ error: { code: 324, message: 'bad image' } }, 400)], ok.comment]);
    const memory = memoryStore();
    const first = await publishFacebookContent({ generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: refused.client, store: memory.store });
    expect(first.publication).toMatchObject({ status: 'failed', external_post_id: null, error_code: '324' });
    expect(refused.calls.some((c) => c.url.endsWith('/comments'))).toBe(false);
    expect(publicationActions(first.publication)).toMatchObject({ canRetry: true, canEdit: true });

    const working = fakeGraph([ok.photo, ok.permalink, ok.comment]);
    const second = await publishFacebookContent({ generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: working.client, store: memory.store });
    expect(second.publication).toMatchObject({ status: 'published', attempt_count: 2 });
    expect(memory.rows.size).toBe(1);
  });

  test('21. timeout → unknown; Retry finds the post on the Page and adopts it without posting again', async () => {
    const hanging = fakeGraph([[/\/photos$/, 'POST', () => 'hang']]);
    const memory = memoryStore();
    const first = await publishFacebookContent({ generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: hanging.client, store: memory.store });
    expect(first.publication.status).toBe('unknown');
    expect(first.error).toMatchObject({ kind: 'timeout', ambiguous: true });
    expect(publicationActions(first.publication)).toMatchObject({ canRetry: true, canEdit: false });

    const message = first.publication.post_message;
    const lookup = fakeGraph([
      [new RegExp(`/${PAGE_ID}/published_posts$`), 'GET', () => json({ data: [{ id: POST_ID, message, created_time: '2026-10-15T08:00:00+0000' }] })],
      ok.permalink,
      ok.comment,
    ]);
    const retried = await retryFacebookPost(first.publication, PAGE_TOKEN, { graph: lookup.client, store: memory.store });
    expect(retried.publication).toMatchObject({ status: 'published', external_post_id: POST_ID, comment_status: 'published' });
    expect(lookup.calls.some((c) => c.url.endsWith('/photos'))).toBe(false);
  });

  test('21. timeout → unknown; Retry posts again only when the Page does not have it', async () => {
    const memory = memoryStore();
    const first = await publishFacebookContent(
      { generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN },
      { graph: fakeGraph([[/\/photos$/, 'POST', () => 'hang']]).client, store: memory.store }
    );
    const graph = fakeGraph([[new RegExp(`/${PAGE_ID}/published_posts$`), 'GET', () => json({ data: [] })], ok.photo, ok.permalink, ok.comment]);
    const retried = await retryFacebookPost(first.publication, PAGE_TOKEN, { graph: graph.client, store: memory.store });
    expect(retried.publication.status).toBe('published');
    expect(graph.calls.filter((c) => c.url.endsWith('/photos'))).toHaveLength(1);
  });

  test('23-24. expired token or deleted Page: failed with a clear message, no comment', async () => {
    for (const [body, kind] of [
      [{ error: { code: 190, error_subcode: 463 } }, 'token_expired'],
      [{ error: { code: 100, error_subcode: 33 } }, 'page_unavailable'],
    ] as const) {
      const graph = fakeGraph([[/\/photos$/, 'POST', () => json(body, 400)]]);
      const outcome = await publishFacebookContent(
        { generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN },
        { graph: graph.client, store: memoryStore().store }
      );
      expect(outcome.publication.status).toBe('failed');
      expect(outcome.error?.kind).toBe(kind);
      expect(outcome.publication.error_message).toMatch(/Facebook/);
      expect(graph.calls).toHaveLength(1);
    }
  });

  test('a concurrent second click is refused while the first one runs (no duplicate)', async () => {
    const memory = memoryStore([
      {
        id: 'pub-x',
        user_id: USER,
        project_id: PROJECT_ID,
        social_content_generation_id: SAVED_ID,
        connection_id: CONNECTION_ID,
        platform: 'facebook',
        external_account_id: PAGE_ID,
        external_account_name: 'Crochet Corner',
        status: 'publishing',
        post_message: 'x',
        post_image_url: null,
        external_post_id: null,
        external_post_url: null,
        published_at: null,
        comment_requested: false,
        comment_message: null,
        comment_status: 'not_requested',
        external_comment_id: null,
        comment_published_at: null,
        error_code: null,
        error_message: null,
        fbtrace_id: null,
        attempt_count: 1,
        comment_attempt_count: 0,
        locked_at: new Date().toISOString(),
        created_at: '',
        updated_at: '',
      },
    ]);
    const graph = fakeGraph([ok.photo]);
    await expect(
      publishFacebookContent({ generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: graph.client, store: memory.store })
    ).rejects.toMatchObject({ code: 'in_progress' });
    expect(graph.calls).toHaveLength(0);
  });

  test('16. the Page token never appears in any log line, even on errors', async () => {
    const logs = captureLogs();
    try {
      const graph = fakeGraph([ok.photo, ok.permalink, [/\/comments$/, 'POST', () => json({ error: { code: 190, message: `bad ${PAGE_TOKEN}` } }, 400)]]);
      await publishFacebookContent({ generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: graph.client, store: memoryStore().store });
      const hanging = fakeGraph([[/\/photos$/, 'POST', () => 'hang']]);
      await publishFacebookContent({ generation: facebookRow(), connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: hanging.client, store: memoryStore().store });
    } finally {
      logs.restore();
    }
    expect(logs.lines.length).toBeGreaterThan(0);
    for (const line of logs.lines) {
      expect(line).not.toContain(PAGE_TOKEN);
      expect(line).not.toContain(APP_SECRET);
    }
  });

  test('14. the publication store always filters on the caller', async () => {
    const db = fakeSupabase({ social_publications: [] });
    const store = supabasePublicationStore(db.client, USER);
    await store.findForGeneration(SAVED_ID, PAGE_ID);
    await store.update('pub-1', { status: 'failed' });
    await store.claimPost('pub-1', new Date(), {});
    await store.claimComment('pub-1', new Date());
    const userFilters = db.calls.filter((c) => c.op === 'eq' && c.args[0] === 'user_id');
    expect(userFilters).toHaveLength(4);
    expect(userFilters.every((c) => c.args[1] === USER)).toBe(true);
  });
});

// ===========================================================================
// Tokens, OAuth session, configuration

test.describe('Token storage and Facebook Login', () => {
  test('tokens are encrypted with SOCIAL_TOKEN_ENCRYPTION_KEY only — never the WordPress key, never a default', () => {
    const sealed = encryptSocialToken(PAGE_TOKEN);
    expect(sealed).not.toContain(PAGE_TOKEN);
    expect(decryptSocialToken(sealed)).toBe(PAGE_TOKEN);
    const saved = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    try {
      expect(() => encryptSocialToken(PAGE_TOKEN)).toThrow(/SOCIAL_TOKEN_ENCRYPTION_KEY is not set/);
    } finally {
      process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = saved;
    }
    // A WordPress ciphertext cannot be opened with the social key.
    expect(() => decryptSocialToken(encryptSecret(PAGE_TOKEN))).toThrow('Failed to decrypt stored secret');
  });

  test('OAuth state and pending selection: encrypted, bound to the user and project, expiring', () => {
    const state = newOAuthState();
    const cookie = sealOAuthState({ userId: USER, projectId: PROJECT_ID, state, business: false }, 1_000);
    expect(cookie).not.toContain(state);
    expect(openOAuthState(cookie, USER, 2_000)?.projectId).toBe(PROJECT_ID);
    expect(openOAuthState(cookie, OTHER, 2_000)).toBeNull();
    expect(openOAuthState(cookie, USER, 1_000 + 601_000)).toBeNull();
    expect(openOAuthState('tampered', USER, 2_000)).toBeNull();
    expect(statesMatch(state, state)).toBe(true);
    expect(statesMatch(state, `${state}x`)).toBe(false);
    expect(statesMatch(state, null)).toBe(false);

    const pending = sealPendingConnection({ userId: USER, projectId: PROJECT_ID, userToken: 'LONG-USER-TOKEN', grantedScopes: ['pages_show_list'] }, 1_000);
    expect(pending).not.toContain('LONG-USER-TOKEN');
    expect(openPendingConnection(pending, USER, PROJECT_ID, 2_000)?.userToken).toBe('LONG-USER-TOKEN');
    expect(openPendingConnection(pending, USER, '00000000-0000-4000-8000-000000000000', 2_000)).toBeNull();
    expect(openPendingConnection(pending, OTHER, PROJECT_ID, 2_000)).toBeNull();
  });

  test('strictly minimal Page permissions; business_management only on request; no profile or group scope', () => {
    expect([...META_PAGE_SCOPES]).toEqual(['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'pages_manage_engagement', 'pages_read_user_content']);
    expect(META_PAGE_SCOPES).not.toContain(META_BUSINESS_SCOPE as never);
    for (const scope of META_PAGE_SCOPES) expect(scope).not.toMatch(/publish_to_groups|user_posts|publish_actions|groups_access/);
    const config = { appId: '123456789', appSecret: APP_SECRET, graphVersion: 'v25.0' };
    const url = new URL(buildOAuthDialogUrl(config, { redirectUri: 'https://app.example.test/cb', state: 'abc', scopes: META_PAGE_SCOPES }));
    expect(url.searchParams.get('scope')).toBe(META_PAGE_SCOPES.join(','));
    expect(url.toString()).not.toContain(APP_SECRET);
    expect(getMetaConfig({ META_APP_ID: '123456789' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(getMetaConfig({ META_APP_ID: '123456789', META_APP_SECRET: 's' } as unknown as NodeJS.ProcessEnv)?.graphVersion).toBe('v25.0');
    expect(oauthRedirectUri('http://localhost:3000', {} as unknown as NodeJS.ProcessEnv)).toBe('http://localhost:3000/api/social/connections/facebook/oauth/callback');
  });
});

// ===========================================================================
// Schema, routes and UI wiring (source checks)

test.describe('Migration 046, routes and UI', () => {
  test('migration: token unreadable by the session role, one Page per project, one publication per content and Page', () => {
    const sql = read('supabase/migrations/046_add_social_connections_and_publications.sql');
    expect(sql).toContain('REVOKE ALL ON public.social_connections FROM anon, authenticated;');
    const grant = sql.slice(sql.indexOf('GRANT SELECT ('), sql.indexOf('ON public.social_connections TO authenticated;'));
    expect(grant).not.toContain('encrypted_access_token');
    expect(sql).toContain('UNIQUE (project_id, platform)');
    expect(sql).toContain('UNIQUE (social_content_generation_id, external_account_id)');
    expect(sql).toMatch(/content_stream_id IS NULL\s+OR EXISTS \(SELECT 1 FROM content_streams cs WHERE cs\.id = content_stream_id AND cs\.user_id = auth\.uid\(\)\)/);
    expect(sql).toContain("CHECK (link_placement IS NULL OR link_placement = 'none' OR cta_url IS NOT NULL)");
  });

  test('routes: auth, ownership, confirmation, separate publish limit, no token in any response', () => {
    const publish = read('app/api/social/generations/[id]/publish/route.ts');
    expect(publish).toContain('getSocialContentGeneration(supabase, user.id, id)');
    expect(publish).toContain('connection.project_id !== generation.project_id');
    expect(publish).toContain("'social/facebook-publish', 20, 3600)");
    expect(publish).not.toContain('enforceTrialLimit');
    const generate = read('app/api/social/facebook-post/route.ts');
    expect(generate).toContain("'social/facebook-post', 30, 3600, {\n    enforceTrialLimit: true,");
    for (const path of [
      'app/api/social/generations/[id]/publish/route.ts',
      'app/api/social/connections/route.ts',
      'app/api/social/connections/facebook/pages/route.ts',
      'app/api/social/connections/facebook/select/route.ts',
      'app/api/social/connections/[id]/verify/route.ts',
      'lib/social/facebook-retry-route.ts',
    ]) {
      const code = read(path);
      // Every JSON response body: never a token or the encrypted column.
      for (const response of code.split('NextResponse.json').slice(1).map((part) => part.slice(0, part.indexOf(');')))) {
        expect(response, path).not.toMatch(/token/i);
      }
      expect(code, path).not.toContain('encrypted_access_token');
    }
    const select = read('app/api/social/connections/facebook/select/route.ts');
    expect(select).toContain("page.tasks.includes('CREATE_CONTENT')");
    expect(select).toContain('encryptSocialToken(page.accessToken)');
    expect(read('lib/queries/social-connections.ts')).toContain("'id, user_id, project_id, platform, account_type, external_account_id, external_account_name, token_expires_at");
  });

  test('UI: Facebook available in the Studio and the sidebar; Instagram, Reels, TikTok "Coming soon"', () => {
    expect(SOCIAL_PLATFORMS.find((p) => p.id === 'facebook')?.status).toBe('available');
    for (const id of ['instagram', 'reels', 'tiktok']) expect(SOCIAL_PLATFORMS.find((p) => p.id === id)?.status).toBe('coming_soon');
    expect(read('components/layout/sidebar.tsx')).toContain("{ href: '/facebook', label: 'Facebook', icon: ThumbsUp },");
    expect(read('components/wordpress/social-content-studio.tsx')).toContain('<FacebookPostPanel source={{ wordpressArticleId: generationId }} />');
    const workspace = read('components/social/facebook-post-workspace.tsx');
    for (const label of ['Publish to Facebook', 'Publish now', 'Retry comment', 'First comment', 'does not guarantee']) {
      expect(workspace + read('lib/social/social-content.ts')).toContain(label);
    }
    // Client components never import server modules nor talk to Meta.
    for (const path of ['components/social/facebook-post-workspace.tsx', 'components/social/facebook-connections.tsx', 'components/social/facebook-post-panel.tsx', 'components/social/facebook-requests.ts']) {
      const code = read(path);
      expect(code, path).not.toMatch(/from '@\/lib\/(queries|supabase|social\/meta|social\/facebook-server)/);
      expect(code, path).not.toContain('graph.facebook.com');
    }
  });
});
