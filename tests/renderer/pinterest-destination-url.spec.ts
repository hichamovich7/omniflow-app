import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INVALID_DESTINATION_URL_MESSAGE,
  NO_PERMALINK_PIN_WARNING,
  resolvePinDestination,
  validateDestinationUrl,
} from '@/lib/pinterest/destination-url';
import {
  ARTICLE_SOURCE_NO_URL_MESSAGE,
  generatePinsSchema,
  updatePinLinkSchema,
  updatePinTextSchema,
} from '@/lib/validations/pinterest';
import { updatePinLink } from '@/lib/pinterest/pin-text';
import { loadWordPressPostPinterestSource, verifiedPostPermalink } from '@/lib/social/pinterest-from-wordpress-post';
import { buildArticlePinterestContext, SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { buildArticleGrounding } from '@/lib/pinterest/article-briefs';
import { WordPressReadError } from '@/lib/wordpress/post-reader';
import { encryptSecret } from '@/lib/wordpress/crypto';
import { generatePinterestCsv } from '@/lib/csv/pinterest';
import type { Pin } from '@/types/database';

// TASK-071 — offline: Supabase and WordPress are in-memory fakes, no AI call.

process.env.WORDPRESS_ENCRYPTION_KEY = 'a'.repeat(64);

const USER = 'user-1';
const OTHER = 'user-2';
const SITE_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const ARTICLE_ID = '33333333-3333-4333-8333-333333333333';
const PIN_ID = '44444444-4444-4444-8444-444444444444';
const GEN_ID = '55555555-5555-4555-8555-555555555555';
const SITE_URL = 'https://crochet.example.test';
const PERMALINK = `${SITE_URL}/colorful-crochet-scarf-patterns/`;
const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

const POST_HTML = `
<p>A colorful crochet scarf can change the feel of a coat. Self-striping yarns and bias construction build interest.</p>
<h2>1. On the Bias Scarf</h2><p>Diagonal bands in double crochet.</p>
<h2>2. Waves Scarf</h2><p>A double crochet repeat turns self-striping shades into waves.</p>
<h2>3. Color-Block Scarf</h2><p>Color block sections in a rectangle with a fuzzy yarn.</p>`;

function wpPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 1527,
    date: '2026-10-02T09:00:00',
    status: 'publish',
    link: PERMALINK,
    title: { rendered: '10 Free Colorful Crochet Scarf Patterns' },
    excerpt: { rendered: '<p>Ten colorful scarves.</p>' },
    content: { rendered: POST_HTML, protected: false },
    categories: [],
    _embedded: {},
    ...overrides,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(respond: () => Response | Promise<Response>) {
  const methods: string[] = [];
  const fn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    methods.push(init?.method ?? 'GET');
    return respond();
  }) as typeof fetch;
  return { fn, methods };
}

type Row = Record<string, unknown>;

