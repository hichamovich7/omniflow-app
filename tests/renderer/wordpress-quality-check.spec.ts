import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runArticleQualityCheck, type ArticleQualityInput, type QualityStatus } from '@/lib/wordpress/quality-check';
import { generateWordPressArticle } from '@/lib/wordpress/generate-article';

/**
 * WordPress Article Quality Gate V1 (TASK-FIX-045). Pure checks on fixtures,
 * plus one offline end-to-end run (fetch stubbed, Storage stubbed — no
 * network, no paid call, no database).
 */

const TITLE = 'Crochet Cat Toys That Last';
const HEADINGS = ['Choosing Yarn', 'Stitch Density', 'Safe Stuffing', 'Shapes Cats Love', 'Washing and Care', 'Storing Toys'];
const IMAGE_URL = 'https://storage.test/user-1/gen-1/IMAGE_1.png';
const SOURCE_URL = 'https://source.test/washing';

let sentenceId = 0;
function sentence(): string {
  sentenceId += 1;
  return `Detail ${sentenceId} shows how the tight stitch keeps each toy safe and firm for your cat.`;
}
function paragraph(): string {
  return [sentence(), sentence(), sentence(), sentence()].join(' ');
}

interface BuildOptions {
  faq?: boolean;
  h3?: boolean;
  firstLine?: string;
  extra?: string;
  headings?: string[];
  markers?: string[];
}

/** Article Markdown before image resolution — passes every check by default. */
function buildArticle(opts: BuildOptions = {}): string {
  sentenceId = 0;
  const parts: string[] = [`# ${TITLE}`, opts.firstLine ?? `A loose loop is the first thing a playful cat pulls apart. ${paragraph()}`];
  for (const marker of opts.markers ?? ['{{IMAGE_1}}']) parts.push(marker);
  for (const heading of opts.headings ?? HEADINGS) {
    parts.push(`## ${heading}`);
    if (opts.h3) parts.push(`### ${heading} in practice`);
    parts.push(paragraph(), paragraph(), paragraph(), paragraph());
  }
  parts.push(`Cotton yarn holds up to [repeated washing](${SOURCE_URL}).`);
  if (opts.faq ?? true) parts.push('## Frequently Asked Questions', '### Is cotton safe?', 'Cotton is a common choice for toys.');
  parts.push('## Conclusion', paragraph());
  if (opts.extra) parts.push(opts.extra);
  return parts.join('\n\n');
}

function resolveImages(markdown: string): string {
  return markdown.replace('{{IMAGE_1}}', `![Cotton yarn](${IMAGE_URL})`);
}

function baseInput(overrides: Partial<ArticleQualityInput> = {}, build: BuildOptions = {}): ArticleQualityInput {
  const before = buildArticle(build);
  return {
    title: TITLE,
    metaTitle: 'Crochet Cat Toys That Last: Yarn, Stitches, Care',
    metaDescription:
      'Crochet cat toys that survive play: which yarn to pick, how tight to stitch, safe stuffing, shapes cats love and how to wash every toy without damage.',
    slug: 'crochet-cat-toys-that-last',
    content: resolveImages(before),
    contentBeforeImages: before,
    language: 'en',
    articleSize: 'small',
    expectedH2Headings: HEADINGS,
    expectedImageMarkers: ['IMAGE_1'],
    faqExpected: true,
    allowedUrls: [SOURCE_URL],
    finishReasons: ['stop', 'stop'],
    ...overrides,
  };
}

function statusOf(input: ArticleQualityInput, key: string): QualityStatus {
  const found = runArticleQualityCheck(input).checks.find((c) => c.key === key);
  if (!found) throw new Error(`check ${key} missing`);
  return found.status;
}

// ------------------------------------------------------------- report shape

test('a clean article passes every check', () => {
  const report = runArticleQualityCheck(baseInput());
  expect(report.checks.filter((c) => c.status !== 'passed')).toEqual([]);
  expect(report).toMatchObject({ status: 'passed', qualityIssues: [], warnings: [] });
  expect(report.checks.map((c) => c.key)).toEqual([
    'word_count',
    'title',
    'h2_sections',
    'h3',
    'faq',
    'unresolved_markers',
    'first_sentence',
    'unauthorized_urls',
    'meta_title',
    'meta_description',
    'slug',
    'truncation',
    'generic_phrases',
    'repetition',
    'image_markers',
    'disabled_blocks',
    'language',
  ]);
});

