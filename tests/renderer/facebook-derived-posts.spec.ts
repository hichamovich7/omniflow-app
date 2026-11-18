import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MetaGraphClient } from '@/lib/social/meta/graph-client';
import {
  buildFacebookPostPrompt,
  checkDistinctFromPrevious,
  generateFacebookPost,
  loadFacebookPostSource,
  postSimilarity,
  type FacebookGenerateTextFn,
  type FacebookPostSource,
} from '@/lib/social/facebook-post';
import {
  createFacebookPostFromImage,
  DerivedPostError,
  DRAFT_REQUEST_STALE_MS,
  DRAFT_SAVE_ATTEMPTS,
  REQUEST_EXPIRED_MESSAGE,
  REQUEST_IN_PROGRESS_MESSAGE,
  SAVE_FAILED_AFTER_WRITE_MESSAGE,
  type DerivedPostDeps,
  type ParentDraft,
} from '@/lib/social/facebook-derived-posts';
import { selectFacebookImage, wordpressImageOf, type FacebookImageVariant, type VariantStore } from '@/lib/social/facebook-image-variants';
import { facebookArticleKey, groupByArticle } from '@/lib/social/facebook-article-posts';
import { publishFacebookContent, PublishConflictError } from '@/lib/social/facebook-publish';
import { scheduleFacebookContent } from '@/lib/social/facebook-schedule';
import { facebookDerivedPostSchema } from '@/lib/validations/facebook';
import { encryptSecret } from '@/lib/wordpress/crypto';
import type { NewPublication, PublicationStore, ScheduleStore } from '@/lib/queries/social-publications';
import type { SocialPublication } from '@/lib/social/facebook-publication';
import type { SocialContentGeneration, SocialContentGenerationInsert } from '@/lib/social/social-content';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * TASK-101 extension / TASK-103 — "Create new post with this image".
 * Offline: the article is read through a fake Supabase + fake WordPress
 * fetch, the AI is a fake, drafts / variants / publications are in memory,
 * Meta is a fake Graph client. No image model at all in these deps.
 */

process.env.WORDPRESS_ENCRYPTION_KEY = 'a'.repeat(64);

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = 'user-1';
const OTHER = 'user-2';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '11111111-1111-4111-8111-111111111111';
const WP_GEN_ID = '33333333-3333-4333-8333-333333333333';
const PARENT = '2b9a4785-61d4-48d9-9660-066181779228'; // same shape as the real case
const OTHER_DRAFT = '44444444-4444-4444-8444-444444444444';
const HERO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LIFESTYLE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_DRAFT_VARIANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SITE_URL = 'https://crochet.example.test';
const PERMALINK = `${SITE_URL}/colorful-crochet-scarf-patterns/`;
const WP_IMAGE = `${SITE_URL}/wp-content/uploads/featured.jpg`;
const PAGE_ID = '1122334455';
const PAGE_TOKEN = 'EAAG-page-token-SECRET-123456789';
const NOW = new Date('2026-11-18T10:00:00Z');

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

const PARENT_POST =
  'Soft waves, bold color blocks and a calm ombre gradient: these three crochet scarves are all about color. The waves scarf repeats taller and shorter stitches, the color-block scarf joins large blocks row by row, and the ombre scarf moves slowly from light to dark shades. Pick the one that matches your jackets and your favorite colors this season.';
const HERO_POST =
  'Finished and ready to wear: the waves scarf ripples across every row thanks to taller and shorter stitches. Bright colors make each wave stand out, and once the first rows are done the repeat is easy to remember. Looking for one simple project for winter? Start with the waves and enjoy the finished piece.';
const HERO_POST_2 =
  'Want a project you can memorize fast? The waves scarf is built from one simple repeat, taller stitches beside shorter ones, and after the first rows your hands know the rhythm. Bright colors turn those soft waves into the star of your winter look, and the finished piece is easy to wear every day.';
const LIFESTYLE_POST =
  'Heading out in a jacket on a cold day? The ombre scarf goes with almost everything, because its shades drift slowly from light to dark. A new yarn every few rows builds that calm gradient with no tricky technique, and the color-block version hides small mistakes, so it is a relaxed project for any season.';

// ---------------------------------------------------------------------------
// Fake Supabase for the article read (same loaders as "Generate Facebook post")

type Row = Record<string, unknown>;
function fakeSupabase(tables: Record<string, Row[]>) {
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => ((rows = rows.filter((r) => r[column] === value)), builder),
      neq: (column: string, value: unknown) => ((rows = rows.filter((r) => r[column] !== value)), builder),
      in: (column: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[column]))), builder),
      is: () => builder,
      not: () => builder,
      or: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null, count: rows.length }),
    };
    return builder;
  }
  return { from } as unknown as SupabaseClient;
}

function articleWorld() {
  return fakeSupabase({
    wordpress_generations: [{ id: WP_GEN_ID, user_id: USER, project_id: PROJECT_ID, status: 'completed', language: 'en', keyword: 'scarf' }],
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
        category_id: null,
      },
    ],
    wordpress_article_images: [],
    wordpress_sites: [
      { id: SITE_ID, project_id: PROJECT_ID, user_id: USER, site_url: SITE_URL, wp_username: 'editor', encrypted_application_password: encryptSecret('pw pw pw'), created_at: '' },
    ],
    wordpress_categories: [],
    projects: [{ id: PROJECT_ID, user_id: USER, default_language: 'en', niche: 'Crochet', description: 'Friendly crochet blog for makers.' }],
    content_streams: [],
  });
}

