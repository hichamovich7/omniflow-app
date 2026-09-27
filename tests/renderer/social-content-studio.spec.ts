import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_IDS,
  isSocialPlatformAvailable,
  unavailablePlatformMessage,
} from '@/lib/social/platforms';
import {
  ARTICLE_PINS_DEFAULT,
  articleExcerpt,
  buildArticlePinterestContext,
  buildArticlePinterestSource,
  containsUrl,
  loadArticlePinterestSource,
  regenerateArticlePin,
  SocialGenerationError,
  stripUrls,
  suggestBoardForArticle,
  validateDistinctAngles,
  withoutUrls,
  type ArticlePinterestSource,
  type GenerateTextFn,
  type RegeneratePinSource,
} from '@/lib/social/pinterest-from-article';
import { ANGLE_LABELS, NO_LINK_NOTICE, articlePinterestCreateHref, pinAsText } from '@/lib/social/pin-display';
import { prepareArticlePinRegeneration, regenerateAndSavePin, updatePinText } from '@/lib/pinterest/pin-text';
import { findOrCreateBoardIds } from '@/lib/queries/boards';
import {
  ARTICLE_SOURCE_NO_URL_MESSAGE,
  generatePinsSchema,
  regeneratePinSchema,
  updatePinTextSchema,
} from '@/lib/validations/pinterest';
import { generatePinterestCsv } from '@/lib/csv/pinterest';
import { buildPinterestPinsPrompt } from '@/lib/prompts';
import { attachPinterestStrategyMetadata, readPinterestStrategyAngle } from '@/lib/pinterest/strategy';
import { attachAiIntegratedMetadata, readAiIntegratedMetadata } from '@/lib/pinterest/ai-integrated';
import { PINS_OPTIONS } from '@/types/pinterest';
import type { Pin } from '@/types/database';

/**
 * Social Content Studio (TASK-044 phases 1-2): Pinterest from a WordPress
 * article through the existing Pinterest generator. Offline: the AI text
 * service is an injected stub and Supabase is an in-memory fake that records
 * every operation and payload — no network, no database, no AI call.
 */

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const ARTICLE_GEN_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_ID = '44444444-4444-4444-8444-444444444444';
const ARTICLE_ID = '55555555-5555-4555-8555-555555555555';
const PIN_GEN_ID = '66666666-6666-4666-8666-666666666666';
const PIN_ID = '77777777-7777-4777-8777-777777777777';
const PIN_ID_2 = '88888888-8888-4888-8888-888888888888';
const OTHER_PROJECT = '99999999-9999-4999-8999-999999999999';

const PERMALINK = 'https://blog.test/small-bathroom-storage';

// ---------------------------------------------------------------------------
// Fake Supabase

type Row = Record<string, unknown>;

interface Write {
  kind: 'insert' | 'update' | 'upsert' | 'delete';
  table: string;
  payload: unknown;
}

interface FakeDb {
  client: SupabaseClient;
  ops: string[];
  writes: Write[];
}

function fakeSupabase(tables: Record<string, Row[]>): FakeDb {
  const ops: string[] = [];
  const writes: Write[] = [];

  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let pendingUpdate: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const applyUpdate = () => {
      if (!pendingUpdate) return;
      for (const row of rows()) Object.assign(row, pendingUpdate);
      pendingUpdate = null;
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
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] !== value);
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
        applyUpdate();
        const [row] = rows();
        return Promise.resolve({ data: row ?? null, error: row ? null : { message: 'not found' } });
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        applyUpdate();
        return Promise.resolve({ data: rows(), error: null }).then(resolve);
      },
      insert(payload: unknown) {
        ops.push(`insert:${table}`);
        writes.push({ kind: 'insert', table, payload });
        const inserted = (Array.isArray(payload) ? payload : [payload]).map((row, i) => ({ id: `new-${i}`, ...(row as Row) }));
        tables[table] = [...(tables[table] ?? []), ...inserted];
        return { select: () => Promise.resolve({ data: inserted, error: null }) };
      },
      update(payload: Row) {
        ops.push(`update:${table}`);
        writes.push({ kind: 'update', table, payload });
        pendingUpdate = payload;
        return builder;
      },
      upsert(payload: unknown) {
        ops.push(`upsert:${table}`);
        writes.push({ kind: 'upsert', table, payload });
        return builder;
      },
      delete() {
        ops.push(`delete:${table}`);
        writes.push({ kind: 'delete', table, payload: null });
        return builder;
      },
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, ops, writes };
}

function articleGenerationRow(overrides: Row = {}): Row {
  return {
    id: ARTICLE_GEN_ID,
    project_id: PROJECT_ID,
    user_id: USER,
    keyword: 'small bathroom storage',
    language: 'en',
    source_type: 'keyword',
    source_pin_ids: null,
    source_url: PERMALINK,
    status: 'completed',
    seo_keywords: 'bathroom shelves, vanity organizer',
    quality_report: null,
    ...overrides,
  };
}

