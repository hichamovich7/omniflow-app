import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import {
  applyImageUrlMap,
  buildRewriteArticleRow,
  buildRewriteGenerationRow,
  buildRewriteImageRows,
  finalizeRewrittenContent,
  prepareRewriteSource,
} from '@/lib/wordpress/rewrite-article';
import { buildWordPressRewritePrompt } from '@/lib/ai/prompts/wordpress-rewrite-prompt';
import { buildWordPressArticlePrompt } from '@/lib/ai/prompts/wordpress-article-prompt';
import { rewriteArticleSchema } from '@/lib/validations/wordpress-rewrite';
import { resolveNicheContext } from '@/lib/niche/resolve';
import { guideSections } from '@/lib/guide/content';
import { canRewriteArticle, readRewrittenFrom, rewrittenArticleHref } from '@/lib/wordpress/rewrite-view';
import type { WordPressArticle, WordPressArticleImage, WordPressGeneration } from '@/types/wordpress';

/**
 * "Rewrite article" (TASK-046). Offline: Supabase, Storage and the AI engine
 * are fakes — no paid AI call, no network, no WordPress call.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER_ID = '99999999-9999-4999-8999-999999999999';
const OLD_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ID = '33333333-3333-4333-8333-333333333333';
const ARTICLE_ID = '44444444-4444-4444-8444-444444444444';
const NEW_ARTICLE_ID = '55555555-5555-4555-8555-555555555555';
const PROJECT_ID = '66666666-6666-4666-8666-666666666666';
const CATEGORY_ID = '77777777-7777-4777-8777-777777777777';
const STORAGE = 'https://xyz.supabase.co/storage/v1/object/public/wordpress-images';
const IMG1 = `${STORAGE}/${USER_ID}/${OLD_ID}/IMAGE_1.png`;
const IMG2 = `${STORAGE}/${USER_ID}/${OLD_ID}/IMAGE_2.png`;
const FEATURED = `${STORAGE}/${USER_ID}/${OLD_ID}/FEATURED.png`;
const PIN_IMG = 'https://xyz.supabase.co/storage/v1/object/public/pin-images/pin-1.png';
const LINK = 'https://www.craftcouncil.org/clay-guide';

const OLD_CONTENT = `# Clay Coasters at Home

Old introduction about clay coasters.

## Quick Answer

Old quick answer.

## Choosing Your Clay

Old text with a [source](${LINK}).

![Marbled clay coasters on oak](${IMG1})

## Sealing and Finishing

Old finishing text.

![Sealed coasters stacked](${IMG2})

## Frequently Asked Questions

### Can coasters go in the dishwasher?

Old answer one.

### How long does clay take to dry?

Old answer two.

## Conclusion

Old conclusion.`;

function generationRow(overrides: Partial<WordPressGeneration> = {}): WordPressGeneration {
  return {
    id: OLD_ID,
    project_id: PROJECT_ID,
    user_id: USER_ID,
    keyword: 'clay coasters',
    language: 'en',
    source_type: 'keyword',
    research_notes: 'Air-dry clay needs 24-72 hours.',
    source_pin_ids: null,
    source_url: null,
    status: 'completed',
    created_at: '2026-10-01T10:00:00Z',
    article_type: 'how-to',
    article_size: 'medium',
    tone_of_voice: 'friendly',
    point_of_view: 'second',
    target_country: 'United States',
    hook_brief: 'Open with a question.',
    include_conclusion: true,
    include_tables: false,
    include_h3: true,
    include_lists: true,
    include_italics: null,
    include_quotes: null,
    include_key_takeaways: null,
    include_faq: true,
    include_bold: false,
    seo_keywords: 'air dry clay, diy coasters',
    manual_external_urls: null,
    quality_report: { status: 'passed', qualityIssues: [], warnings: [], checks: [] },
    ...overrides,
  };
}

function articleRow(overrides: Partial<WordPressArticle> = {}): WordPressArticle {
  return {
    id: ARTICLE_ID,
    generation_id: OLD_ID,
    title: 'Clay Coasters at Home',
    meta_title: 'Clay Coasters at Home: A Friendly Guide',
    slug: 'clay-coasters-at-home',
    meta_description: 'Make clay coasters at home with simple steps.',
    content: OLD_CONTENT,
    word_count: 60,
    featured_image_prompt: 'Coasters on a table',
    featured_image_url: FEATURED,
    status: 'completed',
    category_id: CATEGORY_ID,
    created_at: '2026-10-01T10:00:00Z',
    wp_post_id: 812,
    publish_status: 'published',
    published_at: '2026-10-02T10:00:00Z',
    scheduled_at: null,
    publish_error: null,
    faq: [
      { question: 'Can coasters go in the dishwasher?', answer: 'Old answer one.' },
      { question: 'How long does clay take to dry?', answer: 'Old answer two.' },
    ],
    ...overrides,
  };
}

const IMAGES: WordPressArticleImage[] = [
  { id: 'img-1', article_id: ARTICLE_ID, placement_marker: 'IMAGE_1', prompt: 'p1', alt_text: 'Marbled clay coasters on oak', url: IMG1, position: 0, created_at: '' },
  { id: 'img-2', article_id: ARTICLE_ID, placement_marker: 'IMAGE_2', prompt: 'p2', alt_text: 'Sealed coasters stacked', url: IMG2, position: 1, created_at: '' },
];

const REWRITTEN = `# A different H1 the model invented

New introduction that asks: ever wanted clay coasters?

## Quick Answer

New quick answer.

## Choosing Your Clay

New text with the same [trusted guide](${LINK}).

{{IMAGE_1}}

## Sealing and Finishing

New finishing text.

{{IMAGE_2}}

{{FAQ}}

## Conclusion

New conclusion.`;

const REWRITTEN_FAQ = [
  { question: 'Can coasters go in the dishwasher?', answer: 'New answer one, fully rewritten.' },
  { question: 'How long does clay take to dry?', answer: 'New answer two, fully rewritten.' },
];

// ------------------------------------------------------------ pure helpers

test.describe('Rewrite — source preparation (reused outline, images, FAQ)', () => {
  test('images become markers, the FAQ a single {{FAQ}} line, headings and links are kept', () => {
    const source = prepareRewriteSource(articleRow(), true);
    expect(source.images).toEqual([
      { marker: 'IMAGE_1', alt: 'Marbled clay coasters on oak', url: IMG1 },
      { marker: 'IMAGE_2', alt: 'Sealed coasters stacked', url: IMG2 },
    ]);
    expect(source.sourceContent).toContain('{{IMAGE_1}}');
    expect(source.sourceContent).not.toContain(IMG1);
    expect(source.sourceContent.match(/\{\{FAQ\}\}/g)).toHaveLength(1);
    expect(source.sourceContent).not.toContain('Old answer one');
    expect(source.headings).toEqual(['Quick Answer', 'Choosing Your Clay', 'Sealing and Finishing', 'Conclusion']);
    expect(source.links).toEqual([LINK]);
    expect(source.faq).toEqual({
      mode: 'regenerate',
      questions: ['Can coasters go in the dishwasher?', 'How long does clay take to dry?'],
    });
  });

  test('older articles (no stored FAQ column) fall back to the FAQ parsed from the content', () => {
    const source = prepareRewriteSource(articleRow({ faq: undefined }), null);
    expect(source.faq).toEqual({
      mode: 'regenerate',
      questions: ['Can coasters go in the dishwasher?', 'How long does clay take to dry?'],
    });
  });

  test('an unparseable FAQ section is kept as is; no FAQ → nothing to regenerate', () => {
    const plain = OLD_CONTENT.replace('### Can coasters go in the dishwasher?', 'Can coasters go in the dishwasher?');
    const kept = prepareRewriteSource(articleRow({ content: plain, faq: [] }), null);
    expect(kept.faq.mode).toBe('preserve');
    const noFaq = OLD_CONTENT.split('## Frequently Asked Questions')[0] + '## Conclusion\n\nEnd.';
    expect(prepareRewriteSource(articleRow({ content: noFaq, faq: [] }), false).faq).toEqual({ mode: 'none' });
  });

  test('an article without images or links (e.g. a legacy one) is still supported', () => {
    const source = prepareRewriteSource(articleRow({ content: '# T\n\nJust text.\n\n## One\n\nMore.', faq: null }), null);
    expect(source.images).toEqual([]);
    expect(source.links).toEqual([]);
    expect(source.headings).toEqual(['One']);
  });
});

test.describe('Rewrite — finalization', () => {
  const source = prepareRewriteSource(articleRow(), true);
  const finalize = (rewrittenContent: string, rewrittenFaq = REWRITTEN_FAQ) =>
    finalizeRewrittenContent({ rewrittenContent, rewrittenFaq, title: 'Clay Coasters at Home', language: 'en', includeH3: true, source });

  test('keeps the stored H1, every image (same URL and alt) and renders the regenerated FAQ', () => {
    const result = finalize(REWRITTEN);
    expect(result.content.startsWith('# Clay Coasters at Home\n')).toBe(true);
    expect(result.content).not.toContain('A different H1');
    expect(result.content).toContain(`![Marbled clay coasters on oak](${IMG1})`);
    expect(result.content).toContain(`![Sealed coasters stacked](${IMG2})`);
    expect(result.content).toContain('## Frequently Asked Questions');
    expect(result.content).toContain('New answer one, fully rewritten.');
    expect(result.content).not.toContain('Old answer');
    expect(result.content).not.toContain('{{');
    expect(result.faq).toEqual(REWRITTEN_FAQ);
    expect(result.contentBeforeImages).toContain('{{IMAGE_1}}');
    expect(result.restoredImageMarkers).toEqual([]);
  });

  test('a dropped image marker is put back and a duplicated one removed — images are never lost', () => {
    const result = finalize(REWRITTEN.replace('{{IMAGE_2}}', '').replace('{{IMAGE_1}}', '{{IMAGE_1}}\n\n{{IMAGE_1}}'));
    expect(result.restoredImageMarkers).toEqual(['IMAGE_2']);
    expect(result.content.split(IMG1)).toHaveLength(2);
    expect(result.content.split(IMG2)).toHaveLength(2);
    // Put back before the FAQ, not after it.
    expect(result.content.indexOf(IMG2)).toBeLessThan(result.content.indexOf('## Frequently Asked Questions'));
  });

  test('a preserved FAQ is put back verbatim', () => {
    const plain = OLD_CONTENT.replace('### Can coasters go in the dishwasher?', 'Can coasters go in the dishwasher?');
    const kept = prepareRewriteSource(articleRow({ content: plain, faq: [] }), null);
    const result = finalizeRewrittenContent({ rewrittenContent: REWRITTEN, rewrittenFaq: [], title: 'Clay Coasters at Home', language: 'en', includeH3: true, source: kept });
    expect(result.content).toContain('Can coasters go in the dishwasher?\n\nOld answer one.');
    expect(result.faq).toEqual([]);
  });

  test('copied image URLs replace the old ones everywhere', () => {
    const map = new Map([[IMG1, 'https://new/IMAGE_1.png']]);
    const content = applyImageUrlMap(finalize(REWRITTEN).content, map);
    expect(content).toContain('](https://new/IMAGE_1.png)');
    expect(content).not.toContain(IMG1);
    expect(content).toContain(IMG2);
  });
});

test.describe('Rewrite — prompt (original context reused)', () => {
  test('carries the brief, settings, niche, keywords, outline, images, links and FAQ questions', () => {
    const source = prepareRewriteSource(articleRow(), true);
    const { system, user } = buildWordPressRewritePrompt({
      title: 'Clay Coasters at Home',
      primaryKeyword: 'clay coasters',
      language: 'fr',
      sourceContent: source.sourceContent,
      headings: source.headings,
      imageMarkers: source.images.map((i) => i.marker),
      links: source.links,
      faqQuestions: ['Can coasters go in the dishwasher?'],
      hasFaqMarker: true,
      brandProfileContext: 'BRAND: warm studio voice.',
      researchNotes: 'Air-dry clay needs 24-72 hours.',
      niche: resolveNicheContext({ niche: 'Clay', contentStreams: ['Coasters'], settings: null }),
      toneOfVoice: 'friendly',
      pointOfView: 'second',
      targetCountry: 'United States',
      articleSize: 'medium',
      articleType: 'how-to',
      hookBrief: 'Open with a question.',
      includeH3: true,
      includeBold: false,
      includeTables: false,
      seoKeywords: ['air dry clay', 'diy coasters'],
    });
    expect(system).toContain('Français');
    expect(system).toContain('BRAND: warm studio voice.');
    expect(user).toContain('Primary keyword: clay coasters');
    expect(user).toContain('"# Clay Coasters at Home"');
    expect(user).toContain('2. ## Choosing Your Clay');
    expect(user).toContain('{{IMAGE_1}}, {{IMAGE_2}}');
    expect(user).toContain(LINK);
    expect(user).toContain('1. Can coasters go in the dishwasher?');
    expect(user).toContain('Air-dry clay needs 24-72 hours.');
    expect(user).toContain('warm and approachable');
    expect(user).toContain('second person');
    expect(user).toContain('United States');
    expect(user).toContain('a how-to guide');
    expect(user).toContain('Introduction hook: Open with a question.');
    expect(user).toContain('Do not use any bold text');
    expect(user).toContain('Do not use any Markdown table');
    expect(user).toContain('- air dry clay');
    expect(user).toContain('<current_article>');
    expect(user).toContain('<niche_context>');
    expect(user).toContain('Coasters');
  });

  test('the shared voice / formatting helpers leave the article prompt unchanged', () => {
    const outline = {
      title: 'T', metaTitle: 'T', slug: 't', metaDescription: 'd', quickAnswerAngle: 'q',
      keyTakeawaysThemes: ['a'], sections: [{ heading: 'H', summary: 's' }], includeComparisonTable: false,
      comparisonTableReason: 'r', commonMistakesThemes: ['m'], faqQuestions: ['f'],
      featuredImage: { prompt: 'p', altText: 'a' }, images: [{ placementMarker: 'IMAGE_1', prompt: 'p', altText: 'a' }],
    };
    const { user } = buildWordPressArticlePrompt({
      outline: outline as never, language: 'en', primaryKeyword: 'k', toneOfVoice: 'casual', includeLists: false, includeBold: true,
    });
    expect(user).toContain('Voice instructions for this article:\n- Tone of voice: write the entire article body in a relaxed and conversational');
    expect(user).toContain('Formatting directives for this article:\n- Do not use any Markdown bullet or numbered lists');
    expect(user).toContain('- Use Markdown bold ("**text**") occasionally');
  });
});

test.describe('Rewrite — new version rows (old version kept)', () => {
  test('the new generation copies every original option and starts as processing', () => {
    const row = buildRewriteGenerationRow(generationRow());
    expect(row).toMatchObject({
      project_id: PROJECT_ID, user_id: USER_ID, keyword: 'clay coasters', language: 'en', source_type: 'keyword',
      research_notes: 'Air-dry clay needs 24-72 hours.', article_size: 'medium', tone_of_voice: 'friendly',
      point_of_view: 'second', target_country: 'United States', hook_brief: 'Open with a question.',
      include_faq: true, include_h3: true, include_bold: false, seo_keywords: 'air dry clay, diy coasters', status: 'processing',
    });
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('quality_report');
  });

  test('the new article keeps slug, meta data, category and featured image, with no WordPress link', () => {
    const row = buildRewriteArticleRow(articleRow(), NEW_ID, { content: 'new', wordCount: 1 }, new Map([[FEATURED, 'https://new/F.png']]));
    expect(row).toMatchObject({
      generation_id: NEW_ID, title: 'Clay Coasters at Home', slug: 'clay-coasters-at-home',
      meta_title: 'Clay Coasters at Home: A Friendly Guide', meta_description: 'Make clay coasters at home with simple steps.',
      category_id: CATEGORY_ID, featured_image_url: 'https://new/F.png', status: 'completed',
    });
    // Never published automatically: no WP post id, no publish status copied.
    expect(row).not.toHaveProperty('wp_post_id');
    expect(row).not.toHaveProperty('publish_status');
    expect(row).not.toHaveProperty('published_at');
  });

  test('image rows are copied with the new URLs, other URLs (Pin images) unchanged', () => {
    const rows = buildRewriteImageRows(
      [...IMAGES, { ...IMAGES[0], id: 'img-3', url: PIN_IMG, position: 2 }],
      NEW_ARTICLE_ID,
      new Map([[IMG1, 'https://new/1.png']])
    );
    expect(rows.map((r) => r.url)).toEqual(['https://new/1.png', IMG2, PIN_IMG]);
    expect(rows.every((r) => r.article_id === NEW_ARTICLE_ID)).toBe(true);
  });
});

test.describe('Rewrite — request and client helpers', () => {
  test('the API requires the explicit confirmation', () => {
    expect(rewriteArticleSchema.safeParse({ confirm: true }).success).toBe(true);
    for (const body of [{}, { confirm: false }, { confirm: 'yes' }, { confirm: true, publish: true }, null]) {
      expect(rewriteArticleSchema.safeParse(body).success).toBe(false);
    }
  });

  test('only completed articles can be rewritten', () => {
    expect(canRewriteArticle({ status: 'completed' }, { status: 'completed', content: 'x' })).toBe(true);
    expect(canRewriteArticle({ status: 'processing' }, { status: 'completed', content: 'x' })).toBe(false);
    expect(canRewriteArticle({ status: 'completed' }, { status: 'failed', content: 'x' })).toBe(false);
    expect(canRewriteArticle({ status: 'completed' }, { status: 'completed', content: '  ' })).toBe(false);
    expect(canRewriteArticle({ status: 'completed' }, null)).toBe(false);
  });

  test('the new version links back to the previous one', () => {
    expect(rewrittenArticleHref(NEW_ID, OLD_ID)).toBe(`/wordpress/${NEW_ID}?rewrittenFrom=${OLD_ID}`);
    expect(readRewrittenFrom(OLD_ID, NEW_ID)).toBe(OLD_ID);
    expect(readRewrittenFrom('not-a-uuid', NEW_ID)).toBeNull();
    expect(readRewrittenFrom(NEW_ID, NEW_ID)).toBeNull();
    expect(readRewrittenFrom(undefined, NEW_ID)).toBeNull();
  });
});

test.describe('Rewrite — UI', () => {
  const button = read('components/wordpress/rewrite-article-button.tsx');
  const page = read('app/(dashboard)/wordpress/[id]/page.tsx');

  test('the review page shows "Rewrite article" for completed articles only', () => {
    expect(page).toContain('{canRewriteArticle(generation, article) && <RewriteArticleButton generationId={id} />}');
    expect(button).toContain('Rewrite article');
    expect(button).toContain('data-testid="rewrite-article-button"');
  });

  test('the button only opens a confirmation; the request is sent from the dialog', () => {
    // The trigger opens the dialog, it never calls the API itself.
    expect(button).toMatch(/onClick=\{\(\) => \{\s*setError\(null\);\s*setOpen\(true\);\s*\}\}/);
    expect(button).toContain('<Button onClick={rewrite}');
    expect(button).toContain("body: JSON.stringify({ confirm: true })");
    expect(button).toContain('Rewrite this article?');
    expect(button).toContain('nothing is');
    expect(button).toContain('published to WordPress');
  });

  test('shows the generation state and errors, and cannot be closed while rewriting', () => {
    expect(button).toContain("{loading ? 'Rewriting…' : 'Rewrite article'}");
    expect(button).toContain('role="status"');
    expect(button).toContain('onOpenChange={(next) => !loading && setOpen(next)}');
    expect(button).toContain('<Alert variant="danger">{error}</Alert>');
    expect(button).toContain('Your current version is unchanged.');
  });

  test('the new version shows where the previous version is', () => {
    expect(page).toContain('data-testid="rewritten-version-notice"');
    expect(page).toContain('href={`/wordpress/${rewrittenFrom}`}');
  });
});

// ------------------------------------------------------------ route

interface RecordedEvent { table: string; op: string; row?: unknown; filter?: Record<string, unknown> }

interface Harness {
  events: RecordedEvent[];
  aiCalls: Array<{ role: string; system: string; user: string }>;
  copies: Array<[string, string]>;
  fetchCalls: number;
  post: (body: unknown, id?: string) => Promise<Response>;
}

async function withRewriteRoute(
  options: {
    modelResponse?: string | Error;
    generation?: WordPressGeneration;
    article?: WordPressArticle | null;
    copyFails?: boolean;
  },
  run: (harness: Harness) => Promise<void>
) {
  const harness: Harness = { events: [], aiCalls: [], copies: [], fetchCalls: 0, post: async () => new Response() };
  const generation = options.generation ?? generationRow();
  const article = options.article === undefined ? articleRow() : options.article;

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID, email: 'u@example.com' } } }) },
    from(table: string) {
      let pendingInsert: unknown = null;
      const filter: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filter[column] = value;
          return query;
        },
        insert: (row: unknown) => {
          pendingInsert = row;
          harness.events.push({ table, op: 'insert', row });
          return query;
        },
        update: (row: unknown) => {
          harness.events.push({ table, op: 'update', row, filter });
          return query;
        },
        single: async () => {
          if (table === 'projects') return { data: { id: PROJECT_ID, description: 'Clay studio', niche: 'Clay', user_id: USER_ID }, error: null };
          if (table === 'wordpress_generations' && pendingInsert) return { data: { ...(pendingInsert as object), id: NEW_ID }, error: null };
          if (table === 'wordpress_articles' && pendingInsert) return { data: { ...(pendingInsert as object), id: NEW_ARTICLE_ID }, error: null };
          return { data: null, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return query;
    },
    storage: {
      from: () => ({
        copy: async (from: string, to: string) => {
          harness.copies.push([from, to]);
          return options.copyFails ? { data: null, error: { message: 'denied' } } : { data: { path: to }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORAGE}/${path}` } }),
      }),
    },
  };

  const fakes: Record<string, unknown> = {
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/rate-limit': {
      checkRateLimit: async () => ({ allowed: true }),
      rateLimitErrorResponse: () => {
        throw new Error('rate limit response must not be reached');
      },
    },
    '@/lib/queries/wordpress': {
      getWordPressArticleByGenerationId: async () => ({ generation, article, images: article ? IMAGES : [], qualityReport: null }),
    },
    '@/lib/queries/wordpress-sites': { getWordPressSiteByProjectId: async () => ({ site_url: 'https://myclayblog.com' }) },
    '@/lib/queries/niche-context': { listContentStreamNamesForCategory: async () => ['Coasters'] },
    '@/lib/queries/niche-settings': { getProjectNicheSettings: async () => null },
    '@/lib/ai/engine': {
      generateText: async (params: { role: string; messages: Array<{ content: string }> }) => {
        harness.aiCalls.push({ role: params.role, system: params.messages[0].content, user: params.messages[1].content });
        if (options.modelResponse instanceof Error) throw options.modelResponse;
        return options.modelResponse ?? JSON.stringify({ content: REWRITTEN, faq: REWRITTEN_FAQ });
      },
      generateImage: async () => {
        throw new Error('Image generation must not be called');
      },
      analyzeImage: async () => {
        throw new Error('Vision must not be called');
      },
      resolveTextModel: () => 'fake-model',
    },
  };

  const reloaded = ['@/app/api/wordpress/[id]/rewrite/route', '@/lib/wordpress/rewrite-article'].map((s) => require.resolve(s));
  const keys = [...Object.keys(fakes).map((s) => require.resolve(s)), ...reloaded];
  const originals = new Map(keys.map((key) => [key, require.cache[key]]));
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;

  try {
    for (const [specifier, exports] of Object.entries(fakes)) {
      const filename = require.resolve(specifier);
      require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [], path: '', parent: null, isPreloading: false, require } as unknown as NodeJS.Module;
    }
    for (const key of reloaded) delete require.cache[key];
    globalThis.fetch = (async () => {
      harness.fetchCalls += 1;
      throw new Error('No network call is allowed in this test');
    }) as typeof fetch;
    console.error = () => {};
    console.warn = () => {};
    console.log = () => {};

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require('@/app/api/wordpress/[id]/rewrite/route') as {
      POST: (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    };
    harness.post = (body, id = OLD_ID) =>
      route.POST(
        new Request(`http://localhost/api/wordpress/${id}/rewrite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id }) }
      );
    await run(harness);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
    globalThis.fetch = originalFetch;
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }
}

const inserts = (h: Harness, table: string) => h.events.filter((e) => e.table === table && e.op === 'insert');
const updates = (h: Harness, table: string) => h.events.filter((e) => e.table === table && e.op === 'update');

test.describe('Rewrite — POST /api/wordpress/[id]/rewrite', () => {
  test('creates a new version with the original context, kept images and a new Quality Gate', async () => {
    await withRewriteRoute({}, async (h) => {
      const res = await h.post({ confirm: true });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.data).toMatchObject({ generationId: NEW_ID, previousGenerationId: OLD_ID, status: 'completed' });

      // One text call, original context in the prompt; no image, vision or network call.
      expect(h.aiCalls).toHaveLength(1);
      expect(h.aiCalls[0].system).toContain('Clay studio');
      expect(h.aiCalls[0].user).toContain('Primary keyword: clay coasters');
      expect(h.aiCalls[0].user).toContain('warm and approachable');
      expect(h.aiCalls[0].user).toContain('Coasters');
      expect(h.aiCalls[0].user).toContain('## Sealing and Finishing');
      expect(h.fetchCalls).toBe(0);

      // New generation row with the same options.
      const [genInsert] = inserts(h, 'wordpress_generations');
      expect(genInsert.row).toMatchObject({ keyword: 'clay coasters', tone_of_voice: 'friendly', include_faq: true, status: 'processing' });

      // Images copied into the new version folder, never re-generated.
      expect(h.copies.map(([, to]) => to).sort()).toEqual(
        [`${USER_ID}/${NEW_ID}/FEATURED.png`, `${USER_ID}/${NEW_ID}/IMAGE_1.png`, `${USER_ID}/${NEW_ID}/IMAGE_2.png`].sort()
      );
      const [articleInsert] = inserts(h, 'wordpress_articles');
      const row = articleInsert.row as Record<string, string>;
      expect(row.content).toContain(`${STORAGE}/${USER_ID}/${NEW_ID}/IMAGE_1.png`);
      expect(row.content).not.toContain(IMG1);
      expect(row.content).toContain('New answer one, fully rewritten.');
      expect(row).toMatchObject({ slug: 'clay-coasters-at-home', category_id: CATEGORY_ID, featured_image_url: `${STORAGE}/${USER_ID}/${NEW_ID}/FEATURED.png` });
      expect(row).not.toHaveProperty('wp_post_id');
      const [imagesInsert] = inserts(h, 'wordpress_article_images');
      expect((imagesInsert.row as Array<{ url: string }>).map((r) => r.url)).toEqual([
        `${STORAGE}/${USER_ID}/${NEW_ID}/IMAGE_1.png`,
        `${STORAGE}/${USER_ID}/${NEW_ID}/IMAGE_2.png`,
      ]);

      // New Quality Gate saved on the NEW generation; FAQ saved on the NEW article.
      const qualityUpdate = updates(h, 'wordpress_generations').find((e) => (e.row as Record<string, unknown>).quality_report);
      expect(qualityUpdate?.filter).toEqual({ id: NEW_ID });
      expect(body.data.quality.checks.length).toBeGreaterThan(0);
      const faqUpdate = updates(h, 'wordpress_articles').find((e) => (e.row as Record<string, unknown>).faq);
      expect(faqUpdate?.filter).toEqual({ id: NEW_ARTICLE_ID });
      expect((faqUpdate?.row as { faq: unknown }).faq).toEqual(REWRITTEN_FAQ);
    });
  });

  test('the previous version is never modified and nothing is published', async () => {
    await withRewriteRoute({}, async (h) => {
      await h.post({ confirm: true });
      for (const event of h.events.filter((e) => e.op !== 'insert')) {
        expect(Object.values(event.filter ?? {})).not.toContain(OLD_ID);
        expect(Object.values(event.filter ?? {})).not.toContain(ARTICLE_ID);
      }
      expect(h.events.some((e) => e.op === 'delete')).toBe(false);
      expect(h.fetchCalls).toBe(0);
    });
    const route = read('app/api/wordpress/[id]/rewrite/route.ts');
    expect(route).not.toMatch(/publish-post|rest-client|publishPost|\/publish/);
    expect(read('lib/wordpress/rewrite-article.ts')).not.toMatch(/publish-post|rest-client/);
  });

  test('without confirmation nothing happens (no AI call, no row)', async () => {
    await withRewriteRoute({}, async (h) => {
      const res = await h.post({});
      expect(res.status).toBe(400);
      expect(h.aiCalls).toHaveLength(0);
      expect(h.events).toHaveLength(0);
    });
  });

  test('refuses an invalid id, another user\'s article, and an article not completed — before any AI call', async () => {
    await withRewriteRoute({}, async (h) => {
      expect((await h.post({ confirm: true }, 'nope')).status).toBe(400);
    });
    await withRewriteRoute({ generation: generationRow({ user_id: 'someone-else' }) }, async (h) => {
      expect((await h.post({ confirm: true })).status).toBe(403);
      expect(h.aiCalls).toHaveLength(0);
    });
    await withRewriteRoute({ generation: generationRow({ status: 'processing' }) }, async (h) => {
      expect((await h.post({ confirm: true })).status).toBe(409);
      expect(h.aiCalls).toHaveLength(0);
      expect(h.events).toHaveLength(0);
    });
    await withRewriteRoute({ article: null }, async (h) => {
      expect((await h.post({ confirm: true })).status).toBe(409);
    });
  });

  test('AI errors fail only the new version; the current one is unchanged', async () => {
    await withRewriteRoute({ modelResponse: new Error('OpenRouter error: 503') }, async (h) => {
      const res = await h.post({ confirm: true });
      expect(res.status).toBe(500);
      expect((await res.json()).error.message).toContain('temporarily unavailable');
      expect(updates(h, 'wordpress_generations')).toEqual([
        expect.objectContaining({ row: { status: 'failed' }, filter: { id: NEW_ID } }),
      ]);
      expect(inserts(h, 'wordpress_articles')).toHaveLength(0);
      expect(h.copies).toHaveLength(0);
    });
    await withRewriteRoute({ modelResponse: 'not json' }, async (h) => {
      const res = await h.post({ confirm: true });
      expect(res.status).toBe(422);
      expect(inserts(h, 'wordpress_articles')).toHaveLength(0);
    });
    await withRewriteRoute({ modelResponse: JSON.stringify({ content: REWRITTEN, faq: [] }) }, async (h) => {
      // FAQ count must match the questions being regenerated.
      expect((await h.post({ confirm: true })).status).toBe(422);
    });
  });

  test('a failed image copy keeps the original URL and returns a warning', async () => {
    await withRewriteRoute({ copyFails: true }, async (h) => {
      const res = await h.post({ confirm: true });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.data.warnings).toHaveLength(1);
      const row = inserts(h, 'wordpress_articles')[0].row as Record<string, string>;
      expect(row.content).toContain(IMG1);
      expect(row.featured_image_url).toBe(FEATURED);
    });
  });

  test('older articles (no structured FAQ, no image rows, no options) can be rewritten', async () => {
    const legacy = generationRow({
      article_type: null, article_size: null, tone_of_voice: null, point_of_view: null, target_country: null,
      hook_brief: null, include_conclusion: null, include_tables: null, include_h3: null, include_lists: null,
      include_faq: null, include_bold: null, seo_keywords: null, research_notes: null, quality_report: undefined,
    });
    await withRewriteRoute({ generation: legacy, article: articleRow({ faq: undefined, meta_title: null }) }, async (h) => {
      const res = await h.post({ confirm: true });
      expect(res.status).toBe(201);
      const row = inserts(h, 'wordpress_articles')[0].row as Record<string, unknown>;
      expect(row.meta_title).toBeNull();
      expect(row.content).toContain('New answer two, fully rewritten.');
    });
  });
});

test('the in-app Guide documents Rewrite article', () => {
  const text = guideSections.find((s) => s.id === 'wordpress')!.points.join('\n');
  expect(text).toContain('Rewrite article');
  expect(text).toMatch(/previous version is never changed or deleted/);
  expect(text).toMatch(/Nothing is published to WordPress/);
});