const wordpressFetch = (async () =>
  new Response(
    JSON.stringify({
      id: 1527,
      date: '2026-10-02T09:00:00',
      status: 'publish',
      link: PERMALINK,
      title: { rendered: 'Colorful Crochet Scarf Patterns' },
      excerpt: { rendered: '' },
      content: { rendered: POST_HTML, protected: false },
      categories: [],
      featured_media: 0,
      _embedded: { 'wp:featuredmedia': [{ source_url: WP_IMAGE, alt_text: 'Three colorful crochet scarves' }] },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )) as typeof fetch;

const answer = (post: string, cta: string, firstComment: string) => JSON.stringify({ post, cta, firstComment });

/** Fake text model: writes a post that matches the visual angle it is asked for. */
function fakeWriter() {
  const prompts: ChatMessage[][] = [];
  const fn: FacebookGenerateTextFn = async ({ messages }) => {
    prompts.push(messages);
    const system = messages[0].content;
    if (/lifestyle photo/.test(system)) return answer(LIFESTYLE_POST, 'See how each scarf fits your days in the article.', 'Everything about the ombre scarf is here:');
    // A second hero post of the same article: the earlier hero text is in <previous_posts>, so write another one.
    if (messages[1].content.includes('Finished and ready to wear')) return answer(HERO_POST_2, 'Learn the simple repeat in the full article.', 'The waves scarf pattern:');
    return answer(HERO_POST, 'Discover the finished scarves in the full article.', 'The full pattern article:');
  };
  return { fn, prompts };
}

// ---------------------------------------------------------------------------
// In-memory drafts, variants and publications

function parentRow(overrides: Partial<SocialContentGeneration> = {}): SocialContentGeneration {
  return {
    id: PARENT,
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
    content_markdown: PARENT_POST,
    content_html: '',
    word_count: 60,
    image_url: WP_IMAGE,
    image_alt: 'Three colorful crochet scarves',
    cta_url: PERMALINK,
    call_to_action: 'Discover all three scarves in the full article.',
    first_comment_text: 'Here is the full article with every scarf:',
    link_placement: 'first_comment',
    content_stream_id: null,
    source_image_url: WP_IMAGE,
    source_image_alt: 'Three colorful crochet scarves',
    selected_image_variant_id: null,
    derived_from_generation_id: null,
    origin_image_variant_id: null,
    visual_angle: null,
    creation_request_id: null,
    created_at: '2026-11-15T09:00:00Z',
    updated_at: '2026-11-15T09:00:00Z',
    ...overrides,
  };
}

function variantRow(id: string, angle: string, overrides: Partial<FacebookImageVariant> = {}): FacebookImageVariant {
  return {
    id,
    user_id: USER,
    social_content_generation_id: PARENT,
    batch_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    position: angle === 'hero' ? 1 : 2,
    angle,
    prompt: `prompt ${angle}`,
    image_url: `https://media.example.test/images/facebook/${USER}/${PARENT}/${id}.jpg`,
    image_alt: 'Colorful Crochet Scarf Patterns',
    storage_key: `images/facebook/${USER}/${PARENT}/${id}.jpg`,
    media_profile: 'facebook-feed-portrait',
    width: 1024,
    height: 1280,
    image_model: 'test/image-model',
    created_at: '2026-11-15T10:00:00Z',
    ...overrides,
  };
}

function world() {
  const drafts = new Map<string, SocialContentGeneration>([
    [PARENT, parentRow()],
    [OTHER_DRAFT, parentRow({ id: OTHER_DRAFT, source_wordpress_generation_id: '55555555-5555-4555-8555-555555555555' })],
  ]);
  const variants = new Map<string, FacebookImageVariant>([
    [HERO, variantRow(HERO, 'hero')],
    [LIFESTYLE, variantRow(LIFESTYLE, 'lifestyle')],
    [FOREIGN, variantRow(FOREIGN, 'hero', { user_id: OTHER })],
    [OTHER_DRAFT_VARIANT, variantRow(OTHER_DRAFT_VARIANT, 'detail', { social_content_generation_id: OTHER_DRAFT })],
  ]);
  // The original post is already published with the WordPress image.
  const publications = new Map<string, SocialPublication>([
    [
      'pub-parent',
      {
        id: 'pub-parent',
        user_id: USER,
        project_id: PROJECT_ID,
        social_content_generation_id: PARENT,
        platform: 'facebook',
        external_account_id: PAGE_ID,
        external_account_name: 'Crochet Sweater Pattern',
        connection_id: '99999999-9999-4999-8999-999999999999',
        status: 'published',
        post_message: PARENT_POST,
        post_image_url: WP_IMAGE,
        comment_requested: true,
        comment_message: `Here is the full article with every scarf:\n${PERMALINK}`,
        comment_status: 'published',
        external_post_id: `${PAGE_ID}_111`,
        external_post_url: `https://www.facebook.com/${PAGE_ID}_111`,
        published_at: '2026-11-15T09:30:00Z',
        external_comment_id: `${PAGE_ID}_111_c1`,
        comment_published_at: '2026-11-15T09:30:05Z',
        error_code: null,
        error_message: null,
        fbtrace_id: null,
        attempt_count: 1,
        comment_attempt_count: 1,
        locked_at: null,
        created_at: '2026-11-15T09:29:00Z',
        updated_at: '2026-11-15T09:30:05Z',
      } as SocialPublication,
    ],
  ]);
  let counter = 0;
  const calls = { quota: 0, loadSource: 0, write: 0, insert: 0, image: 0 };
  // social_draft_creation_requests (052): PRIMARY KEY (user_id, request_id); the check-and-set below
  // runs without any await, like the single INSERT / conditional UPDATE in Postgres.
  const requests = new Map<string, { parent: string; status: 'pending' | 'completed' | 'failed'; updatedAt: number; generationId: string | null }>();
  let clock = NOW.getTime();

  function deps(
    userId = USER,
    options: { quota?: boolean; writer?: ReturnType<typeof fakeWriter>; writeFails?: boolean; gate?: Promise<void>; saveFailures?: number } = {}
  ): DerivedPostDeps {
    let saveFailures = options.saveFailures ?? 0;
    const writer = options.writer ?? fakeWriter();
    return {
      async findByRequestId(requestId) {
        return [...drafts.values()].find((d) => d.user_id === userId && d.creation_request_id === requestId) ?? null;
      },
      async reserveRequest(requestId, parentId) {
        const key = `${userId}:${requestId}`;
        const row = requests.get(key);
        if (!row) {
          requests.set(key, { parent: parentId, status: 'pending', updatedAt: clock, generationId: null });
          return { status: 'reserved' };
        }
        if (row.parent !== parentId) return { status: 'other_parent' };
        if (row.status === 'completed') return { status: 'completed' };
        if (row.status === 'pending') return clock - row.updatedAt > DRAFT_REQUEST_STALE_MS ? { status: 'expired' } : { status: 'in_progress' };
        Object.assign(row, { status: 'pending', updatedAt: clock }); // failed → taken over
        return { status: 'reserved' };
      },
      async completeRequest(requestId, generationId) {
        Object.assign(requests.get(`${userId}:${requestId}`)!, { status: 'completed', generationId });
      },
      async failRequest(requestId) {
        const row = requests.get(`${userId}:${requestId}`);
        if (row?.status === 'pending') row.status = 'failed';
      },
      async getVariant(id) {
        const row = variants.get(id);
        return row && row.user_id === userId ? { ...row } : null; // RLS: own variants only
      },
      async checkQuota() {
        calls.quota += 1;
        return options.quota === false ? { allowed: false, remaining: 0, reason: 'trial_limit' as const } : { allowed: true, remaining: 9 };
      },
      async loadSource(request) {
        calls.loadSource += 1;
        return loadFacebookPostSource(articleWorld(), USER, request, { fetchImpl: wordpressFetch });
      },
      async articlePostTexts() {
        const parent = drafts.get(PARENT)!;
        return [parent, ...[...drafts.values()].filter((d) => d.id !== PARENT && facebookArticleKey(d) === facebookArticleKey(parent))].map((d) => d.content_markdown);
      },
      async writePost(source: FacebookPostSource, postOptions) {
        calls.write += 1;
        if (options.gate) await options.gate; // the first request is still writing
        if (options.writeFails) throw new Error('AI provider error');
        return generateFacebookPost(source, writer.fn, postOptions);
      },
      async insertDraft(row: SocialContentGenerationInsert) {
        calls.insert += 1;
        if (saveFailures > 0) {
          saveFailures -= 1;
          return { row: null, reason: 'error' as const }; // database error after the AI call
        }
        if ([...drafts.values()].some((d) => d.user_id === row.user_id && row.creation_request_id && d.creation_request_id === row.creation_request_id)) {
          return { row: null, reason: 'conflict' as const }; // UNIQUE (user_id, creation_request_id)
        }
        const full = { ...row, id: `99999999-0000-4000-8000-00000000000${++counter}`, created_at: NOW.toISOString(), updated_at: NOW.toISOString() } as SocialContentGeneration;
        drafts.set(full.id, full);
        return { row: { ...full } };
      },
    };
  }

  function variantStore(userId = USER): VariantStore {
    return {
      async insertVariant() {
        return null;
      },
      async getVariant(id) {
        const row = variants.get(id);
        return row && row.user_id === userId ? { ...row } : null;
      },
      async updateDraftImage(generationId, patch) {
        const draft = drafts.get(generationId);
        if (!draft || draft.user_id !== userId) return null;
        Object.assign(draft, patch);
        return { ...draft };
      },
    };
  }

  function publicationStore(): PublicationStore & ScheduleStore {
    return {
      async findForGeneration(generationId, pageId) {
        const row = [...publications.values()].find((r) => r.social_content_generation_id === generationId && r.external_account_id === pageId);
        return row ? { ...row } : null;
      },
      async insert(row: NewPublication) {
        // UNIQUE (social_content_generation_id, external_account_id) — migration 046.
        if ([...publications.values()].some((r) => r.social_content_generation_id === row.social_content_generation_id && r.external_account_id === row.external_account_id)) {
          return { row: null, conflict: true };
        }
        const full = { ...row, id: `pub-${publications.size + 1}`, created_at: NOW.toISOString(), updated_at: NOW.toISOString() } as SocialPublication;
        publications.set(full.id, full);
        return { row: { ...full }, conflict: false };
      },
      async claimPost() {
        return null;
      },
      async claimComment() {
        return null;
      },
      async update(id, patch) {
        const row = publications.get(id);
        if (!row) return null;
        Object.assign(row, patch);
        return { ...row };
      },
      async transition() {
        return null;
      },
      async claimScheduled() {
        return null;
      },
    };
  }

  const advance = (ms: number) => {
    clock += ms;
  };
  return { drafts, variants, publications, calls, requests, advance, deps, variantStore, publicationStore };
}

const parentOf = (w: ReturnType<typeof world>) => w.drafts.get(PARENT)! as ParentDraft;
const create = (w: ReturnType<typeof world>, variantId: string | null, requestId: string, depsOverride?: DerivedPostDeps, parent?: ParentDraft | null) =>
  createFacebookPostFromImage({ parent: parent === undefined ? parentOf(w) : parent, userId: USER, variantId, requestId }, depsOverride ?? w.deps());

const REQ_A = '0aaaaaaa-0000-4000-8000-000000000001';
const REQ_B = '0bbbbbbb-0000-4000-8000-000000000002';

function fakeGraph() {
  const calls: Array<{ method: string; path: string; body: string }> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    calls.push({ method: init?.method ?? 'GET', path, body: typeof init?.body === 'string' ? init.body : '' });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (path.endsWith('/photos')) return ok({ id: '222', post_id: `${PAGE_ID}_222` });
    if (path.endsWith('/comments')) return ok({ id: `${PAGE_ID}_222_c1` });
    if (path.endsWith(`/${PAGE_ID}_222`)) return ok({ permalink_url: `https://www.facebook.com/${PAGE_ID}_222` });
    return new Response(JSON.stringify({ error: { code: 803 } }), { status: 400 });
  };
  const client = new MetaGraphClient({ appId: '123456789', appSecret: 'app-secret', graphVersion: 'v25.0' }, { fetchImpl, timeoutMs: 200 });
  return { client, calls, photoUrl: () => new URLSearchParams(calls.find((c) => c.path.endsWith('/photos'))?.body ?? '').get('url') };
}

const CONNECTION = { id: '99999999-9999-4999-8999-999999999999', external_account_id: PAGE_ID, external_account_name: 'Crochet Sweater Pattern' };

// ===========================================================================

test.describe('Two existing images → two independent drafts', () => {
  test('distinct texts and angles, written from the article, zero image call', async () => {
    const w = world();
    const parentBefore = JSON.stringify(w.drafts.get(PARENT));
    const writer = fakeWriter();
    const hero = await create(w, HERO, REQ_A, w.deps(USER, { writer }));
    const lifestyle = await create(w, LIFESTYLE, REQ_B, w.deps(USER, { writer }));

    expect(hero.reused).toBe(false);
    expect(lifestyle.reused).toBe(false);
    expect(hero.draft.id).not.toBe(lifestyle.draft.id);
    for (const [result, variantId, angle] of [
      [hero, HERO, 'hero'],
      [lifestyle, LIFESTYLE, 'lifestyle'],
    ] as const) {
      expect(result.draft).toMatchObject({
        user_id: USER,
        project_id: PROJECT_ID,
        platform: 'facebook',
        source_type: 'omniflow_article',
        source_wordpress_generation_id: WP_GEN_ID,
        image_url: w.variants.get(variantId)!.image_url,
        selected_image_variant_id: variantId,
        origin_image_variant_id: variantId,
        source_image_url: WP_IMAGE,
        derived_from_generation_id: PARENT,
        visual_angle: angle,
        cta_url: PERMALINK,
      });
      expect(result.draft.content_markdown).not.toBe(PARENT_POST);
      expect(facebookArticleKey(result.draft)).toBe(facebookArticleKey(w.drafts.get(PARENT)!));
    }
    expect(hero.draft.content_markdown).toBe(HERO_POST);
    expect(lifestyle.draft.content_markdown).toBe(LIFESTYLE_POST);
    expect(hero.draft.call_to_action).not.toBe(lifestyle.draft.call_to_action);
    expect(hero.draft.first_comment_text).not.toBe(lifestyle.draft.first_comment_text);
    expect(postSimilarity(hero.draft.content_markdown, lifestyle.draft.content_markdown)).toBeLessThan(0.6);

    // Written from the article (re-read), for the angle, knowing the earlier posts.
    expect(w.calls.loadSource).toBe(2);
    expect(writer.prompts).toHaveLength(2);
    expect(writer.prompts[0][0].content).toMatch(/Visual angle: The post goes with a hero shot/);
    expect(writer.prompts[1][0].content).toMatch(/Visual angle: The post goes with a lifestyle photo/);
    expect(writer.prompts[0][1].content).toContain('<article>');
    expect(writer.prompts[0][1].content).toContain('<previous_posts>');
    expect(writer.prompts[0][1].content).toContain('Soft waves, bold color blocks');
    expect(writer.prompts[1][1].content).toContain('Finished and ready to wear'); // the first new post is known too
    // Zero image call: the deps have no image model, the files are reused by URL.
    expect(w.calls.image).toBe(0);
    expect(read('lib/social/facebook-derived-posts.ts')).not.toMatch(/generateImage|storeImage|optimizeImage/);
    expect(read('lib/social/facebook-derived-posts-route.ts')).not.toMatch(/generateImage|reserveTrialUnits|storeFacebookVariantImage/);

    // The published original and its variants are untouched.
    expect(JSON.stringify(w.drafts.get(PARENT))).toBe(parentBefore);
    expect(w.variants.get(HERO)?.social_content_generation_id).toBe(PARENT);
    expect(w.variants.get(LIFESTYLE)?.social_content_generation_id).toBe(PARENT);
    expect(w.variants.size).toBe(4);
  });

  test('the WordPress image can start a new post too; a draft without image cannot reuse one', async () => {
    const w = world();
    const result = await create(w, null, REQ_A);
    expect(result.draft).toMatchObject({ image_url: WP_IMAGE, selected_image_variant_id: null, origin_image_variant_id: null, visual_angle: 'wordpress' });
    const textOnly = parentRow({ image_url: null, source_image_url: null });
    await expect(create(w, null, REQ_B, undefined, textOnly as ParentDraft)).rejects.toMatchObject({ code: 'no_image' });
  });

  test('a new post can reuse the image it was created with, and go back to the WordPress image', async () => {
    const w = world();
    const { draft } = await create(w, HERO, REQ_A);
    expect(wordpressImageOf(draft)).toEqual({ url: WP_IMAGE, alt: 'Three colorful crochet scarves' });
    await selectFacebookImage({ draft, publication: null, variantId: null }, { store: w.variantStore() });
    expect(w.drafts.get(draft.id)).toMatchObject({ image_url: WP_IMAGE, selected_image_variant_id: null, origin_image_variant_id: HERO });
    // The origin variant (it stays on the original draft) is still usable by the new draft.
    await selectFacebookImage({ draft: w.drafts.get(draft.id)!, publication: null, variantId: HERO }, { store: w.variantStore() });
    expect(w.drafts.get(draft.id)).toMatchObject({ image_url: w.variants.get(HERO)!.image_url, selected_image_variant_id: HERO });
    // …and can start yet another post from it.
    const third = await create(w, HERO, REQ_B, undefined, w.drafts.get(draft.id) as ParentDraft);
    expect(third.draft).toMatchObject({ derived_from_generation_id: draft.id, origin_image_variant_id: HERO });
  });
});

test.describe('From a published post', () => {
  test('the published original, its publication and its variants never change', async () => {
    const w = world();
    const publicationBefore = JSON.stringify(w.publications.get('pub-parent'));
    const parentBefore = JSON.stringify(w.drafts.get(PARENT));
    await create(w, HERO, REQ_A);
    await create(w, LIFESTYLE, REQ_B);
    expect(JSON.stringify(w.publications.get('pub-parent'))).toBe(publicationBefore);
    expect(JSON.stringify(w.drafts.get(PARENT))).toBe(parentBefore);
    expect(w.publications.size).toBe(1); // creating a draft never publishes
  });
});

test.describe('History and independent publication', () => {
  test('all posts of the article are kept and grouped; each is published or scheduled on its own', async () => {
    const w = world();
    const hero = await create(w, HERO, REQ_A);
    const lifestyle = await create(w, LIFESTYLE, REQ_B);

    const groups = groupByArticle([...w.drafts.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    const article = groups.find((group) => group.key === `article:${WP_GEN_ID}`)!;
    expect(article.items.map((item) => item.id).sort()).toEqual([PARENT, hero.draft.id, lifestyle.draft.id].sort());
    expect(article.title).toBe('Colorful Crochet Scarf Patterns');
    expect(groups).toHaveLength(2); // the other article stays apart

    // The hero draft is published on the same Page as the original: a new post, with its own image.
    const graph = fakeGraph();
    const store = w.publicationStore();
    const published = await publishFacebookContent({ generation: hero.draft, connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: graph.client, store, now: () => NOW });
    expect(published.publication).toMatchObject({ status: 'published', social_content_generation_id: hero.draft.id, post_image_url: w.variants.get(HERO)!.image_url });
    expect(graph.photoUrl()).toBe(w.variants.get(HERO)!.image_url);
    // Publishing the same draft again never creates a duplicate.
    await expect(
      publishFacebookContent({ generation: hero.draft, connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: graph.client, store, now: () => NOW })
    ).rejects.toBeInstanceOf(PublishConflictError);
    expect(graph.calls.filter((c) => c.path.endsWith('/photos'))).toHaveLength(1);

    // The lifestyle draft is scheduled independently (TASK-100 flow unchanged).
    const scheduled = await scheduleFacebookContent(
      { generation: lifestyle.draft, connection: CONNECTION, scheduledAt: new Date('2026-11-18T12:00:00Z'), timeZone: 'Europe/Paris' },
      { store, now: () => NOW }
    );
    expect(scheduled).toMatchObject({ status: 'scheduled', social_content_generation_id: lifestyle.draft.id, post_image_url: w.variants.get(LIFESTYLE)!.image_url });
    expect(w.publications.get('pub-parent')?.status).toBe('published');
    expect(w.publications.size).toBe(3);
  });
});

test.describe('Repeated requests', () => {
  test('a double click (same request id) returns the same draft: one AI call, one quota unit, one row', async () => {
    const w = world();
    const first = await create(w, HERO, REQ_A);
    const again = await create(w, HERO, REQ_A);
    expect(again).toMatchObject({ reused: true, draft: { id: first.draft.id } });
    expect(w.calls).toMatchObject({ quota: 1, loadSource: 1, write: 1, insert: 1 });
    expect([...w.drafts.values()].filter((d) => d.derived_from_generation_id === PARENT)).toHaveLength(1);
  });

  test('two identical requests at the same time: one billed text generation, one draft; the second is told it is in progress', async () => {
    const w = world();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = create(w, HERO, REQ_A, w.deps(USER, { gate }));
    // The first request reserved the id and is writing; the identical one arrives now.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await create(w, HERO, REQ_A).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(DerivedPostError);
    expect(second).toMatchObject({ code: 'request_in_progress', status: 409, message: REQUEST_IN_PROGRESS_MESSAGE });
    expect(w.calls).toMatchObject({ quota: 1, write: 1, insert: 0 }); // the second never reached the quota or the AI
    release();
    const done = await first;
    expect(done.reused).toBe(false);
    expect(w.requests.get(`${USER}:${REQ_A}`)).toMatchObject({ status: 'completed', generationId: done.draft.id });
    // Once the first one is finished, the same request returns its draft.
    const third = await create(w, HERO, REQ_A);
    expect(third).toMatchObject({ reused: true, draft: { id: done.draft.id } });
    expect(w.calls).toMatchObject({ quota: 1, loadSource: 1, write: 1, insert: 1 });
    expect([...w.drafts.values()].filter((d) => d.creation_request_id === REQ_A)).toHaveLength(1);
  });

  test('many identical requests at once: exactly one goes past the reservation', async () => {
    const w = world();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => create(w, HERO, REQ_A)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && (r.reason as DerivedPostError).code === 'request_in_progress')).toHaveLength(4);
    expect(w.calls).toMatchObject({ quota: 1, write: 1, insert: 1 });
  });

  test('quota refused releases the id (nothing consumed): the same request can be retried', async () => {
    const w = world();
    await expect(create(w, LIFESTYLE, REQ_B, w.deps(USER, { quota: false }))).rejects.toMatchObject({ code: 'quota' });
    expect(w.requests.get(`${USER}:${REQ_B}`)?.status).toBe('failed');
    expect(w.calls.write).toBe(0);
    const retried = await create(w, LIFESTYLE, REQ_B);
    expect(retried.reused).toBe(false);
    expect(w.calls).toMatchObject({ quota: 2, write: 1, insert: 1 });
  });

  test('after 120 s a still-running request is NEVER taken over: no second AI call, explicit "expired" answer', async () => {
    const w = world();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = create(w, HERO, REQ_A, w.deps(USER, { gate })); // the AI call is slow
    await new Promise((resolve) => setTimeout(resolve, 10));
    w.advance(DRAFT_REQUEST_STALE_MS + 60_000); // way past the stale delay
    const late = await create(w, HERO, REQ_A).catch((e: unknown) => e);
    expect(late).toMatchObject({ code: 'request_expired', status: 409, message: REQUEST_EXPIRED_MESSAGE });
    expect(w.calls).toMatchObject({ quota: 1, write: 1 }); // no second quota unit, no second AI call
    release();
    const done = await first; // the slow first call still saves its draft
    expect(done.reused).toBe(false);
    expect(await create(w, HERO, REQ_A)).toMatchObject({ reused: true, draft: { id: done.draft.id } });
    expect(w.calls).toMatchObject({ quota: 1, write: 1, insert: 1 });
  });

  test('an AI error consumes the id: retrying the same request never calls the AI again', async () => {
    const w = world();
    await expect(create(w, HERO, REQ_A, w.deps(USER, { writeFails: true }))).rejects.toThrow('AI provider error');
    expect(w.requests.get(`${USER}:${REQ_A}`)?.status).toBe('pending'); // consumed, not released
    await expect(create(w, HERO, REQ_A)).rejects.toMatchObject({ code: 'request_in_progress' });
    w.advance(DRAFT_REQUEST_STALE_MS + 1);
    await expect(create(w, HERO, REQ_A)).rejects.toMatchObject({ code: 'request_expired' });
    expect(w.calls).toMatchObject({ quota: 1, write: 1, insert: 0 });
  });

  test('a save error after a successful AI call: retried in place without AI; if it keeps failing, never billed again', async () => {
    const w = world();
    // Two transient database errors, then the save works: one AI call, one draft.
    const saved = await create(w, HERO, REQ_A, w.deps(USER, { saveFailures: 2 }));
    expect(saved.reused).toBe(false);
    expect(w.calls).toMatchObject({ quota: 1, write: 1, insert: 3 });

    // The save keeps failing: explicit error, and the same request can never call the AI again.
    const error = await create(w, LIFESTYLE, REQ_B, w.deps(USER, { saveFailures: DRAFT_SAVE_ATTEMPTS })).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'save_failed', message: SAVE_FAILED_AFTER_WRITE_MESSAGE });
    expect(w.requests.get(`${USER}:${REQ_B}`)?.status).toBe('pending');
    expect(w.calls).toMatchObject({ quota: 2, write: 2 });
    await expect(create(w, LIFESTYLE, REQ_B)).rejects.toMatchObject({ code: 'request_in_progress' });
    w.advance(DRAFT_REQUEST_STALE_MS + 1);
    await expect(create(w, LIFESTYLE, REQ_B)).rejects.toMatchObject({ code: 'request_expired' });
    expect(w.calls).toMatchObject({ quota: 2, write: 2 }); // no silent second billing
  });

  test('a request id already used for another post is refused; a new id creates a new post on purpose', async () => {
    const w = world();
    await create(w, HERO, REQ_A);
    const other = w.drafts.get(OTHER_DRAFT)! as ParentDraft;
    await expect(create(w, null, REQ_A, undefined, other)).rejects.toMatchObject({ code: 'request_reused', status: 409 });
    const second = await create(w, HERO, REQ_B);
    expect(second.reused).toBe(false);
    expect(facebookDerivedPostSchema.safeParse({ variantId: HERO, requestId: REQ_A, confirm: true }).success).toBe(true);
    expect(facebookDerivedPostSchema.safeParse({ variantId: HERO, requestId: 'x', confirm: true }).success).toBe(false);
    expect(facebookDerivedPostSchema.safeParse({ variantId: HERO, requestId: REQ_A }).success).toBe(false);
  });
});

