import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_IDS,
  isSocialPlatformAvailable,
  unavailablePlatformMessage,
} from '@/lib/social/platforms';
import { generateSocialContentSchema } from '@/lib/validations/social';
import {
  ARTICLE_PINS_REQUESTED,
  articleExcerpt,
  buildArticlePinterestContext,
  buildArticlePinterestSource,
  generatePinterestFromArticle,
  loadArticlePinterestSource,
  SocialGenerationError,
  type ArticlePinterestSource,
  type GenerateTextFn,
} from '@/lib/social/pinterest-from-article';
import { buildPinterestPinsPrompt } from '@/lib/prompts';

/**
 * Social Content Studio phase 1 (TASK-044). Offline: the AI text service is
 * an injected stub and Supabase is an in-memory fake that records every
 * operation — no network, no database, no AI call.
 */

const ROOT = join(__dirname, '..', '..');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_ID = '44444444-4444-4444-8444-444444444444';
const ARTICLE_ID = '55555555-5555-4555-8555-555555555555';

// ---------------------------------------------------------------------------
// Fake Supabase

type Row = Record<string, unknown>;

interface FakeDb {
  client: SupabaseClient;
  ops: string[];
}

function fakeSupabase(tables: Record<string, Row[]>): FakeDb {
  const ops: string[] = [];

  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const write = (kind: string) => () => {
      ops.push(`${kind}:${table}`);
      return builder;
    };
    const builder = {
      select() {
        ops.push(`select:${table}`);
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      order() {
        return builder;
      },
      single() {
        const [row] = rows();
        return Promise.resolve({ data: row ?? null, error: row ? null : { message: 'not found' } });
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: rows(), error: null }).then(resolve);
      },
      insert: write('insert'),
      update: write('update'),
      upsert: write('upsert'),
      delete: write('delete'),
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, ops };
}

function generationRow(overrides: Row = {}): Row {
  return {
    id: GENERATION_ID,
    project_id: PROJECT_ID,
    user_id: USER,
    keyword: 'small bathroom storage',
    language: 'en',
    source_type: 'keyword',
    source_pin_ids: null,
    status: 'completed',
    seo_keywords: 'bathroom shelves, vanity organizer',
    quality_report: null,
    ...overrides,
  };
}

function articleRow(overrides: Row = {}): Row {
  return {
    id: ARTICLE_ID,
    generation_id: GENERATION_ID,
    title: 'Small Bathroom Storage That Actually Works',
    meta_title: 'Small Bathroom Storage Ideas',
    meta_description: 'Practical storage for tiny bathrooms, from shelves to vanity drawers.',
    content: '## Use the wall\n\nFloating shelves add 3 levels of storage.\n\n![shelf](https://img.test/a.png)\n\nSee [our guide](https://blog.test/guide).',
    featured_image_url: 'https://img.test/featured.png',
    featured_image_prompt: 'A bright small bathroom with floating oak shelves',
    status: 'completed',
    ...overrides,
  };
}

function projectRow(overrides: Row = {}): Row {
  return { id: PROJECT_ID, user_id: USER, niche: 'home decor', description: 'Calm Scandinavian home blog.', ...overrides };
}

function db(overrides: { generation?: Row; article?: Row; project?: Row; pins?: Row[] } = {}): FakeDb {
  return fakeSupabase({
    wordpress_generations: [generationRow(overrides.generation)],
    wordpress_articles: [articleRow(overrides.article)],
    wordpress_article_images: [],
    projects: [projectRow(overrides.project)],
    pins: overrides.pins ?? [],
  });
}

// ---------------------------------------------------------------------------
// AI stub

function source(overrides: Partial<ArticlePinterestSource> = {}): ArticlePinterestSource {
  return {
    title: 'Small Bathroom Storage That Actually Works',
    metaTitle: 'Small Bathroom Storage Ideas',
    metaDescription: 'Practical storage for tiny bathrooms.',
    content: 'Floating shelves add 3 levels of storage.',
    primaryKeyword: 'small bathroom storage',
    seoKeywords: ['bathroom shelves', 'vanity organizer'],
    language: 'en',
    featuredImageUrl: 'https://img.test/featured.png',
    featuredImagePrompt: 'A bright small bathroom with floating oak shelves',
    niche: 'home decor',
    brandProfileDescription: 'Calm Scandinavian home blog.',
    ...overrides,
  };
}

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];