test('overall status: failed beats warning, messages land in qualityIssues / warnings', () => {
  const report = runArticleQualityCheck(baseInput({ metaTitle: 'x'.repeat(65), slug: 'Bad Slug' }));
  expect(report.status).toBe('failed');
  expect(report.qualityIssues.some((m) => m.startsWith('Slug'))).toBe(true);
  expect(report.warnings.some((m) => m.startsWith('Meta title is 65'))).toBe(true);

  const warningOnly = runArticleQualityCheck(baseInput({ metaTitle: 'x'.repeat(65) }));
  expect(warningOnly.status).toBe('warning');
  expect(warningOnly.qualityIssues).toEqual([]);
});

// ------------------------------------------------------------------- checks

test('word count follows the chosen size', () => {
  expect(statusOf(baseInput({ articleSize: 'small' }), 'word_count')).toBe('passed');
  expect(statusOf(baseInput({ articleSize: 'large' }), 'word_count')).toBe('failed');
  expect(statusOf(baseInput({ articleSize: 'medium' }), 'word_count')).toBe('failed');
  // Default range 1800-2500, 15 % tolerance = 1695: 1683 words fail, ~1750 only warn.
  expect(statusOf(baseInput({ articleSize: null }), 'word_count')).toBe('failed');
  expect(statusOf(baseInput({ articleSize: null }, { extra: paragraph() }), 'word_count')).toBe('warning');
});

test('title must be the single H1', () => {
  expect(statusOf(baseInput({ title: '' }), 'title')).toBe('failed');
  const noH1 = baseInput();
  noH1.content = noH1.content.replace(`# ${TITLE}\n`, '');
  expect(statusOf(noH1, 'title')).toBe('failed');
  const twoH1 = baseInput({}, { extra: '# Another title' });
  expect(statusOf(twoH1, 'title')).toBe('failed');
  expect(statusOf(baseInput({ title: 'A different title' }), 'title')).toBe('warning');
});

test('planned H2 sections must be present', () => {
  expect(statusOf(baseInput({}, { headings: HEADINGS.slice(0, 5) }), 'h2_sections')).toBe('warning');
  expect(statusOf(baseInput({}, { headings: HEADINGS.slice(0, 2) }), 'h2_sections')).toBe('failed');
});

test('H3 only with includeH3=true, never with includeH3=false', () => {
  expect(statusOf(baseInput({ includeH3: true }, { h3: true }), 'h3')).toBe('passed');
  expect(statusOf(baseInput({ includeH3: false }, { h3: true }), 'h3')).toBe('failed');
  expect(statusOf(baseInput({ includeH3: true }, { faq: false }), 'h3')).toBe('warning');
  const noH3 = baseInput({ includeH3: false, faqExpected: false }, { faq: false });
  expect(statusOf(noH3, 'h3')).toBe('passed');
});

test('FAQ presence matches the toggle, one section only', () => {
  expect(statusOf(baseInput({ faqExpected: true }, { faq: false }), 'faq')).toBe('failed');
  expect(statusOf(baseInput({ faqExpected: false }, { faq: true }), 'faq')).toBe('failed');
  expect(statusOf(baseInput({ faqExpected: false }, { faq: false }), 'faq')).toBe('passed');
  expect(statusOf(baseInput({}, { extra: '## FAQ\n\nAgain?' }), 'faq')).toBe('failed');
});

test('no {{FAQ}} or other unreplaced marker', () => {
  expect(statusOf(baseInput({}, { extra: '{{FAQ}}' }), 'unresolved_markers')).toBe('failed');
  expect(statusOf(baseInput({}, { markers: ['{{IMAGE_1}}', '{{IMAGE_9}}'] }), 'unresolved_markers')).toBe('failed');
});

test('first sentence must not repeat the title', () => {
  expect(statusOf(baseInput({}, { firstLine: `${TITLE}. ${paragraph()}` }), 'first_sentence')).toBe('failed');
  expect(statusOf(baseInput({}, { firstLine: `Crochet cat toys that really last. ${paragraph()}` }), 'first_sentence')).toBe('warning');
});

