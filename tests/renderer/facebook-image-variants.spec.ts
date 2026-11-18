import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import { MetaGraphClient } from '@/lib/social/meta/graph-client';
import {
  buildVariantPrompt,
  FACEBOOK_VARIANT_ANGLES,
  generateFacebookImageVariants,
  imageChangeLocked,
  ImageVariantError,
  selectFacebookImage,
  wordpressImageOf,
  type FacebookImageVariant,
  type GenerateVariantsDeps,
  type VariantStore,
} from '@/lib/social/facebook-image-variants';
import { storeFacebookVariantImage } from '@/lib/social/facebook-variant-storage';
import { publicationContent, publishFacebookContent, runClaimedScheduledPost } from '@/lib/social/facebook-publish';
import { scheduleFacebookContent } from '@/lib/social/facebook-schedule';
import { facebookImageSelectionSchema, facebookImageVariantsSchema } from '@/lib/validations/facebook';
import type { NewPublication, PublicationStore, ScheduleStore } from '@/lib/queries/social-publications';
import type { PublicationStatus, SocialPublication } from '@/lib/social/facebook-publication';
import type { SocialContentGeneration } from '@/lib/social/social-content';
import type { MediaStorage } from '@/lib/storage';

/**
 * TASK-101 — Facebook image variants. Offline: the image model, the media
 * storage and the Meta Graph API are fakes; the database is in memory. No
 * AI call, no Meta call, no WordPress call.
 */

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const DRAFT = '44444444-4444-4444-8444-444444444444';
const OTHER_DRAFT = '55555555-5555-4555-8555-555555555555';
const WP_IMAGE = 'https://crochet.example.test/wp-content/uploads/featured.jpg';
const PERMALINK = 'https://crochet.example.test/colorful-crochet-scarf-patterns/';
const PAGE_ID = '1122334455';
const POST_ID = `${PAGE_ID}_667788`;
const PAGE_TOKEN = 'EAAG-page-token-SECRET-123456789';
const NOW = new Date('2026-11-15T10:00:00Z');

// ---------------------------------------------------------------------------
// In-memory drafts + variants (same ownership filters as the Supabase store)

type Draft = SocialContentGeneration;