test.describe('Ownership, quota and source', () => {
  test('another user, a variant of another user or of another draft: refused before quota and AI', async () => {
    const w = world();
    // The draft is loaded with the caller's user filter: another user gets null.
    await expect(createFacebookPostFromImage({ parent: null, userId: OTHER, variantId: HERO, requestId: REQ_A }, w.deps(OTHER))).rejects.toMatchObject({ code: 'not_found' });
    await expect(createFacebookPostFromImage({ parent: parentOf(w), userId: OTHER, variantId: HERO, requestId: REQ_A }, w.deps(OTHER))).rejects.toMatchObject({ code: 'not_found' });
    for (const variantId of [FOREIGN, OTHER_DRAFT_VARIANT, '12345678-1234-4234-8234-123456789012']) {
      await expect(create(w, variantId, REQ_A)).rejects.toMatchObject({ code: 'variant_not_found', status: 404 });
    }
    expect(w.calls).toMatchObject({ quota: 0, loadSource: 0, write: 0, insert: 0 });
  });

  test('quota refused → nothing read or written; source deleted → refused before the quota', async () => {
    const w = world();
    const error = await create(w, HERO, REQ_A, w.deps(USER, { quota: false })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DerivedPostError);
    expect(error).toMatchObject({ code: 'quota', limit: { allowed: false, reason: 'trial_limit' } });
    expect(w.calls).toMatchObject({ quota: 1, loadSource: 0, write: 0, insert: 0 });

    const orphan = parentRow({ source_wordpress_generation_id: null }) as ParentDraft;
    await expect(create(w, HERO, REQ_B, undefined, orphan)).rejects.toMatchObject({ code: 'source_unavailable' });
    expect(w.calls.quota).toBe(1);
  });
});