test('only provided URLs are allowed (images excluded)', () => {
  expect(statusOf(baseInput({ allowedUrls: [] }), 'unauthorized_urls')).toBe('failed');
  expect(statusOf(baseInput({}, { extra: 'See https://invented.test/page for more.' }), 'unauthorized_urls')).toBe('failed');
  expect(statusOf(baseInput({}, { extra: '[made up](https://invented.test/x)' }), 'unauthorized_urls')).toBe('failed');
  expect(statusOf(baseInput({ allowedUrls: [SOURCE_URL, 'https://manual.test/a'] }), 'unauthorized_urls')).toBe('passed');
});

test('meta title length', () => {
  expect(statusOf(baseInput({ metaTitle: '' }), 'meta_title')).toBe('failed');
  expect(statusOf(baseInput({ metaTitle: 'x'.repeat(65) }), 'meta_title')).toBe('warning');
  expect(statusOf(baseInput({ metaTitle: 'x'.repeat(71) }), 'meta_title')).toBe('failed');
});

test('meta description length', () => {
  expect(statusOf(baseInput({ metaDescription: '' }), 'meta_description')).toBe('failed');
  expect(statusOf(baseInput({ metaDescription: 'x'.repeat(130) }), 'meta_description')).toBe('warning');
  expect(statusOf(baseInput({ metaDescription: 'x'.repeat(90) }), 'meta_description')).toBe('failed');
  expect(statusOf(baseInput({ metaDescription: 'x'.repeat(161) }), 'meta_description')).toBe('failed');
});

test('slug validity', () => {
  for (const slug of ['Crochet-Toys', 'crochet--toys', '-crochet', 'crochet_toys', 'häkeln', 'a'.repeat(101)]) {
    expect(statusOf(baseInput({ slug }), 'slug')).toBe('failed');
  }
});

test('truncation: finish_reason "length" fails, missing reason warns', () => {
  expect(statusOf(baseInput({ finishReasons: ['stop', 'length'] }), 'truncation')).toBe('failed');
  expect(statusOf(baseInput({ finishReasons: ['stop', null] }), 'truncation')).toBe('warning');
  expect(statusOf(baseInput({ finishReasons: [] }), 'truncation')).toBe('warning');
});

test('obvious generic phrasing is flagged', () => {
  expect(statusOf(baseInput({}, { firstLine: `In today's world, cats need toys. ${paragraph()}` }), 'generic_phrases')).toBe('warning');
});

test('excessive verbatim repetition', () => {
  const repeated = 'The same long sentence about stitches appears here again.';
  expect(statusOf(baseInput({}, { extra: `${repeated} ${repeated}` }), 'repetition')).toBe('warning');
  const many = ['One', 'Two', 'Three'].map((w) => `${w} identical sentence about yarn keeps coming back here.`);
  expect(statusOf(baseInput({}, { extra: [...many, ...many].join(' ') }), 'repetition')).toBe('failed');
});

test('expected image markers must have been placed', () => {
  expect(statusOf(baseInput({ expectedImageMarkers: ['IMAGE_1', 'IMAGE_2'] }), 'image_markers')).toBe('warning');
});

test('disabled blocks must be absent', () => {
  expect(statusOf(baseInput({ includeConclusion: false }), 'disabled_blocks')).toBe('failed');
  expect(statusOf(baseInput({ includeKeyTakeaways: false }, { extra: '## Key Takeaways\n\n- a' }), 'disabled_blocks')).toBe('failed');
  expect(statusOf(baseInput({ includeTables: false }, { extra: '| A | B |\n| --- | --- |\n| 1 | 2 |' }), 'disabled_blocks')).toBe('failed');
  expect(statusOf(baseInput({ includeQuotes: false }, { extra: '> A quote.' }), 'disabled_blocks')).toBe('failed');
  expect(statusOf(baseInput({ includeTables: false, includeQuotes: false, includeKeyTakeaways: false }), 'disabled_blocks')).toBe('passed');
});

test('language matches the requested one', () => {
  expect(statusOf(baseInput({ language: 'de' }), 'language')).toBe('failed');
  const german = Array.from({ length: 30 }, (_, i) => `Der Faden ist für die Katze und das Spielzeug nicht zu dick, Nummer ${i}.`).join(' ');
  const input = baseInput({ language: 'de' });
  input.content = `# ${TITLE}\n\n${german}`;
  expect(statusOf(input, 'language')).toBe('passed');
  input.content = `# ${TITLE}\n\nKurz.`;
  expect(statusOf(input, 'language')).toBe('warning');
});

// ------------------------------------------------------------- integration