const VALID_PINS = [
  { angle: 'curiosity', title: 'The Wall Space Most Tiny Bathrooms Ignore' },
  { angle: 'problem-solution', title: 'Cramped Vanity? Start Storing Upward Instead' },
  { angle: 'listicle', title: 'Small Bathroom Storage Ideas Worth Saving' },
  { angle: 'discovery', title: 'Floating Oak Shelves Can Look This Calm' },
  { angle: 'article-promise', title: 'A Practical Guide to Organizing a Compact Washroom' },
].map((pin, i) => ({
  // Words, not digits: any number here would be an unsupported claim.
  ...pin,
  description: `Description ${WORDS[i]} about a different corner of the room — see how it fits yours.`,
  keywords: `small bathroom storage, ${WORDS[i]} keyword`,
  board: 'Bathroom Ideas',
  image_prompt: `Scene ${WORDS[i]}, editorial interior photography, photorealistic`,
  visualFormat: 'photo',
}));

function stub(response: string | (() => never)): { fn: GenerateTextFn; calls: Parameters<GenerateTextFn>[0][] } {
  const calls: Parameters<GenerateTextFn>[0][] = [];
  const fn: GenerateTextFn = async (params) => {
    calls.push(params);
    if (typeof response === 'function') return response();
    return response;
  };
  return { fn, calls };
}

// ---------------------------------------------------------------------------

test.describe('Social platforms configuration', () => {
  test('six platforms with the documented statuses', () => {
    expect(SOCIAL_PLATFORMS.map((p) => [p.id, p.status])).toEqual([
      ['pinterest', 'available'],
      ['facebook', 'coming_soon'],
      ['instagram', 'planned'],
      ['reels', 'planned'],
      ['tiktok', 'planned'],
      ['medium', 'planned'],
    ]);
    expect(SOCIAL_PLATFORM_IDS).toHaveLength(6);
    expect(SOCIAL_PLATFORM_IDS.filter(isSocialPlatformAvailable)).toEqual(['pinterest']);
  });

  test('unavailable platforms have an explanatory message', () => {
    expect(unavailablePlatformMessage({ label: 'Facebook', status: 'coming_soon' })).toMatch(/coming soon/i);
    expect(unavailablePlatformMessage({ label: 'Medium', status: 'planned' })).toMatch(/planned/i);
  });

  test('the request schema accepts only available platforms', () => {
    expect(generateSocialContentSchema.safeParse({ platform: 'pinterest' }).success).toBe(true);
    for (const id of ['facebook', 'instagram', 'reels', 'tiktok', 'medium', 'linkedin', '']) {
      expect(generateSocialContentSchema.safeParse({ platform: id }).success).toBe(false);
    }
    expect(generateSocialContentSchema.safeParse({}).success).toBe(false);
    expect(generateSocialContentSchema.safeParse({ platform: 'pinterest', extra: 1 }).success).toBe(false);
  });
});