function articleRow(overrides: Row = {}): Row {
  return {
    id: ARTICLE_ID,
    generation_id: ARTICLE_GEN_ID,
    title: 'Small Bathroom Storage That Actually Works',
    slug: 'small-bathroom-storage',
    meta_title: 'Small Bathroom Storage Ideas',
    meta_description: 'Practical storage for tiny bathrooms, from shelves to vanity drawers.',
    content:
      '## Use the wall\n\nFloating shelves add 3 levels of storage.\n\n![shelf](https://img.test/a.png)\n\n' +
      `See [our guide](https://blog.test/guide) or visit ${PERMALINK} and www.blog.test for more.`,
    featured_image_url: 'https://img.test/featured.png',
    featured_image_prompt: 'A bright small bathroom with floating oak shelves',
    status: 'completed',
    ...overrides,
  };
}

function projectRow(overrides: Row = {}): Row {
  return { id: PROJECT_ID, user_id: USER, niche: 'home decor', description: 'Calm Scandinavian home blog.', ...overrides };
}

function pinRow(overrides: Partial<Pin> = {}): Pin {
  return {
    id: PIN_ID,
    generation_id: PIN_GEN_ID,
    language: 'en',
    title: 'The Wall Space Most Tiny Bathrooms Ignore',
    description: 'Description alpha about the wall.',
    keywords: 'small bathroom storage, alpha keyword',
    board: 'Bathroom Ideas',
    board_id: 'board-1',
    board_section: 'Storage',
    image_prompt: 'Scene alpha, editorial interior photography',
    image_analysis: attachPinterestStrategyMetadata(null, 'curiosity'),
    media_url: 'https://img.test/pin.png',
    link_url: null,
    publish_date: null,
    visual_format: 'photo-only',
    overlay_text: null,
    title_banner_template: null,
    cta_banner_template: null,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
    ...overrides,
  };
}

function pinGenerationRow(overrides: Row = {}): Row {
  return {
    id: PIN_GEN_ID,
    user_id: USER,
    project_id: PROJECT_ID,
    keyword: 'small bathroom storage',
    language: 'en',
    status: 'completed',
    ...overrides,
  };
}

function db(
  overrides: { generation?: Row; article?: Row; project?: Row; pins?: Row[]; pinGeneration?: Row; boards?: Row[] } = {}
): FakeDb {
  return fakeSupabase({
    wordpress_generations: [articleGenerationRow(overrides.generation)],
    wordpress_articles: [articleRow(overrides.article)],
    wordpress_article_images: [],
    projects: [projectRow(overrides.project)],
    pins: overrides.pins ?? [
      pinRow() as unknown as Row,
      pinRow({ id: PIN_ID_2, title: 'Cramped Vanity? Start Storing Upward Instead' }) as unknown as Row,
    ],
    generations: [pinGenerationRow(overrides.pinGeneration)],
    boards: overrides.boards ?? [],
  });
}

// ---------------------------------------------------------------------------
// AI stub