function draftRow(overrides: Partial<Draft> = {}): Draft {
  return {
    id: DRAFT,
    user_id: USER,
    project_id: PROJECT,
    platform: 'facebook',
    status: 'completed',
    source_type: 'omniflow_article',
    source_wordpress_generation_id: null,
    source_wordpress_site_id: null,
    source_wordpress_article_id: null,
    source_pinterest_generation_id: null,
    source_title: 'Colorful crochet scarf patterns',
    language: 'en',
    title: 'Colorful crochet scarf patterns',
    subtitle: null,
    content_markdown: 'Three colorful crochet scarves to make this winter, from easy waves to calm ombre shades. See https://example.test/x #crochet',
    content_html: '',
    word_count: 20,
    image_url: WP_IMAGE,
    image_alt: 'Crochet scarves',
    cta_url: PERMALINK,
    call_to_action: 'Discover all three scarves in the full article.',
    first_comment_text: 'Here is the full article:',
    link_placement: 'first_comment',
    content_stream_id: null,
    // Migration 050 backfill of an existing draft: the WordPress image is kept apart.
    source_image_url: WP_IMAGE,
    source_image_alt: 'Crochet scarves',
    selected_image_variant_id: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function memory() {
  const drafts = new Map<string, Draft>([[DRAFT, draftRow()], [OTHER_DRAFT, draftRow({ id: OTHER_DRAFT })]]);
  const variants = new Map<string, FacebookImageVariant>();
  const draftUpdates: string[] = [];
  let counter = 0;

  function store(userId: string): VariantStore {
    return {
      async insertVariant(row) {
        if (row.user_id !== userId) return null;
        const draft = drafts.get(row.social_content_generation_id);
        if (!draft || draft.user_id !== userId || draft.platform !== 'facebook') return null; // RLS WITH CHECK
        const full: FacebookImageVariant = { ...row, id: `6666666${++counter}-6666-4666-8666-666666666666`, created_at: NOW.toISOString() };
        variants.set(full.id, full);
        return { ...full };
      },
      async getVariant(id) {
        const row = variants.get(id);
        return row && row.user_id === userId ? { ...row } : null;
      },
      async updateDraftImage(generationId, patch) {
        const draft = drafts.get(generationId);
        if (!draft || draft.user_id !== userId || draft.platform !== 'facebook') return null;
        draftUpdates.push(generationId);
        Object.assign(draft, patch);
        return { ...draft };
      },
    };
  }
  return { drafts, variants, draftUpdates, store };
}

function fakeDeps(db: ReturnType<typeof memory>, options: { failAt?: number[]; reserve?: GenerateVariantsDeps['reserveUnits'] } = {}) {
  const calls: Array<{ prompt: string; size: string }> = [];
  const reservations: number[] = [];
  let ids = 0;
  const deps: GenerateVariantsDeps = {
    store: db.store(USER),
    reserveUnits:
      options.reserve ??
      (async (units) => {
        reservations.push(units);
        return 'reserved';
      }),
    async generateImage(params) {
      calls.push(params);
      if (options.failAt?.includes(calls.length)) throw new Error('provider failed');
      return Buffer.from(`image-${calls.length}`);
    },
    async storeImage({ userId, generationId, batchId, position }) {
      const key = `images/facebook/${userId}/${generationId}/${batchId}-${position}.jpg`;
      return { url: `https://media.example.test/${key}`, key, width: 1024, height: 1280 };
    },
    newId: () => `77777777-7777-4777-8777-77777777777${++ids}`,
    imageModel: 'test/image-model',
  };
  return { deps, calls, reservations };
}

/** Fails the test if anything reaches the network (Meta, WordPress, AI). */
async function withoutNetwork<T>(run: () => Promise<T>): Promise<{ value: T; fetches: string[] }> {
  const original = globalThis.fetch;
  const fetches: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetches.push(String(input));
    throw new Error('network is not allowed in this test');
  }) as typeof fetch;
  try {
    return { value: await run(), fetches };
  } finally {
    globalThis.fetch = original;
  }
}

const publication = (status: PublicationStatus) => ({ status }) as Pick<SocialPublication, 'status'>;

// ---------------------------------------------------------------------------
// Fake Meta Graph API + publication stores (to check what is really sent)

function fakeGraph() {
  const calls: Array<{ method: string; path: string; body: string }> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    calls.push({ method: init?.method ?? 'GET', path, body: typeof init?.body === 'string' ? init.body : '' });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (path.endsWith('/photos')) return ok({ id: '667788', post_id: POST_ID });
    if (path.endsWith('/comments')) return ok({ id: `${POST_ID}_c1` });
    if (path.endsWith(`/${POST_ID}`)) return ok({ permalink_url: `https://www.facebook.com/${POST_ID}` });
    return new Response(JSON.stringify({ error: { code: 803 } }), { status: 400 });
  };
  const client = new MetaGraphClient({ appId: '123456789', appSecret: 'app-secret', graphVersion: 'v25.0' }, { fetchImpl, timeoutMs: 200 });
  const photoUrl = () => new URLSearchParams(calls.find((c) => c.path.endsWith('/photos'))?.body ?? '').get('url');
  return { client, calls, photoUrl };
}