test.describe('Generator: angle and distinct text', () => {
  test('without options the prompt is unchanged (TASK-068); with options it carries the angle and the earlier posts', async () => {
    const source = await loadFacebookPostSource(articleWorld(), USER, { wordpressArticleId: WP_GEN_ID }, { fetchImpl: wordpressFetch });
    const plain = buildFacebookPostPrompt(source);
    expect(plain[0].content).not.toMatch(/Visual angle|previous_posts/);
    expect(plain[1].content).not.toMatch(/previous_posts/);
    const withAngle = buildFacebookPostPrompt(source, [], { visualAngle: 'detail', previousPosts: [PARENT_POST, `${PARENT_POST} https://evil.test/x`] });
    expect(withAngle[0].content).toMatch(/Visual angle: The post goes with a close-up detail photo/);
    expect(withAngle[1].content).toMatch(/<previous_posts>[\s\S]*Post 2:/);
    expect(withAngle[1].content).not.toContain('https://evil.test');
  });

  test('a near-copy of an earlier post is sent back once, then the distinct answer is accepted', async () => {
    expect(checkDistinctFromPrevious({ post: PARENT_POST, callToAction: '', firstCommentText: '' }, [PARENT_POST])).toHaveLength(1);
    expect(checkDistinctFromPrevious({ post: HERO_POST, callToAction: '', firstCommentText: '' }, [PARENT_POST])).toEqual([]);
    const source = await loadFacebookPostSource(articleWorld(), USER, { wordpressArticleId: WP_GEN_ID }, { fetchImpl: wordpressFetch });
    const answers = [answer(PARENT_POST, 'Read it.', 'Here:'), answer(HERO_POST, 'Read the article.', 'The article:')];
    let n = 0;
    const result = await generateFacebookPost(source, async () => answers[n++], { visualAngle: 'hero', previousPosts: [PARENT_POST] });
    expect(n).toBe(2);
    expect(result.post).toBe(HERO_POST);
  });
});