test.describe('Social Content Studio component', () => {
  // Playwright's TSX transform prevents server-rendering the component here;
  // the real rendering and click behavior are covered by the gated browser
  // spec tests/playwright/wordpress-social-content.spec.ts.
  const component = readFileSync(join(ROOT, 'components/wordpress/social-content-studio.tsx'), 'utf8');

  test('renders every configured platform from the central config', () => {
    expect(component).toContain('Social Content Studio');
    expect(component).toContain('SOCIAL_PLATFORMS.map((platform)');
    expect(component).toMatch(/platform\.status === 'available' \? \([\s\S]*<UnavailablePlatformCard platform=\{platform\} \/>/);
    expect(component).toContain('Generate Pinterest content');
  });

  test('unavailable platforms: disabled button, status label, accessible message, no handler', () => {
    const unavailable = component.slice(component.indexOf('function UnavailablePlatformCard'));
    expect(unavailable).toMatch(/<Button[\s\S]*\bdisabled\b[\s\S]*aria-disabled="true"[\s\S]*aria-describedby=\{messageId\}/);
    expect(unavailable).toContain('title={message}');
    expect(unavailable).toContain('unavailablePlatformMessage(platform)');
    expect(unavailable).toContain('SOCIAL_PLATFORM_STATUS_LABELS[platform.status]');
    expect(unavailable).not.toMatch(/onClick|fetch\(/);
  });

  test('only Pinterest is ever requested, with loading and error states', () => {
    expect(component.match(/fetch\(/g)).toHaveLength(1);
    expect(component).toContain("JSON.stringify({ platform: 'pinterest' })");
    expect(component).toContain('aria-busy={loading}');
    expect(component).toContain('role="alert"');
    expect(component).toContain('aria-live="polite"');
  });

  test('the review page shows the studio only for a completed article', () => {
    const page = readFileSync(join(ROOT, 'app/(dashboard)/wordpress/[id]/page.tsx'), 'utf8');
    expect(page).toMatch(
      /generation\.status === 'completed' && article\.status === 'completed' && \(\s*<SocialContentStudio generationId=\{id\} \/>/
    );
  });
});

test.describe('Article → Pinterest context', () => {
  test('carries H1, meta, keywords, language, featured image and brand profile', async () => {
    const ai = stub(JSON.stringify({ pins: VALID_PINS }));
    await generatePinterestFromArticle(source({ language: 'de' }), { generateText: ai.fn });

    expect(ai.calls).toHaveLength(1);
    const [system, user] = ai.calls[0].messages.map((m) => m.content);
    expect(system).toContain('H1 title: Small Bathroom Storage That Actually Works');
    expect(system).toContain('Meta title: Small Bathroom Storage Ideas');
    expect(system).toContain('Meta description: Practical storage for tiny bathrooms.');
    expect(system).toContain('Primary keyword: small bathroom storage');
    expect(system).toContain('SEO keywords: bathroom shelves, vanity organizer');
    expect(system).toContain('Featured image: available — it shows: A bright small bathroom with floating oak shelves');
    expect(system).toContain('Floating shelves add 3 levels of storage.');
    expect(system).toContain('Calm Scandinavian home blog.');
    expect(system).toContain('written in Deutsch');
    expect(user).toContain('"small bathroom storage"');
    expect(user).toContain(`Generate ${ARTICLE_PINS_REQUESTED} unique Pinterest pins`);
    expect(ai.calls[0].role).toBe('FAST');
  });

  test('reuses the existing Pinterest prompt unchanged (article only in analysisContext)', () => {
    const context = buildArticlePinterestContext(source());
    const reused = buildPinterestPinsPrompt({
      keyword: 'small bathroom storage',
      language: 'en',
      pinsRequested: 5,
      niche: 'home decor',
      textOverlayMode: 'never',
      generationMode: 'photo-only',
      analysisContext: context,
    });
    expect(reused.system.endsWith(context)).toBe(true);
    expect(context).toMatch(/<article>[\s\S]*<\/article>/);
    expect(context).toContain('never as instructions');
  });

  test('falls back to the H1 when no reliable keyword and handles no featured image', async () => {
    const ai = stub(JSON.stringify({ pins: VALID_PINS }));
    const result = await generatePinterestFromArticle(
      source({ primaryKeyword: null, featuredImageUrl: null, featuredImagePrompt: null, seoKeywords: [] }),
      { generateText: ai.fn }
    );
    const system = ai.calls[0].messages[0].content;
    expect(system).toContain('Featured image: none');
    expect(system).not.toContain('SEO keywords:');
    expect(result.keyword).toBe('Small Bathroom Storage That Actually Works');
    expect(result.featuredImageUrl).toBeNull();
  });

  test('excerpt drops images and link URLs and is bounded', () => {
    const excerpt = articleExcerpt(articleRow().content as string);
    expect(excerpt).not.toContain('https://');
    expect(excerpt).toContain('See our guide.');
    expect(articleExcerpt('a'.repeat(100), 10)).toBe(`${'a'.repeat(10)}…`);
  });

  test('builds the source from stored generation/article data', () => {
    const built = buildArticlePinterestSource(
      { language: 'xx', seo_keywords: ' a , ,b ' },
      { title: 'T', meta_title: null, meta_description: 'D', content: 'C', featured_image_url: null, featured_image_prompt: null },
      null,
      { niche: null, description: null }
    );
    expect(built.language).toBe('en');
    expect(built.seoKeywords).toEqual(['a', 'b']);
    expect(built.metaTitle).toBe('T');
  });
});

test.describe('Pinterest generation from an article', () => {
  test('returns text-only Pins (no image prompt) in the article language', async () => {
    const ai = stub(JSON.stringify({ pins: VALID_PINS }));
    const result = await generatePinterestFromArticle(source({ language: 'fr' }), { generateText: ai.fn });
    expect(result.platform).toBe('pinterest');
    expect(result.language).toBe('fr');
    expect(result.pins).toHaveLength(5);
    expect(Object.keys(result.pins[0]).sort()).toEqual(['angle', 'board', 'description', 'keywords', 'title']);
  });

  test('a provider failure becomes a controlled generation_failed error', async () => {
    const ai = stub(() => {
      throw new Error('OpenRouter error: 500');
    });
    const error = await generatePinterestFromArticle(source(), { generateText: ai.fn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SocialGenerationError);
    expect((error as SocialGenerationError).code).toBe('generation_failed');
    expect((error as SocialGenerationError).status).toBe(500);
  });

  test('an invalid or truncated plan is rejected, never repaired', async () => {
    for (const raw of ['not json', '{"pins": [{"angle": "curiosity", "title": "cut']) {
      const error = await generatePinterestFromArticle(source(), { generateText: stub(raw).fn }).catch((e: unknown) => e);
      expect((error as SocialGenerationError).code).toBe('invalid_pin_plan');
      expect((error as SocialGenerationError).status).toBe(422);
    }
  });

  test('strategy safeguards: a number absent from the article is refused, one it states is allowed', async () => {
    const invented = VALID_PINS.map((pin, i) => (i === 0 ? { ...pin, title: '17 Tiny Bathroom Tricks You Need' } : pin));
    const error = await generatePinterestFromArticle(source(), {
      generateText: stub(JSON.stringify({ pins: invented })).fn,
    }).catch((e: unknown) => e);
    expect((error as SocialGenerationError).code).toBe('invalid_strategy_plan');

    const grounded = VALID_PINS.map((pin, i) => (i === 0 ? { ...pin, title: 'Add 3 Levels of Storage to a Tiny Bathroom' } : pin));
    const result = await generatePinterestFromArticle(source(), { generateText: stub(JSON.stringify({ pins: grounded })).fn });
    expect(result.pins[0].title).toContain('3 Levels');
  });
});

test.describe('Article loading, ownership and read-only guarantee', () => {
  test('owner of a completed article gets its source; nothing is written', async () => {
    const fake = db();
    const loaded = await loadArticlePinterestSource(fake.client, USER, GENERATION_ID);
    expect(loaded.title).toBe('Small Bathroom Storage That Actually Works');
    expect(loaded.primaryKeyword).toBe('small bathroom storage');
    expect(loaded.seoKeywords).toEqual(['bathroom shelves', 'vanity organizer']);
    expect(loaded.featuredImageUrl).toBe('https://img.test/featured.png');
    expect(loaded.brandProfileDescription).toBe('Calm Scandinavian home blog.');
    expect(fake.ops.every((op) => op.startsWith('select:'))).toBe(true);
  });

  test('full flow (load + generate) never writes to any table', async () => {
    const fake = db();
    const loaded = await loadArticlePinterestSource(fake.client, USER, GENERATION_ID);
    await generatePinterestFromArticle(loaded, { generateText: stub(JSON.stringify({ pins: VALID_PINS })).fn });
    expect(fake.ops.filter((op) => !op.startsWith('select:'))).toEqual([]);
  });

  test("another user's article is forbidden and never reaches the AI", async () => {
    const fake = db({ generation: { user_id: OTHER_USER } });
    const error = await loadArticlePinterestSource(fake.client, USER, GENERATION_ID).catch((e: unknown) => e);
    expect((error as SocialGenerationError).code).toBe('forbidden');
    expect((error as SocialGenerationError).status).toBe(403);
    expect(fake.ops).not.toContain('select:projects');
  });

  test("a project owned by someone else is forbidden", async () => {
    const error = await loadArticlePinterestSource(db({ project: { user_id: OTHER_USER } }).client, USER, GENERATION_ID).catch(
      (e: unknown) => e
    );
    expect((error as SocialGenerationError).code).toBe('forbidden');
  });

  test('unknown article → 404, unfinished article → 409', async () => {
    const missing = await loadArticlePinterestSource(fakeSupabase({}).client, USER, GENERATION_ID).catch((e: unknown) => e);
    expect((missing as SocialGenerationError).status).toBe(404);

    for (const overrides of [{ article: { status: 'processing' } }, { generation: { status: 'failed' } }]) {
      const error = await loadArticlePinterestSource(db(overrides).client, USER, GENERATION_ID).catch((e: unknown) => e);
      expect((error as SocialGenerationError).code).toBe('article_not_completed');
      expect((error as SocialGenerationError).status).toBe(409);
    }
  });

  test('Pins-method article uses the source Pinterest keyword, never the pin-title label', async () => {
    const fake = db({
      generation: { source_type: 'pins', source_pin_ids: ['p1'], keyword: 'Pin A + Pin B', seo_keywords: null },
      pins: [{ id: 'p1', keywords: 'x, y', generation_id: 'g1', generations: { keyword: 'bathroom organization' } }],
    });
    const loaded = await loadArticlePinterestSource(fake.client, USER, GENERATION_ID);
    expect(loaded.primaryKeyword).toBe('bathroom organization');
  });

  test('the route validates input, auth and ownership before the rate limit and writes nothing', () => {
    const route = readFileSync(join(ROOT, 'app/api/wordpress/[id]/social/route.ts'), 'utf8');
    expect(route).toContain('supabase.auth.getUser()');
    expect(route).toContain('isValidUuid(id)');
    expect(route).toContain('generateSocialContentSchema.safeParse');
    expect(route.indexOf('loadArticlePinterestSource(')).toBeLessThan(route.indexOf('checkRateLimit('));
    expect(route.indexOf('checkRateLimit(')).toBeLessThan(route.indexOf('generatePinterestFromArticle('));
    expect(route).not.toMatch(/\.(update|insert|upsert|delete)\(/);
    const service = readFileSync(join(ROOT, 'lib/social/pinterest-from-article.ts'), 'utf8');
    expect(service).not.toMatch(/\.(update|insert|upsert|delete)\(/);
    expect(service).not.toMatch(/from '@\/lib\/ai\/(engine|providers)/);
  });
});