function source(overrides: Partial<ArticlePinterestSource> = {}): ArticlePinterestSource {
  return {
    articleId: ARTICLE_GEN_ID,
    projectId: PROJECT_ID,
    title: 'Small Bathroom Storage That Actually Works',
    metaTitle: 'Small Bathroom Storage Ideas',
    metaDescription: 'Practical storage for tiny bathrooms.',
    content: `Floating shelves add 3 levels of storage. Read more at ${PERMALINK}.`,
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

function plannedPin(overrides: Row = {}): Row {
  return {
    angle: 'curiosity',
    title: 'Why Floating Shelves Change a Tiny Bathroom',
    description: 'A calm look at wall storage for compact rooms — save it for your next refresh.',
    keywords: 'small bathroom storage, floating shelves',
    board: 'Bathroom Ideas',
    image_prompt: 'A compact bathroom with oak shelves, editorial interior photography, photorealistic',
    visualFormat: 'photo',
    ...overrides,
  };
}

function stub(response: string | (() => never)): { fn: GenerateTextFn; calls: Parameters<GenerateTextFn>[0][] } {
  const calls: Parameters<GenerateTextFn>[0][] = [];
  const fn: GenerateTextFn = async (params) => {
    calls.push(params);
    if (typeof response === 'function') return response();
    return response;
  };
  return { fn, calls };
}

const plan = (...pins: Row[]) => JSON.stringify({ pins });

function regenerationParams(pin: RegeneratePinSource = pinRow()) {
  return {
    pin,
    siblingTitles: ['Cramped Vanity? Start Storing Upward Instead'],
    keyword: 'small bathroom storage',
    language: 'en' as const,
    source: source(),
  };
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
});

test.describe('Social Content Studio on /wordpress/[id]', () => {
  // Playwright's TSX transform prevents server-rendering the component here;
  // the real rendering and click behavior are covered by the gated browser
  // spec tests/playwright/wordpress-social-content.spec.ts.
  const component = read('components/wordpress/social-content-studio.tsx');

  test('Pinterest redirects to the pre-filled Pinterest page, nothing is generated here', () => {
    expect(component).toContain('Generate Pinterest content');
    expect(component).toContain('href={articlePinterestCreateHref(generationId)}');
    expect(component).not.toMatch(/fetch\(|useState|onClick=/);
    expect(articlePinterestCreateHref(ARTICLE_GEN_ID)).toBe(`/pinterest/create?source=wordpress&articleId=${ARTICLE_GEN_ID}`);
    expect(articlePinterestCreateHref(ARTICLE_GEN_ID, PIN_GEN_ID)).toBe(
      `/pinterest/create?source=wordpress&articleId=${ARTICLE_GEN_ID}&generationId=${PIN_GEN_ID}`
    );
  });

  test('unavailable platforms: disabled button, status label, accessible message, no handler', () => {
    expect(component).toMatch(/platform\.status === 'available' \? \([\s\S]*<UnavailablePlatformCard platform=\{platform\} \/>/);
    const unavailable = component.slice(component.indexOf('function UnavailablePlatformCard'));
    expect(unavailable).toMatch(/<Button[\s\S]*\bdisabled\b[\s\S]*aria-disabled="true"[\s\S]*aria-describedby=\{messageId\}/);
    expect(unavailable).toContain('title={message}');
    expect(unavailable).toContain('unavailablePlatformMessage(platform)');
    expect(unavailable).not.toMatch(/onClick|fetch\(|href=/);
  });

  test('the review page shows the studio only for a completed article', () => {
    const page = read('app/(dashboard)/wordpress/[id]/page.tsx');
    expect(page).toMatch(
      /generation\.status === 'completed' && article\.status === 'completed' && \(\s*<SocialContentStudio generationId=\{id\} \/>/
    );
  });

  test('the phase 1 parallel generator endpoint is gone', () => {
    expect(existsSync(join(ROOT, 'app/api/wordpress/[id]/social/route.ts'))).toBe(false);
    expect(existsSync(join(ROOT, 'lib/validations/social.ts'))).toBe(false);
  });
});

test.describe('/pinterest/create page', () => {
  const page = read('app/(dashboard)/pinterest/create/page.tsx');
  const form = read('components/pinterest/pin-form.tsx');

  test('requires source=wordpress and a valid article id, then checks ownership and completion', () => {
    expect(page).toContain("source !== 'wordpress' || !articleId || !isValidUuid(articleId)");
    expect(page).toContain("redirect('/pinterest')");
    expect(page.indexOf('loadArticlePinterestSource(supabase, user.id, articleId)')).toBeGreaterThan(-1);
    expect(page).toContain('err instanceof SocialGenerationError');
    expect(page).toContain("This article can't be used");
  });

  test('no AI call on load; boards and Content Streams are the project\'s real ones', () => {
    expect(page).not.toMatch(/generateText|lib\/ai\/engine|fetch\(/);
    expect(page).toMatch(/from\('boards'\)[\s\S]*\.eq\('project_id', article\.projectId\)/);
    expect(page).toMatch(/from\('content_streams'\)[\s\S]*content_stream_boards\(board_id\)/);
    expect(page).toContain('suggestBoardForArticle(boardList, article)');
  });

  test('shows a saved generation only when owned and from the article project', () => {
    expect(page).toContain(
      'loaded.generation.user_id === user.id && loaded.generation.project_id === article.projectId'
    );
    expect(page).toContain('<ArticlePinResults');
  });

  test('the form is the existing PinForm, pre-filled, with no destination URL field', () => {
    expect(page).toContain('<PinForm');
    expect(form).toContain("articleSource?.primaryKeyword ?? searchParams.get('keyword')");
    expect(form).toContain('articleSource?.language ??');
    expect(form).toContain('useState<PinsOption>(articleSource ? 5 : 10)');
    expect(form).toContain('wordpressArticleId: articleSource?.articleId');
    expect(form).toContain("const websiteUrl = articleSource ? undefined");
    expect(form).toContain("const pinterestUrl = articleSource ? undefined");
    expect(form).toContain("const analysisId = articleSource ? undefined");
    expect(form).not.toMatch(/<Label[^>]*>\s*Destination URL|id="(website|destination)-url"/i);
    expect(read('components/social/article-board-picker.tsx')).not.toMatch(/Combobox|<Input/);
    expect(form).toContain('articlePinterestCreateHref(articleSource.articleId, json.data.generationId)');
  });
});

test.describe('Request schema (POST /api/pinterest/generate)', () => {
  const base = {
    projectId: PROJECT_ID,
    keyword: 'small bathroom storage',
    language: 'en',
    pinsRequested: 5,
    generationMode: 'photo-only',
    wordpressArticleId: ARTICLE_GEN_ID,
  };

  test('accepts an article source with every existing Pin count, up to the generator maximum', () => {
    for (const pinsRequested of PINS_OPTIONS) {
      expect(generatePinsSchema.safeParse({ ...base, pinsRequested }).success).toBe(true);
    }
    expect(Math.max(...PINS_OPTIONS)).toBe(30);
    expect(generatePinsSchema.safeParse({ ...base, pinsRequested: 31 }).success).toBe(false);
    expect(generatePinsSchema.safeParse({ ...base, pinsRequested: 2 }).success).toBe(false);
    expect(ARTICLE_PINS_DEFAULT).toBe(5);
  });

  test('never accepts a destination URL or an analysis alongside the article', () => {
    for (const extra of [{ websiteUrl: PERMALINK }, { pinterestUrl: 'https://pinterest.com/pin/1' }]) {
      const parsed = generatePinsSchema.safeParse({ ...base, ...extra });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0].message).toBe(ARTICLE_SOURCE_NO_URL_MESSAGE);
    }
    expect(generatePinsSchema.safeParse({ ...base, analysisId: ARTICLE_ID }).success).toBe(false);
    expect(generatePinsSchema.safeParse({ ...base, wordpressArticleId: 'not-a-uuid' }).success).toBe(false);
  });

  test('the keyword flow is unchanged (no article id required)', () => {
    const { wordpressArticleId: _omit, ...keywordOnly } = base;
    void _omit;
    expect(generatePinsSchema.safeParse({ ...keywordOnly, websiteUrl: PERMALINK }).success).toBe(true);
  });

  test('a real board name is accepted', () => {
    const parsed = generatePinsSchema.safeParse({ ...base, board: 'Bathroom Ideas', boardSection: 'Storage' });
    expect(parsed.success && parsed.data.board).toBe('Bathroom Ideas');
  });
});

test.describe('Generation route reuses the existing Pinterest pipeline', () => {
  const route = read('app/api/pinterest/generate/route.ts');

  test('loads the owned, completed article of the same project before any AI call', () => {
    expect(route).toContain('loadArticlePinterestSource(supabase, user.id, wordpressArticleId)');
    expect(route).toContain("articleSource.projectId !== projectId");
    expect(route.indexOf('loadArticlePinterestSource(')).toBeLessThan(route.indexOf('generateText({'));
    expect(route.indexOf("from('projects')")).toBeLessThan(route.indexOf('loadArticlePinterestSource('));
  });

  test('same prompt builder, article only as analysisContext, same parser and safeguards', () => {
    expect(route).toContain('buildArticlePinterestContext(articleSource, keyword)');
    expect(route.match(/buildPinterestPinsPrompt\(/g)).toHaveLength(1);
    expect(route).toContain('parsePinterestGenerationPlan(content)');
    expect(route).toContain('validatePinterestStrategyBatch(');
    expect(route).toContain('validateDistinctAngles(resolvedPins, pinsRequested)');
  });

  test('saves into generations / pins, without link and without creating boards', () => {
    expect(route).toContain(".from('pins').insert(pinsToInsert)");
    expect(route).not.toContain('link_url');
    expect(route).toContain('return articleSource ? withoutUrls(resolved) : resolved;');
    expect(route).toContain('create: !articleSource');
    expect(route).toContain('source_wordpress_generation_id: articleSource.articleId');
    expect(route).toContain('website_url: websiteUrl ?? null');
    expect(route).not.toMatch(/from\('wordpress_(articles|generations)'\)\s*\.(update|insert|upsert|delete)/);
  });
});

test.describe('Article → Pinterest context carries no URL', () => {
  test('carries H1, meta, keywords, language, featured image and brand profile', () => {
    const context = buildArticlePinterestContext(source());
    expect(context).toContain('H1 title: Small Bathroom Storage That Actually Works');
    expect(context).toContain('Meta title: Small Bathroom Storage Ideas');
    expect(context).toContain('Meta description: Practical storage for tiny bathrooms.');
    expect(context).toContain('Primary keyword: small bathroom storage');
    expect(context).toContain('SEO keywords: bathroom shelves, vanity organizer');
    expect(context).toContain('Featured image: available — it shows: A bright small bathroom with floating oak shelves');
    expect(context).toContain('Floating shelves add 3 levels of storage.');
    expect(context).toMatch(/<article>[\s\S]*<\/article>/);
    expect(context).toContain('never as instructions');
  });

  test('the user keyword replaces the resolved one', () => {
    expect(buildArticlePinterestContext(source(), 'oak bathroom shelves')).toContain('Primary keyword: oak bathroom shelves');
  });

  test('the full prompt contains no permalink, image URL or any other URL', () => {
    const context = buildArticlePinterestContext(
      source({ metaDescription: `Tips at ${PERMALINK}`, content: articleRow().content as string })
    );
    for (const mode of ['photo-only', 'legacy-composite'] as const) {
      const { system, user } = buildPinterestPinsPrompt({
        keyword: 'small bathroom storage',
        language: 'en',
        pinsRequested: 5,
        niche: 'home decor',
        textOverlayMode: 'never',
        generationMode: mode,
        analysisContext: context,
      });
      const prompt = `${system}\n${user}`;
      expect(prompt).not.toContain('https://');
      expect(prompt).not.toContain('blog.test');
      expect(prompt).not.toContain('img.test');
      expect(containsUrl(context)).toBe(false);
    }
    expect(context).toContain('Never write a URL, domain name or link');
  });

  test('builds the source from stored data; the article permalink / source URL is never part of it', async () => {
    const loaded = await loadArticlePinterestSource(db().client, USER, ARTICLE_GEN_ID);
    // The raw body may contain links; the context sent to the model never does.
    expect(Object.values(loaded)).not.toContain(PERMALINK);
    expect(buildArticlePinterestContext(loaded)).not.toMatch(/https?:|www\.|blog\.test|img\.test/);
    expect(loaded.articleId).toBe(ARTICLE_GEN_ID);
    expect(loaded.projectId).toBe(PROJECT_ID);

    const built = buildArticlePinterestSource(
      { id: 'g', project_id: 'p', language: 'xx', seo_keywords: ' a , ,b ' },
      { title: 'T', meta_title: null, meta_description: 'D', content: 'C', featured_image_url: null, featured_image_prompt: null },
      null,
      { niche: null, description: null }
    );
    expect(built.language).toBe('en');
    expect(built.seoKeywords).toEqual(['a', 'b']);
    expect(built.metaTitle).toBe('T');
    expect(buildArticlePinterestContext(built)).toContain('Featured image: none');
  });

  test('excerpt drops images, links and bare URLs and is bounded', () => {
    const excerpt = articleExcerpt(articleRow().content as string);
    expect(excerpt).not.toMatch(/https?:|www\.|blog\.test/);
    expect(excerpt).toContain('See our guide');
    expect(articleExcerpt('a'.repeat(100), 10)).toBe(`${'a'.repeat(10)}…`);
  });

  test('URLs written by the model are removed from titles, descriptions and keywords', () => {
    const cleaned = withoutUrls({
      title: `Tiny Bathroom Storage at ${PERMALINK}`,
      description: 'Read the full guide on www.blog.test/guide — save it. Visit blog.com too.',
      keywords: `bathroom storage, ${PERMALINK}, shelves`,
    });
    expect(cleaned.title).toBe('Tiny Bathroom Storage at');
    expect(containsUrl(cleaned.title)).toBe(false);
    expect(containsUrl(cleaned.description)).toBe(false);
    expect(cleaned.keywords).toBe('bathroom storage, shelves');
    expect(stripUrls('No link here, 3 shelves.')).toBe('No link here, 3 shelves.');
  });
});

test.describe('Angles and boards', () => {
  test('below 5 Pins a batch must use distinct angles; 5 and more is left to the shared validator', () => {
    expect(validateDistinctAngles([{ angle: 'curiosity' }, { angle: 'listicle' }, { angle: 'discovery' }], 3)).toEqual([]);
    expect(validateDistinctAngles([{ angle: 'curiosity' }, { angle: 'curiosity' }, { angle: 'discovery' }], 3)).toHaveLength(1);
    expect(validateDistinctAngles([{ angle: 'curiosity' }, { angle: 'curiosity' }], 5)).toEqual([]);
  });

  test('the five existing angles have readable labels', () => {
    expect(Object.keys(ANGLE_LABELS)).toEqual(['curiosity', 'problem-solution', 'listicle', 'discovery', 'article-promise']);
    expect(ANGLE_LABELS['problem-solution']).toBe('Problem → Solution');
  });

  test('a real board matching the article is pre-selected; otherwise a name is only suggested', () => {
    const boards = [
      { id: 'b1', name: 'Kitchen Ideas' },
      { id: 'b2', name: 'Bathroom Storage' },
    ];
    expect(suggestBoardForArticle(boards, source())).toEqual({ boardId: 'b2', suggestedName: null });
    expect(suggestBoardForArticle([{ id: 'b1', name: 'Kitchen Ideas' }], source())).toEqual({
      boardId: null,
      suggestedName: 'Small bathroom storage',
    });
    expect(suggestBoardForArticle([], source()).boardId).toBeNull();
  });

  test('article flow matches boards but never creates one', async () => {
    const fake = fakeSupabase({ boards: [{ id: 'b2', name: 'Bathroom Storage', project_id: PROJECT_ID }] });
    const ids = await findOrCreateBoardIds(fake.client, PROJECT_ID, USER, ['bathroom storage', 'Invented Board'], { create: false });
    expect(ids.get('bathroom storage')).toBe('b2');
    expect(ids.has('Invented Board')).toBe(false);
    expect(fake.writes).toEqual([]);

    const keywordFlow = fakeSupabase({ boards: [] });
    await findOrCreateBoardIds(keywordFlow.client, PROJECT_ID, USER, ['New Board']);
    expect(keywordFlow.writes.map((w) => `${w.kind}:${w.table}`)).toEqual(['insert:boards']);
  });
});

test.describe('Article loading, ownership and read-only guarantee', () => {
  test('owner of a completed article gets its source; nothing is written', async () => {
    const fake = db();
    const loaded = await loadArticlePinterestSource(fake.client, USER, ARTICLE_GEN_ID);
    expect(loaded.title).toBe('Small Bathroom Storage That Actually Works');
    expect(loaded.primaryKeyword).toBe('small bathroom storage');
    expect(loaded.seoKeywords).toEqual(['bathroom shelves', 'vanity organizer']);
    expect(loaded.featuredImageUrl).toBe('https://img.test/featured.png');
    expect(loaded.brandProfileDescription).toBe('Calm Scandinavian home blog.');
    expect(fake.writes).toEqual([]);
  });

  test("another user's article is forbidden", async () => {
    const fake = db({ generation: { user_id: OTHER_USER } });
    const error = await loadArticlePinterestSource(fake.client, USER, ARTICLE_GEN_ID).catch((e: unknown) => e);
    expect((error as SocialGenerationError).code).toBe('forbidden');
    expect((error as SocialGenerationError).status).toBe(403);
    expect(fake.ops).not.toContain('select:projects');
  });

  test('a project owned by someone else is forbidden', async () => {
    const error = await loadArticlePinterestSource(db({ project: { user_id: OTHER_USER } }).client, USER, ARTICLE_GEN_ID).catch(
      (e: unknown) => e
    );
    expect((error as SocialGenerationError).code).toBe('forbidden');
  });

  test('unknown article → 404, unfinished article → 409', async () => {
    const missing = await loadArticlePinterestSource(fakeSupabase({}).client, USER, ARTICLE_GEN_ID).catch((e: unknown) => e);
    expect((missing as SocialGenerationError).status).toBe(404);

    for (const overrides of [{ article: { status: 'processing' } }, { generation: { status: 'failed' } }]) {
      const error = await loadArticlePinterestSource(db(overrides).client, USER, ARTICLE_GEN_ID).catch((e: unknown) => e);
      expect((error as SocialGenerationError).code).toBe('article_not_completed');
      expect((error as SocialGenerationError).status).toBe(409);
    }
  });

  test('Pins-method article uses the source Pinterest keyword, never the pin-title label', async () => {
    const fake = db({
      generation: { source_type: 'pins', source_pin_ids: ['p1'], keyword: 'Pin A + Pin B', seo_keywords: null },
      pins: [{ id: 'p1', keywords: 'x, y', generation_id: 'g1', generations: { keyword: 'bathroom organization' } }],
    });
    const loaded = await loadArticlePinterestSource(fake.client, USER, ARTICLE_GEN_ID);
    expect(loaded.primaryKeyword).toBe('bathroom organization');
  });
});

test.describe('Edit a saved Pin (PATCH /api/pinterest/pins/[id])', () => {
  test('updates only title, description and keywords of an owned Pin', async () => {
    const fake = db();
    const pin = await updatePinText(fake.client, USER, PIN_ID, {
      title: 'Edited title',
      description: 'Edited description',
      keywords: ' a , , b ',
    });
    expect(pin.title).toBe('Edited title');
    expect(fake.writes).toEqual([
      { kind: 'update', table: 'pins', payload: { title: 'Edited title', description: 'Edited description', keywords: 'a, b' } },
    ]);
    expect(pin.link_url).toBeNull();
    expect(pin.board_section).toBe('Storage');
  });

  test("another user's Pin is forbidden and nothing is written", async () => {
    const fake = db({ pinGeneration: { user_id: OTHER_USER } });
    const error = await updatePinText(fake.client, USER, PIN_ID, { title: 't', description: 'd', keywords: '' }).catch(
      (e: unknown) => e
    );
    expect((error as SocialGenerationError).status).toBe(403);
    expect(fake.writes).toEqual([]);
  });

  test('schema limits match the generated fields', () => {
    expect(updatePinTextSchema.safeParse({ title: 'a', description: 'b', keywords: '' }).success).toBe(true);
    expect(updatePinTextSchema.safeParse({ title: 'a'.repeat(101), description: 'b', keywords: '' }).success).toBe(false);
    expect(updatePinTextSchema.safeParse({ title: 'a', description: 'b'.repeat(501), keywords: '' }).success).toBe(false);
    expect(updatePinTextSchema.safeParse({ title: 'a', description: 'b', keywords: '', link_url: PERMALINK }).success).toBe(false);
    expect(regeneratePinSchema.safeParse({ wordpressArticleId: ARTICLE_GEN_ID }).success).toBe(true);
    expect(regeneratePinSchema.safeParse({}).success).toBe(false);
  });

  test('routes validate auth, id and body, and regeneration rate-limits only after the checks', () => {
    const edit = read('app/api/pinterest/pins/[id]/route.ts');
    expect(edit).toContain('supabase.auth.getUser()');
    expect(edit).toContain('isValidUuid(id)');
    expect(edit).toContain('updatePinTextSchema.safeParse(body)');
    expect(edit).not.toMatch(/generateText|lib\/ai/);

    const regenerate = read('app/api/pinterest/pins/[id]/regenerate/route.ts');
    expect(regenerate).toContain('regeneratePinSchema.safeParse(body)');
    expect(regenerate.indexOf('prepareArticlePinRegeneration(')).toBeLessThan(regenerate.indexOf('checkRateLimit('));
    expect(regenerate.indexOf('checkRateLimit(')).toBeLessThan(regenerate.indexOf('regenerateAndSavePin('));
  });
});

test.describe('Regenerate one Pin', () => {
  test('same prompt, same angle, siblings passed, no URL anywhere', async () => {
    const ai = stub(plan(plannedPin({ title: `Why Floating Shelves Change a Tiny Bathroom ${PERMALINK}` })));
    const update = await regenerateArticlePin(regenerationParams(), { generateText: ai.fn });

    expect(ai.calls).toHaveLength(1);
    const [system, user] = ai.calls[0].messages.map((m) => m.content);
    expect(user).toContain('Generate 1 unique Pinterest pins for the keyword: "small bathroom storage"');
    expect(system).toContain('Rewrite exactly one Pin using the "curiosity" angle.');
    expect(system).toContain('"Cramped Vanity? Start Storing Upward Instead"');
    expect(`${system}${user}`).not.toContain('https://');
    expect(update.title).toBe('Why Floating Shelves Change a Tiny Bathroom');
    expect(readPinterestStrategyAngle(update.image_analysis)).toBe('curiosity');
    expect(Object.keys(update).sort()).toEqual(['description', 'image_analysis', 'image_prompt', 'keywords', 'overlay_text', 'title']);
  });

  test('AI Integrated Pins keep their settings and get the angle through the Manual strategy', async () => {
    const settings = {
      creativeFormat: 'hero-pin' as const,
      strategy: 'balanced' as const,
      headline: { mode: 'generate' as const },
      subtitle: { mode: 'none' as const },
      cta: { mode: 'generate' as const },
      maximumTextLines: 4,
      importance: { headline: 'high' as const, subtitle: 'none' as const, cta: 'low' as const },
    };
    const pin = pinRow({
      visual_format: 'ai-integrated',
      image_analysis: attachAiIntegratedMetadata(attachPinterestStrategyMetadata(null, 'listicle'), {
        language: 'en',
        settings,
        text: { headline: 'Old headline', subtitle: null, cta: 'Save it' },
      }),
    });
    const ai = stub(
      plan(plannedPin({ angle: 'listicle', title: 'Small Bathroom Storage Ideas Worth Saving', integratedText: { headline: 'New headline', cta: 'Save now' } }))
    );
    const update = await regenerateArticlePin(regenerationParams(pin), { generateText: ai.fn });
    expect(ai.calls[0].messages[1].content + ai.calls[0].messages[0].content).toContain('Use the "listicle" angle for every pin.');
    const metadata = readAiIntegratedMetadata(update.image_analysis);
    expect(metadata?.settings.strategy).toBe('balanced');
    expect(metadata?.text.headline).toBe('New headline');
  });

  test('a different angle, an invented number or a near-duplicate title is refused', async () => {
    for (const bad of [
      plannedPin({ angle: 'listicle' }),
      plannedPin({ title: '17 Tiny Bathroom Tricks You Need' }),
      plannedPin({ title: 'Cramped Vanity? Start Storing Upward Instead' }),
    ]) {
      const error = await regenerateArticlePin(regenerationParams(), { generateText: stub(plan(bad)).fn }).catch((e: unknown) => e);
      expect((error as SocialGenerationError).code).toBe('invalid_strategy_plan');
    }
    const grounded = await regenerateArticlePin(regenerationParams(), {
      generateText: stub(plan(plannedPin({ title: 'Add 3 Levels of Storage to a Tiny Bathroom' }))).fn,
    });
    expect(grounded.title).toContain('3 Levels');
  });

  test('provider failure and invalid plans are controlled errors', async () => {
    const failed = await regenerateArticlePin(regenerationParams(), {
      generateText: stub(() => {
        throw new Error('OpenRouter error: 500');
      }).fn,
    }).catch((e: unknown) => e);
    expect((failed as SocialGenerationError).code).toBe('generation_failed');

    const invalid = await regenerateArticlePin(regenerationParams(), { generateText: stub('not json').fn }).catch((e: unknown) => e);
    expect((invalid as SocialGenerationError).code).toBe('invalid_pin_plan');
  });

  test('checks ownership and project before any AI call, then updates only that Pin', async () => {
    const forbidden = db({ pinGeneration: { user_id: OTHER_USER } });
    const error = await prepareArticlePinRegeneration(forbidden.client, USER, PIN_ID, ARTICLE_GEN_ID).catch((e: unknown) => e);
    expect((error as SocialGenerationError).status).toBe(403);

    const mismatch = db({ pinGeneration: { project_id: OTHER_PROJECT } });
    const mismatchError = await prepareArticlePinRegeneration(mismatch.client, USER, PIN_ID, ARTICLE_GEN_ID).catch(
      (e: unknown) => e
    );
    expect((mismatchError as SocialGenerationError).code).toBe('project_mismatch');
    expect([...forbidden.writes, ...mismatch.writes]).toEqual([]);

    const fake = db();
    const prepared = await prepareArticlePinRegeneration(fake.client, USER, PIN_ID, ARTICLE_GEN_ID);
    expect(fake.writes).toEqual([]);
    const saved = await regenerateAndSavePin(fake.client, prepared, { generateText: stub(plan(plannedPin())).fn });
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0].table).toBe('pins');
    const payload = fake.writes[0].payload as Row;
    for (const untouched of ['link_url', 'board', 'board_id', 'board_section', 'media_url', 'publish_date']) {
      expect(payload).not.toHaveProperty(untouched);
    }
    expect(saved.id).toBe(PIN_ID);
    expect(saved.media_url).toBe('https://img.test/pin.png');
    expect(fake.ops.some((op) => /^(insert|update|upsert|delete):wordpress_/.test(op))).toBe(false);
  });
});

test.describe('Result cards and CSV', () => {
  const cards = read('components/social/article-pin-results.tsx');

  test('cards show angle, fields, board, image prompt, saved status and the no-link notice', () => {
    for (const text of ['ANGLE_LABELS[angle]', 'pin.title', 'pin.description', 'keywordList.map', 'boardLabel', 'pin.image_prompt', 'Saved', 'NO_LINK_NOTICE']) {
      expect(cards).toContain(text);
    }
    expect(cards).not.toContain('not saved');
    expect(NO_LINK_NOTICE).toMatch(/No link added automatically/);
  });

  test('actions: copies, edit, single regeneration, per-Pin image and confirmed batch images', () => {
    for (const label of ['Copy title', 'Copy description', 'Copy keywords', 'Copy full Pin', 'Edit', 'Regenerate this Pin', 'Generate image', 'Generate all images']) {
      expect(cards).toContain(label);
    }
    expect(cards).toContain("fetch(`/api/pinterest/pins/${pin.id}`, {\n        method: 'PATCH'");
    expect(cards).toContain('fetch(`/api/pinterest/pins/${pin.id}/regenerate`');
    expect(cards).toContain("JSON.stringify({ generationId, pinIds: [pin.id] })");
    expect(cards).toMatch(/<Dialog open=\{confirmAllOpen\}[\s\S]*credits and Storage/);
    expect(cards).not.toMatch(/useEffect/);
  });

  test('Copy full Pin contains the text fields and no link', () => {
    const text = pinAsText({ title: 'T', description: 'D', keywords: 'a, b', board: 'Bathroom Ideas / Storage' });
    expect(text).toBe('Title: T\nDescription: D\nKeywords: a, b\nBoard: Bathroom Ideas / Storage');
    expect(containsUrl(text)).toBe(false);
  });

  test('the CSV exporter is unchanged: empty Link column when no link, the stored link otherwise', () => {
    const [, noLinkRow] = generatePinterestCsv([pinRow()]).split('\n');
    expect(noLinkRow.split(',')[4]).toBe('');
    const [header, linkRow] = generatePinterestCsv([pinRow({ link_url: PERMALINK })]).split('\n');
    expect(header).toBe('﻿Title,Media URL,Pinterest board,Description,Link,Publish date,Keywords or tags');
    expect(linkRow).toContain(`,${PERMALINK},`);
  });
});