test.describe('Route, migration and UI (source checks)', () => {
  test('route: auth, Zod, own draft, quota before the article read; no image, Meta or publication write', () => {
    const route = read('lib/social/facebook-derived-posts-route.ts');
    expect(route).toMatch(/auth\.getUser\(\)/);
    expect(route).toMatch(/isValidUuid\(id\)/);
    expect(route).toMatch(/facebookDerivedPostSchema\.safeParse/);
    expect(route).toMatch(/getSocialContentGeneration\(supabase, user\.id, id\)/);
    expect(route).toMatch(/checkRateLimit\(user\.id, user\.email \?\? '', 'social\/facebook-post', 30, 3600, \{ enforceTrialLimit: true \}\)/);
    expect(route).not.toMatch(/createFacebookGraph|MetaGraphClient|supabasePublicationStore|from\('social_publications'\)/);
    const core = read('lib/social/facebook-derived-posts.ts');
    expect(core.indexOf('deps.checkQuota()')).toBeLessThan(core.indexOf('deps.loadSource('));
    expect(core.indexOf('deps.findByRequestId(requestId)')).toBeLessThan(core.indexOf('deps.checkQuota()'));
    // The atomic reservation comes before the quota and the AI call.
    expect(core.indexOf('deps.reserveRequest(')).toBeGreaterThan(0);
    expect(core.indexOf('deps.reserveRequest(')).toBeLessThan(core.indexOf('deps.checkQuota()'));
    expect(core.indexOf('deps.reserveRequest(')).toBeLessThan(core.indexOf('deps.writePost('));
    expect(route).toMatch(/reserveRequest: \(requestId, parentId, variantId\) => requests\.reserve\(/);
    const store = read('lib/queries/facebook-article-posts.ts');
    expect(store).toMatch(/from\('social_draft_creation_requests'\)\s*\.insert\(\{ user_id: userId, request_id: requestId/);
    // Only a failed (released) reservation is taken over; a pending one is never resumed.
    expect(store).toMatch(/\.eq\('parent_generation_id', parentId\)\s*\.eq\('status', 'failed'\)/);
    expect(store).toMatch(/\{ status: 'expired' \} : \{ status: 'in_progress' \}/);
    expect(core.indexOf('await deps.failRequest(requestId)')).toBeLessThan(core.indexOf('deps.loadSource('));
    expect(core.slice(core.indexOf('deps.loadSource('))).not.toMatch(/failRequest/);
    expect(store).toMatch(/fail closed/);
    expect(read('app/api/social/generations/[id]/derived-posts/route.ts')).toMatch(/export async function POST/);
    const queries = read('lib/queries/facebook-article-posts.ts');
    expect(queries.match(/\.eq\('user_id', userId\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(queries).toMatch(/'23505'/);
  });

  test('migration 052: atomic request reservation table with RLS; 050 and 051 untouched (applied)', () => {
    const sql = read('supabase/migrations/052_add_social_draft_creation_requests.sql')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sql).toMatch(/CREATE TABLE social_draft_creation_requests/);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, request_id\)/);
    expect(sql).toMatch(/CHECK \(status IN \('pending', 'completed', 'failed'\)\)/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/g\.user_id = auth\.uid\(\) AND g\.platform = 'facebook'/);
    expect(sql).not.toMatch(/ALTER TABLE social_content_generations|DROP|social_publications/);
    // 050 (committed) and 051 (applied 2026-11-18, not committed yet): never modified after being applied.
    const committed050 = execSync('git show HEAD:supabase/migrations/050_add_facebook_image_variants.sql', { cwd: ROOT }).toString();
    expect(read('supabase/migrations/050_add_facebook_image_variants.sql')).toBe(committed050);
    const applied051 = readFileSync(join(ROOT, 'supabase/migrations/051_add_facebook_derived_drafts.sql'));
    expect(createHash('sha256').update(applied051).digest('hex')).toBe('a812038dadfdba4eee2aa928e1a96e4f37f7c7de7a3b1961947b15912e7cffe0');
    // 052 applied 2026-11-18 as well: pinned too.
    const applied052 = readFileSync(join(ROOT, 'supabase/migrations/052_add_social_draft_creation_requests.sql'));
    expect(createHash('sha256').update(applied052).digest('hex')).toBe('de90793587f60bd5fae35f86973d45f14c4cd99d88406293b42509fb6c9c40bb');
  });

  test('migration 051: new columns, unique request id per user, ownership trigger; 049 free, 050 untouched', () => {
    const files = readdirSync(join(ROOT, 'supabase/migrations'));
    expect(files.map((file) => file.slice(0, 3))).not.toContain('049');
    expect(existsSync(join(ROOT, 'supabase/migrations/051_add_facebook_derived_drafts.sql'))).toBe(true);
    const sql = read('supabase/migrations/051_add_facebook_derived_drafts.sql')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sql).toMatch(/ADD COLUMN derived_from_generation_id uuid REFERENCES social_content_generations\(id\) ON DELETE SET NULL/);
    expect(sql).toMatch(/ADD COLUMN origin_image_variant_id uuid REFERENCES social_content_image_variants\(id\) ON DELETE SET NULL/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX social_content_generations_creation_request_key\s+ON social_content_generations \(user_id, creation_request_id\)/);
    expect(sql).toMatch(/v\.user_id = NEW\.user_id/);
    expect(sql).toMatch(/g\.user_id = NEW\.user_id AND g\.platform = 'facebook'/);
    expect(sql).not.toMatch(/social_publications|DROP|DELETE FROM|UPDATE social_content_image_variants/);
    // 050 is applied in production: byte-identical to the committed version.
    const committed = execSync('git show HEAD:supabase/migrations/050_add_facebook_image_variants.sql', { cwd: ROOT });
    const current = readFileSync(join(ROOT, 'supabase/migrations/050_add_facebook_image_variants.sql'));
    expect(createHash('sha256').update(current).digest('hex')).toBe(createHash('sha256').update(committed).digest('hex'));
  });

  test('UI: Create new post with this image on every image, cost before confirmation, history grouped by article', () => {
    const ui = read('components/social/facebook-image-variants.tsx');
    for (const label of ['Create new post with this image', 'Create a new post with this image?', 'This post stays exactly as it is', 'Write the new post', 'Open the new post']) {
      expect(ui, label).toContain(label);
    }
    expect(ui).toMatch(/DERIVED_POST_COST_TEXT/);
    expect(ui).toMatch(/requestId: newRequestId\(\)/);
    expect(ui).toMatch(/disabled=\{busy !== null\} onClick=\{\(\) => setConfirmOpen\(true\)\}/); // generation allowed when locked
    expect(read('lib/social/facebook-article-posts.ts')).toMatch(/1 text generation \(up to 2 AI text calls/);
    const history = read('app/(dashboard)/facebook/page.tsx');
    expect(history).toMatch(/Group by article/);
    expect(history).toMatch(/groupByArticle\(items\)/);
    expect(history).toMatch(/<PublicationFacts publication=\{publication\} \/>/);
    const detail = read('app/(dashboard)/facebook/[id]/page.tsx');
    expect(detail).toMatch(/<FacebookArticlePosts currentId=\{item\.id\}/);
    expect(read('components/social/facebook-article-posts.tsx')).toMatch(/View on Facebook/);
  });
});