function publicationStore(): PublicationStore & ScheduleStore & { rows: Map<string, SocialPublication> } {
  const rows = new Map<string, SocialPublication>();
  return {
    rows,
    async findForGeneration(generationId, pageId) {
      return [...rows.values()].find((r) => r.social_content_generation_id === generationId && r.external_account_id === pageId) ?? null;
    },
    async insert(row: NewPublication) {
      const full = { ...row, id: `pub-${rows.size + 1}`, created_at: NOW.toISOString(), updated_at: NOW.toISOString() } as SocialPublication;
      rows.set(full.id, full);
      return { row: { ...full }, conflict: false };
    },
    async claimPost() {
      return null;
    },
    async claimComment() {
      return null;
    },
    async update(id, patch) {
      const row = rows.get(id);
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

const CONNECTION = { id: '99999999-9999-4999-8999-999999999999', external_account_id: PAGE_ID, external_account_name: 'Crochet Sweater Pattern' };

// ===========================================================================

test.describe('Default: the WordPress image, no AI call', () => {
  test('a new draft keeps the WordPress image; the draft flow never calls the image model', () => {
    const draft = draftRow({ source_image_url: null, source_image_alt: null }); // created after migration 050
    expect(wordpressImageOf(draft)).toEqual({ url: WP_IMAGE, alt: 'Crochet scarves' });
    expect(publicationContent(draft, CONNECTION).post_image_url).toBe(WP_IMAGE);
    // Creating / editing a Facebook draft has no image generation path.
    for (const file of ['lib/social/facebook-post.ts', 'app/api/social/facebook-post/route.ts', 'app/api/social/generations/[id]/route.ts']) {
      // (a type import of the visual angles is fine: no generation code path)
      expect(read(file), file).not.toMatch(/generateImage|generateFacebookImageVariants|image-variants-route/);
    }
  });

  test('"Use the WordPress image" on a draft that never changed: no write', async () => {
    const db = memory();
    const result = await selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId: null }, { store: db.store(USER) });
    expect(result.image_url).toBe(WP_IMAGE);
    expect(db.draftUpdates).toHaveLength(0);
  });
});

test.describe('Generate image variants', () => {
  test('1 to 3 distinct angles from the title + content; quota reserved once before any call; the post image does not change', async () => {
    const db = memory();
    const { deps, calls, reservations } = fakeDeps(db);
    const { value: result, fetches } = await withoutNetwork(() =>
      generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count: 3 }, deps)
    );
    expect(fetches).toEqual([]); // no Meta, no WordPress
    expect(reservations).toEqual([3]);
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.size === '1024x1536')).toBe(true);
    expect(new Set(calls.map((c) => c.prompt)).size).toBe(3);
    for (const call of calls) {
      expect(call.prompt).toContain('Colorful crochet scarf patterns');
      expect(call.prompt).toContain('Three colorful crochet scarves');
      expect(call.prompt).not.toMatch(/https?:\/\//);
      expect(call.prompt).toMatch(/No text/);
    }
    expect(result).toMatchObject({ unitsUsed: 3, failures: [] });
    expect(result.variants.map((v) => [v.position, v.angle])).toEqual([
      [1, 'hero'],
      [2, 'lifestyle'],
      [3, 'detail'],
    ]);
    expect(result.variants[0]).toMatchObject({
      user_id: USER,
      social_content_generation_id: DRAFT,
      media_profile: 'facebook-feed-portrait',
      width: 1024,
      height: 1280,
      image_model: 'test/image-model',
    });
    expect(result.variants[0].storage_key).toMatch(new RegExp(`^images/facebook/${USER}/${DRAFT}/`));
    // Generating never changes the selected image.
    expect(db.draftUpdates).toHaveLength(0);
    expect(db.drafts.get(DRAFT)).toMatchObject({ image_url: WP_IMAGE, selected_image_variant_id: null });
  });

  test('count outside 1-3 is refused before the quota and the model', async () => {
    for (const count of [0, 4, 1.5]) {
      const db = memory();
      const { deps, calls, reservations } = fakeDeps(db);
      await expect(generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count }, deps)).rejects.toMatchObject({ code: 'invalid_count' });
      expect(reservations).toEqual([]);
      expect(calls).toHaveLength(0);
    }
    expect(facebookImageVariantsSchema.safeParse({ count: 2, confirm: true }).success).toBe(true);
    expect(facebookImageVariantsSchema.safeParse({ count: 4, confirm: true }).success).toBe(false);
    expect(facebookImageVariantsSchema.safeParse({ count: 2 }).success).toBe(false);
    expect(facebookImageVariantsSchema.safeParse({ count: 2, confirm: true, select: true }).success).toBe(false);
  });

  test('partial failure: the successful variants are kept and the failed one is reported; units = calls launched', async () => {
    const db = memory();
    const { deps, calls } = fakeDeps(db, { failAt: [2] });
    const result = await generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count: 3 }, deps);
    expect(calls).toHaveLength(3);
    expect(result.unitsUsed).toBe(3);
    expect(result.variants.map((v) => v.position)).toEqual([1, 3]);
    expect(result.failures).toEqual([{ position: 2, angle: 'Lifestyle scene', message: expect.stringMatching(/could not be generated/) }]);
    expect(db.variants.size).toBe(2);
    expect(db.drafts.get(DRAFT)?.image_url).toBe(WP_IMAGE);
  });
});