test('generation attaches the report and detects a truncated article call', async () => {
  const savedFetch = globalThis.fetch;
  const savedEnv = { ...process.env };
  const savedConsole = { info: console.info, warn: console.warn, log: console.log };
  const warnings: string[] = [];
  console.info = () => {};
  console.log = () => {};
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
  process.env.AI_FAST_PROVIDER = 'openrouter';
  process.env.AI_FAST_MODEL = 'test-vendor/fast-model';
  delete process.env.AI_OUTLINE_MODEL;
  process.env.AI_IMAGE_PROVIDER = 'openrouter';
  process.env.AI_IMAGE_MODEL = 'test-vendor/image-model';
  process.env.OPENROUTER_API_KEY = 'sk-test';
  process.env.OPENROUTER_IMAGE_API_KEY = 'sk-test';

  const outline = {
    title: TITLE,
    metaTitle: 'Crochet Cat Toys That Last',
    slug: 'crochet-cat-toys-that-last',
    metaDescription: baseInput().metaDescription,
    quickAnswerAngle: 'Tight stitches.',
    keyTakeawaysThemes: ['a', 'b', 'c', 'd'],
    sections: HEADINGS.map((heading) => ({ heading, summary: 's' })),
    includeComparisonTable: false,
    comparisonTableReason: 'n/a',
    commonMistakesThemes: ['x', 'y', 'z'],
    faqQuestions: ['q1', 'q2', 'q3', 'q4'],
    featuredImage: { prompt: 'p', altText: 'a' },
    images: [
      { placementMarker: 'IMAGE_1', prompt: 'p', altText: 'Cotton yarn' },
      { placementMarker: 'IMAGE_2', prompt: 'p', altText: 'Cat playing' },
    ],
  };
  const article = {
    content: buildArticle({ faq: false, markers: ['{{IMAGE_1}}', '{{IMAGE_2}}'] }).replace('## Conclusion', '{{FAQ}}\n\n## Conclusion'),
    quickAnswer: 'q',
    keyTakeaways: ['a', 'b', 'c', 'd'],
    comparisonTable: null,
    commonMistakes: ['x', 'y', 'z'],
    faq: Array.from({ length: 4 }, (_, i) => ({ question: `Question ${i}?`, answer: `Answer ${i}.` })),
  };
  let step = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/images')) return Response.json({ data: [{ b64_json: Buffer.from('png').toString('base64') }] });
    const body = JSON.parse(String(init?.body ?? '{}')) as { plugins?: unknown[] };
    if (body.plugins) {
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ linkFound: false, anchorText: null, source: null }) } }] });
    }
    step += 1;
    const finish = step === 2 ? 'length' : 'stop';
    return Response.json({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(step === 1 ? outline : article) } }] });
  }) as typeof fetch;

  try {
    const result = await generateWordPressArticle({
      supabase: {
        storage: {
          from: () => ({
            upload: async () => ({ error: null }),
            getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
          }),
        },
      } as unknown as SupabaseClient,
      userId: 'user-1',
      generationId: 'gen-1',
      keyword: 'crochet cat toys',
      language: 'en',
      brandProfileDescription: null,
      articleSize: 'small',
      manualExternalUrls: [SOURCE_URL],
    });

    const byKey = Object.fromEntries(result.quality.checks.map((c) => [c.key, c.status]));
    expect(byKey.truncation).toBe('failed');
    expect(byKey.faq).toBe('passed');
    expect(byKey.unresolved_markers).toBe('passed');
    expect(byKey.image_markers).toBe('passed');
    expect(byKey.unauthorized_urls).toBe('passed');
    expect(result.quality.status).toBe('failed');
    // The gate never blocks: the article is still returned.
    expect(result.content).toContain('## Frequently Asked Questions');
    expect(warnings.some((w) => w.startsWith('[wordpress] quality gate: failed') && w.includes('truncation=failed'))).toBe(true);
  } finally {
    globalThis.fetch = savedFetch;
    process.env = savedEnv;
    Object.assign(console, savedConsole);
  }
});

test('the three generation routes return the quality report', () => {
  for (const route of ['generate', 'generate-from-pins', 'generate-from-url']) {
    const source = readFileSync(join(process.cwd(), `app/api/wordpress/${route}/route.ts`), 'utf8');
    expect(source).toContain("status: 'completed', quality: result.quality");
  }
});