/** In-memory fake; every write is recorded with its payload. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const writes: Array<{ kind: string; table: string; payload: unknown }> = [];
  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let pendingUpdate: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const apply = () => {
      if (pendingUpdate) for (const row of rows()) Object.assign(row, pendingUpdate);
      pendingUpdate = null;
    };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => (filters.push((r) => r[column] === value), builder),
      neq: (column: string, value: unknown) => (filters.push((r) => r[column] !== value), builder),
      in: (column: string, values: unknown[]) => (filters.push((r) => values.includes(r[column])), builder),
      order: () => builder,
      single: async () => {
        apply();
        const [row] = rows();
        return { data: row ?? null, error: row ? null : { message: 'not found' } };
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => (apply(), resolve({ data: rows(), error: null })),
      insert: (payload: unknown) => (writes.push({ kind: 'insert', table, payload }), builder),
      update: (payload: Row) => (writes.push({ kind: 'update', table, payload }), (pendingUpdate = payload), builder),
      upsert: (payload: unknown) => (writes.push({ kind: 'upsert', table, payload }), builder),
      delete: () => (writes.push({ kind: 'delete', table, payload: null }), builder),
    };
    return builder;
  }
  return { client: { from } as unknown as SupabaseClient, writes };
}

function pinRow(overrides: Partial<Pin> = {}): Pin {
  return {
    id: PIN_ID,
    generation_id: GEN_ID,
    language: 'en',
    title: 'Waves Scarf',
    description: 'A wavy crochet scarf.',
    keywords: 'crochet scarf',
    board: 'Crochet Scarves',
    board_id: null,
    board_section: null,
    image_prompt: 'A wavy scarf.',
    image_analysis: null,
    media_url: 'https://cdn.example.test/pin.png',
    link_url: null,
    publish_date: null,
    visual_format: 'photo',
    overlay_text: null,
    title_banner_template: null,
    cta_banner_template: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function pinsDb(owner = USER, pin: Partial<Pin> = {}) {
  return fakeSupabase({
    pins: [pinRow(pin) as unknown as Row],
    generations: [{ id: GEN_ID, user_id: owner, project_id: PROJECT_ID, keyword: 'crochet scarf', language: 'en', status: 'completed' }],
  });
}

function wordpressDb() {
  return fakeSupabase({
    wordpress_sites: [
      { id: SITE_ID, project_id: PROJECT_ID, user_id: USER, site_url: SITE_URL, wp_username: 'editor', encrypted_application_password: encryptSecret('abcd efgh'), created_at: '' },
    ],
    projects: [{ id: PROJECT_ID, user_id: USER, niche: 'Crochet', description: '', default_language: 'en' }],
  });
}

const base = { projectId: PROJECT_ID, keyword: 'crochet scarf', language: 'en', pinsRequested: 3 };

// ---------------------------------------------------------------------------

test.describe('Manual Destination URL before generation', () => {
  test('a valid http(s) URL is accepted as typed (trimmed)', () => {
    const parsed = generatePinsSchema.safeParse({ ...base, destinationUrl: '  https://example.com/article/?ref=a#top ' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.destinationUrl).toBe('https://example.com/article/?ref=a#top');
    expect(generatePinsSchema.safeParse({ ...base, destinationUrl: 'http://example.com' }).success).toBe(true);
  });

  test('an invalid URL is refused with a clear message', () => {
    for (const value of ['example.com/article', '/article', 'ftp://example.com/a', 'javascript:alert(1)', 'https://exa mple.com', 'https://user:pass@example.com/']) {
      const parsed = generatePinsSchema.safeParse({ ...base, destinationUrl: value });
      expect(parsed.success, value).toBe(false);
      expect(parsed.success ? '' : parsed.error.issues[0].message).toBe(INVALID_DESTINATION_URL_MESSAGE);
    }
    expect(validateDestinationUrl('not a url')).toEqual({ ok: false, message: INVALID_DESTINATION_URL_MESSAGE });
  });

  test('an empty field means no URL, as before', () => {
    for (const value of [undefined, '', '   ']) {
      const parsed = generatePinsSchema.safeParse({ ...base, destinationUrl: value });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.destinationUrl).toBeUndefined();
    }
    expect(resolvePinDestination({ manualUrl: undefined, source: null })).toEqual({ linkUrl: null, source: null, warning: null });
  });

  test('works with every source; Research source URLs stay refused with an article', () => {
    const url = 'https://example.com/article/';
    expect(generatePinsSchema.safeParse({ ...base, destinationUrl: url, websiteUrl: 'https://source.example.com' }).success).toBe(true);
    expect(generatePinsSchema.safeParse({ ...base, destinationUrl: url, wordpressArticleId: ARTICLE_ID }).success).toBe(true);
    expect(generatePinsSchema.safeParse({ ...base, destinationUrl: url, wordpressPost: { siteId: SITE_ID, postId: 1527 } }).success).toBe(true);
    const refused = generatePinsSchema.safeParse({ ...base, wordpressArticleId: ARTICLE_ID, websiteUrl: url });
    expect(refused.success ? '' : refused.error.issues[0].message).toBe(ARTICLE_SOURCE_NO_URL_MESSAGE);
  });

  test('the typed URL becomes link_url and wins over a post permalink', () => {
    expect(resolvePinDestination({ manualUrl: 'https://example.com/a', source: null }).linkUrl).toBe('https://example.com/a');
    expect(
      resolvePinDestination({ manualUrl: 'https://example.com/a', source: { sourceType: 'external_wordpress_post', permalink: PERMALINK } })
    ).toEqual({ linkUrl: 'https://example.com/a', source: 'manual', warning: null });
  });

  test('route: link_url is written from the resolved destination and never reaches the prompt', () => {
    const route = read('app/api/pinterest/generate/route.ts');
    expect(route).toContain('resolvePinDestination({ manualUrl: destinationUrl, source: articleSource })');
    expect(route).toContain('link_url: destination.linkUrl');
    const promptCall = route.slice(route.indexOf('buildPinterestPinsPrompt({'), route.indexOf('const content = await generateText'));
    expect(promptCall).not.toMatch(/destination|linkUrl|link_url|permalink/i);
    expect(read('lib/prompts/pinterest-pins.ts')).not.toMatch(/destinationUrl|link_url/);
  });
});

test.describe('Edit the destination URL from the history (PATCH /api/pinterest/pins/[id])', () => {
  test('sets the URL of an owned Pin and writes only link_url', async () => {
    const fake = pinsDb();
    const pin = await updatePinLink(fake.client, USER, PIN_ID, { linkUrl: 'https://example.com/article/' });
    expect(pin.link_url).toBe('https://example.com/article/');
    expect(fake.writes).toEqual([{ kind: 'update', table: 'pins', payload: { link_url: 'https://example.com/article/' } }]);
    expect(pin).toMatchObject({ title: 'Waves Scarf', description: 'A wavy crochet scarf.', keywords: 'crochet scarf', media_url: 'https://cdn.example.test/pin.png' });
  });

  test('changes an existing URL', async () => {
    const fake = pinsDb(USER, { link_url: 'https://example.com/old/' });
    const pin = await updatePinLink(fake.client, USER, PIN_ID, { linkUrl: 'https://example.com/new/' });
    expect(pin.link_url).toBe('https://example.com/new/');
  });

  test('removes the URL (null or blank)', async () => {
    expect(updatePinLinkSchema.parse({ linkUrl: '' })).toEqual({ linkUrl: null });
    expect(updatePinLinkSchema.parse({ linkUrl: null })).toEqual({ linkUrl: null });
    const fake = pinsDb(USER, { link_url: 'https://example.com/old/' });
    const pin = await updatePinLink(fake.client, USER, PIN_ID, { linkUrl: null });
    expect(pin.link_url).toBeNull();
    expect(fake.writes).toEqual([{ kind: 'update', table: 'pins', payload: { link_url: null } }]);
  });

  test("another user's Pin is forbidden and nothing is written", async () => {
    const fake = pinsDb(OTHER);
    const error = await updatePinLink(fake.client, USER, PIN_ID, { linkUrl: 'https://example.com/a' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SocialGenerationError);
    expect((error as SocialGenerationError).status).toBe(403);
    expect(fake.writes).toEqual([]);
  });

  test('schemas: invalid URL refused, link and text edits never mixed', () => {
    expect(updatePinLinkSchema.safeParse({ linkUrl: 'example.com' }).success).toBe(false);
    expect(updatePinLinkSchema.safeParse({ linkUrl: 'https://example.com', title: 'x' }).success).toBe(false);
    expect(updatePinTextSchema.safeParse({ title: 'a', description: 'b', keywords: '', linkUrl: 'https://example.com' }).success).toBe(false);
  });

  test('the existing PATCH route is reused, with auth and ownership, and no AI call', () => {
    const route = read('app/api/pinterest/pins/[id]/route.ts');
    expect(route).toContain("'linkUrl' in body");
    expect(route).toContain('updatePinLink(supabase, user.id, id, parsed.data)');
    expect(route).toContain('supabase.auth.getUser()');
    expect(route).not.toMatch(/generateText|openrouter|lib\/ai/i);
    const pinText = read('lib/pinterest/pin-text.ts');
    const fn = pinText.slice(pinText.indexOf('export async function updatePinLink'), pinText.indexOf('export async function prepareArticlePinRegeneration'));
    expect(fn).toContain('await loadOwnedPin(supabase, userId, pinId)');
    expect(fn).toContain('.update({ link_url: input.linkUrl })');
    expect(fn).not.toMatch(/generateText|regenerate/);
  });

  test('UI: bulk action for selected Pins and per-Pin editor, both through PATCH { linkUrl }', () => {
    const dialog = read('components/pinterest/destination-url-dialog.tsx');
    expect(dialog).toContain('Add destination URL');
    expect(dialog).toContain('Edit destination URL');
    expect(dialog).toContain('Remove URL');
    expect(dialog).toContain("method: 'PATCH'");
    expect(dialog).toContain('JSON.stringify({ linkUrl })');
    expect(dialog).toContain('ids.map((id) => savePinLinkUrl(id, check.value))');
    expect(dialog).not.toMatch(/\/regenerate|generate-images|analytics\/utm/);
    expect(read('components/editorial/editorial-workspace.tsx')).toContain('<DestinationUrlDialog selectedPinIds={selectedIds} />');
    expect(read('components/pinterest/pin-detail-dialog.tsx')).toContain('<PinDestinationUrlEditor pin={pin} />');
  });
});

test.describe('Existing WordPress post: verified permalink as destination', () => {
  test('a published post: its permalink is the Pins destination, read with GET only, nothing written', async () => {
    const fake = wordpressDb();
    const wp = fakeFetch(() => json(wpPost()));
    const source = await loadWordPressPostPinterestSource(fake.client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn });
    expect(source.permalink).toBe(PERMALINK);
    expect(wp.methods).toEqual(['GET']);
    expect(fake.writes).toEqual([]);
    expect(resolvePinDestination({ source })).toEqual({ linkUrl: PERMALINK, source: 'wordpress_permalink', warning: null });
    // Never in the prompt.
    const prompt = buildArticlePinterestContext(source, 'crochet scarf', buildArticleGrounding(source.context, 3));
    expect(prompt).not.toContain(PERMALINK);
    expect(prompt).not.toMatch(/https?:|example\.test/);
  });

  test('no permalink, a draft, or a link outside the site: no URL and a clear warning', async () => {
    for (const overrides of [{ link: '' }, { status: 'draft' }, { link: 'https://elsewhere.example.com/post/' }, { link: 'not a url' }]) {
      const wp = fakeFetch(() => json(wpPost(overrides)));
      const source = await loadWordPressPostPinterestSource(wordpressDb().client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn });
      expect(source.permalink, JSON.stringify(overrides)).toBeNull();
      expect(resolvePinDestination({ source })).toEqual({ linkUrl: null, source: null, warning: NO_PERMALINK_PIN_WARNING });
    }
    expect(verifiedPostPermalink(`${SITE_URL}/a/`, SITE_URL, 'future')).toBeNull();
  });

  test('a WordPress error while reading the post: clear error, nothing written, no URL invented', async () => {
    for (const respond of [() => json({ code: 'rest_forbidden' }, 403), () => json({}, 500), () => Promise.reject(new Error('network down'))]) {
      const fake = wordpressDb();
      const wp = fakeFetch(respond);
      const error = await loadWordPressPostPinterestSource(fake.client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WordPressReadError);
      expect(fake.writes).toEqual([]);
      expect(wp.methods.every((m) => m === 'GET')).toBe(true);
    }
  });

  test('an OmniFlow article without a typed URL keeps its current behavior: no link, no warning', () => {
    expect(resolvePinDestination({ source: { sourceType: 'omniflow_article', permalink: null } })).toEqual({ linkUrl: null, source: null, warning: null });
    // Never built from a title or slug.
    expect(read('lib/pinterest/destination-url.ts')).not.toMatch(/\.slug|\.title|slugify/);
  });

  test('WordPress is never modified: post source and route stay read-only', () => {
    const loader = read('lib/social/pinterest-from-wordpress-post.ts');
    expect(loader).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'|upsertPost|updatePost/);
    expect(read('app/api/pinterest/generate/route.ts')).not.toMatch(/upsertPost|uploadMedia|updateMediaAltText|findOrCreateTag/);
    const summary = read('components/social/article-source-summary.tsx');
    expect(summary).toContain('data-testid="article-source-permalink"');
    expect(summary).toContain('data-testid="article-source-permalink-missing"');
    expect(read('app/(dashboard)/pinterest/from-wordpress/page.tsx')).toContain('permalink: article.permalink ?? null');
  });
});

test.describe('UTM compatibility (TASK-070)', () => {
  test('a saved clean URL gets pin-01 / pin-02 in the CSV only', () => {
    const pins = [pinRow({ id: 'a', link_url: 'https://example.com/article/' }), pinRow({ id: 'b', link_url: 'https://example.com/article/' })];
    const snapshot = JSON.stringify(pins);
    const rows = generatePinterestCsv(pins, { utmTracking: true }).split('\n').slice(1);
    expect(rows[0]).toContain('https://example.com/article/?utm_source=pinterest&utm_medium=organic&utm_content=pin-01');
    expect(rows[1]).toContain('https://example.com/article/?utm_source=pinterest&utm_medium=organic&utm_content=pin-02');
    expect(JSON.stringify(pins)).toBe(snapshot);
  });

  test('no UTM duplicates, other parameters and fragment kept', () => {
    const pins = [pinRow({ link_url: 'https://example.com/a/?ref=nl&utm_source=old&utm_content=x#steps' })];
    const row = generatePinterestCsv(pins, { utmTracking: true }).split('\n')[1];
    expect(row).toContain('https://example.com/a/?ref=nl&utm_source=pinterest&utm_medium=organic&utm_content=pin-01#steps');
    expect(row.match(/utm_source/g)).toHaveLength(1);
  });

  test('UTM never stored: generation and edit save the clean URL', () => {
    expect(resolvePinDestination({ manualUrl: 'https://example.com/a/' }).linkUrl).toBe('https://example.com/a/');
    for (const file of ['lib/pinterest/destination-url.ts', 'lib/pinterest/pin-text.ts', 'app/api/pinterest/generate/route.ts', 'components/pinterest/destination-url-dialog.tsx']) {
      expect(read(file), file).not.toContain("from '@/lib/analytics/utm'");
    }
  });
});