test.describe('Quota', () => {
  test('not enough trial units, or quota unreadable: refused before any image call', async () => {
    for (const [answer, code] of [
      ['trial_limit', 'trial_limit'],
      ['unavailable', 'quota_unavailable'],
    ] as const) {
      const db = memory();
      const { deps, calls } = fakeDeps(db, { reserve: async () => answer });
      const error = await generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count: 2 }, deps).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ImageVariantError);
      expect(error).toMatchObject({ code, status: code === 'trial_limit' ? 403 : 503 });
      expect(calls).toHaveLength(0);
      expect(db.variants.size).toBe(0);
    }
  });

  test('two concurrent requests cannot go past the cap together (all-or-nothing reservation)', async () => {
    // Same rule as reserve_trial_usage(): UPDATE … WHERE used + units <= limit, serialized per user.
    const limit = 10;
    let used = 8;
    let queue = Promise.resolve();
    const reserve = (units: number) =>
      new Promise<'reserved' | 'trial_limit'>((resolve) => {
        queue = queue.then(async () => {
          await new Promise((r) => setTimeout(r, 5));
          if (used + units <= limit) {
            used += units;
            resolve('reserved');
          } else resolve('trial_limit');
        });
      });
    const db = memory();
    const a = fakeDeps(db, { reserve });
    const b = fakeDeps(db, { reserve });
    const results = await Promise.allSettled([
      generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count: 2 }, a.deps),
      generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count: 2 }, b.deps),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && (r.reason as ImageVariantError).code === 'trial_limit')).toHaveLength(1);
    expect(a.calls.length + b.calls.length).toBe(2);
    expect(used).toBe(10);

    // The SQL function and the route keep that rule.
    const sql = read('supabase/migrations/050_add_facebook_image_variants.sql');
    expect(sql).toMatch(/WHERE id = p_user_id AND total_generations_used \+ p_units <= p_limit/);
    expect(read('lib/rate-limit.ts')).toMatch(/rpc\('reserve_trial_usage'/);
    const route = read('lib/social/facebook-image-variants-route.ts');
    expect(route).toMatch(/reserveUnits: \(units\) => reserveTrialUnits\(user\.id/);
    expect(route.indexOf('checkRateLimit(')).toBeLessThan(route.indexOf('generateFacebookImageVariants('));
  });
});

test.describe('Preview and selection', () => {
  test('choose a variant, another one, then go back to the WordPress image', async () => {
    const db = memory();
    const { deps } = fakeDeps(db);
    const { variants } = await generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count: 2 }, deps);
    const store = db.store(USER);

    const { fetches } = await withoutNetwork(async () => {
      await selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId: variants[0].id }, { store });
    });
    expect(fetches).toEqual([]);
    expect(db.drafts.get(DRAFT)).toMatchObject({
      image_url: variants[0].image_url,
      selected_image_variant_id: variants[0].id,
      source_image_url: WP_IMAGE,
    });
    expect(wordpressImageOf(db.drafts.get(DRAFT)!)).toEqual({ url: WP_IMAGE, alt: 'Crochet scarves' });

    await selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId: variants[1].id }, { store });
    expect(db.drafts.get(DRAFT)).toMatchObject({ image_url: variants[1].image_url, source_image_url: WP_IMAGE });

    await selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId: null }, { store });
    expect(db.drafts.get(DRAFT)).toMatchObject({ image_url: WP_IMAGE, image_alt: 'Crochet scarves', selected_image_variant_id: null, source_image_url: WP_IMAGE });
  });

  test('a draft created after the migration (source not filled yet) keeps its WordPress image on the first switch', async () => {
    const db = memory();
    db.drafts.set(DRAFT, draftRow({ source_image_url: null, source_image_alt: null }));
    const { deps } = fakeDeps(db);
    const { variants } = await generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count: 1 }, deps);
    await selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId: variants[0].id }, { store: db.store(USER) });
    expect(db.drafts.get(DRAFT)?.source_image_url).toBe(WP_IMAGE);
    await selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId: null }, { store: db.store(USER) });
    expect(db.drafts.get(DRAFT)?.image_url).toBe(WP_IMAGE);
  });

  test('a text-only draft can use a variant and go back to text only', async () => {
    const db = memory();
    db.drafts.set(DRAFT, draftRow({ image_url: null, image_alt: null, source_image_url: null, source_image_alt: null }));
    const { deps } = fakeDeps(db);
    const { variants } = await generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count: 1 }, deps);
    await selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId: variants[0].id }, { store: db.store(USER) });
    expect(db.drafts.get(DRAFT)?.image_url).toBe(variants[0].image_url);
    await selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId: null }, { store: db.store(USER) });
    expect(db.drafts.get(DRAFT)).toMatchObject({ image_url: null, selected_image_variant_id: null });
  });
});

test.describe('Access control', () => {
  test('a variant of another draft or of another user is refused; another user cannot change the draft', async () => {
    const db = memory();
    const { deps } = fakeDeps(db);
    const other = await generateFacebookImageVariants({ draft: db.drafts.get(OTHER_DRAFT)!, publication: null, count: 1 }, deps);
    const otherUserVariant: FacebookImageVariant = { ...other.variants[0], id: '88888888-8888-4888-8888-888888888888', user_id: OTHER, social_content_generation_id: DRAFT };
    db.variants.set(otherUserVariant.id, otherUserVariant);

    for (const variantId of [other.variants[0].id, otherUserVariant.id, '99999999-0000-4000-8000-000000000000']) {
      await expect(
        selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId }, { store: db.store(USER) })
      ).rejects.toMatchObject({ code: 'variant_not_found', status: 404 });
    }
    expect(db.drafts.get(DRAFT)?.image_url).toBe(WP_IMAGE);

    // The draft is loaded with the caller's user filter: another user gets null → not found, nothing generated.
    const { deps: otherDeps, calls, reservations } = fakeDeps(db);
    await expect(generateFacebookImageVariants({ draft: null, publication: null, count: 1 }, otherDeps)).rejects.toMatchObject({ code: 'not_found' });
    await expect(selectFacebookImage({ draft: null, publication: null, variantId: null }, { store: db.store(OTHER) })).rejects.toMatchObject({ code: 'not_found' });
    expect(calls).toHaveLength(0);
    expect(reservations).toEqual([]);
    // The other user's store can neither write a variant on this draft nor change it.
    expect(await db.store(OTHER).insertVariant({ ...other.variants[0], user_id: OTHER })).toBeNull();
    expect(await db.store(OTHER).updateDraftImage(DRAFT, { image_url: 'https://x.test/a.jpg', image_alt: null, selected_image_variant_id: null })).toBeNull();
    // A Medium row is not a Facebook draft.
    await expect(
      generateFacebookImageVariants({ draft: draftRow({ platform: 'medium' }), publication: null, count: 1 }, otherDeps)
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(facebookImageSelectionSchema.safeParse({ variantId: 'not-a-uuid' }).success).toBe(false);
    expect(facebookImageSelectionSchema.safeParse({ variantId: null }).success).toBe(true);
  });
});

test.describe('Locked once the post is engaged', () => {
  test('scheduled / publishing / published / partial: selection refused; generation allowed and never changes the post', async () => {
    for (const status of ['scheduled', 'publishing', 'published', 'partial'] as const) {
      const db = memory();
      const { deps, calls, reservations } = fakeDeps(db);
      expect(imageChangeLocked(publication(status))).toBe(true);
      // Selection: refused, nothing written.
      const variants = await generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: publication(status), count: 1 }, deps);
      for (const variantId of [null, variants.variants[0].id]) {
        await expect(
          selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: publication(status), variantId }, { store: db.store(USER) })
        ).rejects.toMatchObject({ code: 'image_locked', status: 409 });
      }
      // Generation (extension of TASK-101): allowed — new images for new posts; the post itself is untouched.
      expect(reservations).toEqual([1]);
      expect(calls).toHaveLength(1);
      expect(db.draftUpdates).toHaveLength(0);
      expect(db.drafts.get(DRAFT)).toMatchObject({ image_url: WP_IMAGE, selected_image_variant_id: null });
    }
    for (const status of ['failed', 'cancelled', 'unknown'] as const) expect(imageChangeLocked(publication(status))).toBe(false);
    expect(imageChangeLocked(null)).toBe(false);
  });
});

test.describe('The chosen image is the one sent', () => {
  async function draftWithVariant() {
    const db = memory();
    const { deps } = fakeDeps(db);
    const { variants } = await generateFacebookImageVariants({ draft: db.drafts.get(DRAFT)!, publication: null, count: 1 }, deps);
    await selectFacebookImage({ draft: db.drafts.get(DRAFT)!, publication: null, variantId: variants[0].id }, { store: db.store(USER) });
    return { draft: db.drafts.get(DRAFT)!, variant: variants[0] };
  }

  test('Publish now sends the selected variant (POST /photos url)', async () => {
    const { draft, variant } = await draftWithVariant();
    const graph = fakeGraph();
    const outcome = await publishFacebookContent({ generation: draft, connection: CONNECTION, pageToken: PAGE_TOKEN }, { graph: graph.client, store: publicationStore(), now: () => NOW });
    expect(outcome.publication).toMatchObject({ status: 'published', post_image_url: variant.image_url });
    expect(graph.photoUrl()).toBe(variant.image_url);
  });

  test('Schedule stores the selected variant and the scheduled run sends it; going back to WordPress before scheduling sends the WordPress image', async () => {
    const { draft, variant } = await draftWithVariant();
    const store = publicationStore();
    const row = await scheduleFacebookContent(
      { generation: draft, connection: CONNECTION, scheduledAt: new Date('2026-11-15T12:00:00Z'), timeZone: 'Europe/Paris' },
      { store, now: () => NOW }
    );
    expect(row.post_image_url).toBe(variant.image_url);
    const graph = fakeGraph();
    const outcome = await runClaimedScheduledPost({ ...row, status: 'publishing', locked_at: NOW.toISOString() }, PAGE_TOKEN, { graph: graph.client, store });
    expect(outcome.publication.status).toBe('published');
    expect(graph.photoUrl()).toBe(variant.image_url);

    const back = { ...draft, image_url: WP_IMAGE, image_alt: 'Crochet scarves', selected_image_variant_id: null };
    expect(publicationContent(back, CONNECTION).post_image_url).toBe(WP_IMAGE);
  });
});

test.describe('Storage, routes, migration and UI (source checks)', () => {
  test('a 2:3 provider image becomes a 4:5 JPEG under images/facebook/ (R2) or the user folder (Supabase)', async () => {
    const png = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#c08060' } }).png().toBuffer();
    for (const provider of ['r2', 'supabase'] as const) {
      const uploads: Array<{ key: string; contentType: string; body: Buffer }> = [];
      const storage = {
        provider,
        async upload(input: { key: string; body: Buffer; contentType: string }) {
          uploads.push(input);
          return { provider, key: input.key, publicUrl: `https://media.example.test/${input.key}` };
        },
      } as unknown as MediaStorage;
      const stored = await storeFacebookVariantImage(storage, { userId: USER, generationId: DRAFT, batchId: 'b1', position: 2, body: png });
      expect(stored).toMatchObject({ width: 1024, height: 1280 });
      expect(uploads[0].contentType).toBe('image/jpeg');
      expect((await sharp(uploads[0].body).metadata()).format).toBe('jpeg');
      expect(uploads[0].key).toBe(provider === 'r2' ? `images/facebook/${USER}/${DRAFT}/b1-2.jpg` : `${USER}/facebook/${DRAFT}/b1-2.jpg`);
    }
  });

  test('routes: auth, Zod, rate limit, ownership; no Meta, no WordPress, no social_publications write', () => {
    const handler = read('lib/social/facebook-image-variants-route.ts');
    expect(handler).toMatch(/auth\.getUser\(\)/);
    expect(handler).toMatch(/isValidUuid\(id\)/);
    expect(handler).toMatch(/facebookImageVariantsSchema\.safeParse/);
    expect(handler).toMatch(/facebookImageSelectionSchema\.safeParse/);
    expect(handler).toMatch(/getSocialContentGeneration\(supabase, user\.id, id\)/);
    expect(handler).toMatch(/supabaseVariantStore\(supabase, user\.id\)/);
    expect(handler).not.toMatch(/createFacebookGraph|graph-client|MetaGraphClient|loadPageToken|wordpress\/rest-client|supabasePublicationStore|from\('social_publications'\)/);
    expect(read('app/api/social/generations/[id]/image-variants/route.ts')).toMatch(/export async function POST/);
    expect(read('app/api/social/generations/[id]/image/route.ts')).toMatch(/export async function PATCH/);
    const queries = read('lib/queries/facebook-image-variants.ts');
    expect(queries).not.toMatch(/social_publications/);
    expect(queries.match(/\.eq\('user_id', userId\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(queries).toMatch(/\.eq\('platform', 'facebook'\)/);
    // The core logic never imports server or network modules.
    const core = read('lib/social/facebook-image-variants.ts');
    expect(core).not.toMatch(/^import (?!type)/m);
  });

  test('migration 050: variants table with RLS, source image kept, selected variant, atomic reservation; 049 left free', () => {
    expect(existsSync(join(ROOT, 'supabase/migrations/050_add_facebook_image_variants.sql'))).toBe(true);
    // SQL statements only (the rollback notes are comments).
    const migrations = read('supabase/migrations/050_add_facebook_image_variants.sql')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(migrations).toMatch(/CREATE TABLE social_content_image_variants/);
    expect(migrations).toMatch(/social_content_generation_id\s+uuid NOT NULL REFERENCES social_content_generations\(id\) ON DELETE CASCADE/);
    expect(migrations).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migrations).toMatch(/g\.user_id = auth\.uid\(\) AND g\.platform = 'facebook'/);
    expect(migrations).toMatch(/GRANT SELECT, INSERT, DELETE ON public\.social_content_image_variants TO authenticated/);
    expect(migrations).toMatch(/ADD COLUMN source_image_url text/);
    expect(migrations).toMatch(/SET source_image_url = image_url, source_image_alt = image_alt\s+WHERE platform = 'facebook' AND source_image_url IS NULL/);
    expect(migrations).toMatch(/ADD COLUMN selected_image_variant_id uuid REFERENCES social_content_image_variants\(id\) ON DELETE SET NULL/);
    expect(migrations).not.toMatch(/SET image_url/); // the current image of old drafts is never rewritten
    expect(migrations).toMatch(/CREATE OR REPLACE FUNCTION reserve_trial_usage/);
    expect(migrations).not.toMatch(/social_publications/);
    expect(read('docs/DATABASE.md')).toMatch(/social_content_image_variants/);
    const numbers = readdirSync(join(ROOT, 'supabase/migrations')).map((file) => file.slice(0, 3));
    expect(numbers).not.toContain('049'); // reserved for TASK-078 Phase B
  });

  test('UI: Generate image variants (1-3), calls shown before confirmation, preview, back to the WordPress image', () => {
    const ui = read('components/social/facebook-image-variants.tsx');
    for (const label of ['Generate image variants', 'How many images?', 'image generation call', 'WordPress image (default)', 'Use this image', 'does not change the post image']) {
      expect(ui, label).toContain(label);
    }
    expect(ui).toMatch(/FACEBOOK_IMAGE_VARIANT_MAX/);
    expect(ui).toMatch(/disabled=\{locked \|\| busy !== null\}/);
    expect(FACEBOOK_VARIANT_ANGLES).toHaveLength(3);
    expect(buildVariantPrompt({ title: 'T', content: 'C' }, FACEBOOK_VARIANT_ANGLES[0])).toMatch(/4:5/);
    const workspace = read('components/social/facebook-post-workspace.tsx');
    expect(workspace).toMatch(/<FacebookImageVariants item=\{item\}/);
    expect(workspace).toMatch(/locked=\{imageChangeLocked\(publication\)\}/);
  });
});
