import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateArticleFromPins, generateWordPressArticle } from '@/lib/wordpress/generate-article';
import { insertFaqSection } from '@/lib/wordpress/faq-section';
import { addExternalLink, insertLinkAtAnchor } from '@/lib/ai/services/external-link';
import { buildWordPressArticlePrompt } from '@/lib/ai/prompts/wordpress-article-prompt';
import { buildWordPressOutlinePrompt } from '@/lib/ai/prompts/wordpress-outline-prompt';
import {
  buildWordPressFromPinsPrompt,
  deriveThemeKeyword,
  resolvePinsPrimaryKeyword,
} from '@/lib/ai/prompts/wordpress-from-pins-prompt';
import {
  ARTICLE_SIZE_CONFIG,
  DISABLED_ARRAY_RANGE,
  buildWordpressOutlineSchema,
  wordpressOutlineSchema,
  type ARTICLE_SIZES,
} from '@/lib/validations/wordpress';

/**
 * P0 quality fixes of the WordPress pipeline (context passed to the article,
 * no contradictory/web-search instructions, anti-fabrication rules, visible
 * FAQ). Offline: global fetch is a stub answering OpenRouter chat/image calls
 * with fixtures and recording every request — no network, no paid call, no
 * database (Supabase Storage is a stub).
 */

const ENV_KEYS = [
  'AI_FAST_PROVIDER',
  'AI_FAST_MODEL',
  'AI_OUTLINE_PROVIDER',
  'AI_OUTLINE_MODEL',
  'AI_IMAGE_PROVIDER',
  'AI_IMAGE_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_IMAGE_API_KEY',
  'OPENROUTER_TEXT_MODEL',
] as const;

let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;
let savedFetch: typeof fetch;
let savedConsole: Pick<typeof console, 'info' | 'log' | 'warn' | 'error'>;

test.beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  savedFetch = globalThis.fetch;
  savedConsole = { info: console.info, log: console.log, warn: console.warn, error: console.error };
  console.info = () => {};
  console.log = () => {};
  console.warn = () => {};
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.AI_FAST_PROVIDER = 'openrouter';
  process.env.AI_FAST_MODEL = 'test-vendor/fast-model';
  process.env.AI_IMAGE_PROVIDER = 'openrouter';
  process.env.AI_IMAGE_MODEL = 'test-vendor/image-model';
  process.env.OPENROUTER_API_KEY = 'sk-test';
  process.env.OPENROUTER_IMAGE_API_KEY = 'sk-test';
});

test.afterEach(() => {
  globalThis.fetch = savedFetch;
  Object.assign(console, savedConsole);
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const KEYWORD = 'crochet cat toys';
const TITLE = 'The Ultimate Handmade Guide for Playful Felines';
const BRAND = 'Cozy handmade studio for cat lovers, warm and practical.';

function outlineFixture(sectionCount = 8, withFaq = true) {
  return {
    title: TITLE,
    metaTitle: 'Handmade Guide for Playful Felines',
    slug: 'handmade-guide-playful-felines',
    metaDescription: 'Learn how to crochet safe, durable cat toys with simple stitches and the right yarn.',
    quickAnswerAngle: 'Use tight stitches and cotton yarn.',
    keyTakeawaysThemes: ['yarn choice', 'stitch density', 'safety', 'washing'],
    sections: Array.from({ length: sectionCount }, (_, i) => ({ heading: `Section ${i + 1}`, summary: `Summary ${i + 1}` })),
    includeComparisonTable: false,
    comparisonTableReason: 'Not a comparison topic.',
    commonMistakesThemes: ['loose stitches', 'small parts', 'wrong yarn'],
    faqQuestions: withFaq ? ['Is cotton safe?', 'How big?', 'Can I wash it?', 'Catnip?'] : [],
    featuredImage: { prompt: 'A crocheted mouse toy on a wooden floor.', altText: 'Crocheted mouse toy' },
    images: [
      { placementMarker: 'IMAGE_1', prompt: 'Cotton yarn skeins.', altText: 'Cotton yarn' },
      { placementMarker: 'IMAGE_2', prompt: 'A cat playing.', altText: 'Cat playing with a toy' },
    ],
  };
}

function articleFixture(withFaq = true) {
  return {
    content: [
      `# ${TITLE}`,
      'Intro about tight stitches for cats.',
      '{{IMAGE_1}}',
      '## Common Mistakes',
      'Loose stitches.',
      '{{IMAGE_2}}',
      ...(withFaq ? ['{{FAQ}}'] : []),
      '## Conclusion',
      'End.',
    ].join('\n\n'),
    quickAnswer: 'Use tight stitches and cotton yarn.',
    keyTakeaways: ['a', 'b', 'c', 'd'],
    comparisonTable: null,
    commonMistakes: ['x', 'y', 'z'],
    faq: withFaq ? Array.from({ length: 4 }, (_, i) => ({ question: `Question ${i}?`, answer: `Answer ${i}.` })) : [],
  };
}

interface RecordedChat {
  system: string;
  user: string;
  maxTokens: number;
  webSearch: boolean;
}

interface StubRecord {
  chats: RecordedChat[];
  imageCalls: number;
  otherRequests: string[];
}

/**
 * Answers outline → article in order; the web-search (external link) call
 * answers with `externalLinkAnswer`. Any non-OpenRouter URL (link
 * verification) answers 200.
 */
function installFetchStub(outline: object, article: object, externalLinkAnswer: object = { linkFound: false, anchorText: null, source: null }): StubRecord {
  const record: StubRecord = { chats: [], imageCalls: 0, otherRequests: [] };
  let textStep = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('openrouter.ai')) {
      record.otherRequests.push(url);
      return new Response('ok', { status: 200 });
    }
    if (url.endsWith('/images')) {
      record.imageCalls += 1;
      return Response.json({ data: [{ b64_json: Buffer.from('png').toString('base64') }] });
    }

    const body = JSON.parse(String(init?.body ?? '{}')) as {
      messages: { role: string; content: string }[];
      max_tokens: number;
      plugins?: unknown[];
    };
    const webSearch = Array.isArray(body.plugins) && body.plugins.length > 0;
    record.chats.push({
      system: body.messages.find((m) => m.role === 'system')?.content ?? '',
      user: body.messages.find((m) => m.role === 'user')?.content ?? '',
      maxTokens: body.max_tokens,
      webSearch,
    });

    let content: string;
    if (webSearch) {
      content = JSON.stringify(externalLinkAnswer);
    } else {
      content = JSON.stringify(textStep === 0 ? outline : article);
      textStep += 1;
    }
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] });
  }) as typeof fetch;

  return record;
}

interface StorageStub {
  client: SupabaseClient;
  uploads: string[];
}

function storageStub(): StorageStub {
  const uploads: string[] = [];
  const client = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
  return { client, uploads };
}

type KeywordParams = Partial<Parameters<typeof generateWordPressArticle>[0]>;

async function runKeyword(record: StubRecord, extra: KeywordParams = {}) {
  const storage = storageStub();
  const result = await generateWordPressArticle({
    supabase: storage.client,
    userId: 'user-1',
    generationId: 'gen-1',
    keyword: KEYWORD,
    language: 'en',
    brandProfileDescription: BRAND,
    ...extra,
  });
  const [outlineCall, articleCall] = record.chats.filter((c) => !c.webSearch);
  return { result, outlineCall, articleCall, storage };
}

const PINS = [
  { title: 'Pin A', description: 'Desc A', keywords: 'amigurumi, yarn' },
  { title: 'Pin B', description: 'Desc B', keywords: 'amigurumi, cat' },
];
const PIN_IMAGE_URLS = ['https://pins.test/a.png', 'https://pins.test/b.png'];

async function runPins(record: StubRecord, generationKeyword: string | null) {
  const storage = storageStub();
  const result = await generateArticleFromPins({
    supabase: storage.client,
    userId: 'user-1',
    generationId: 'gen-2',
    pins: PINS,
    internalImageUrls: PIN_IMAGE_URLS,
    generationKeyword,
    language: 'en',
    brandProfileDescription: BRAND,
    researchNotes: 'Readers ask about washable yarn.',
  });
  const [outlineCall, articleCall] = record.chats.filter((c) => !c.webSearch);
  return { result, outlineCall, articleCall, storage };
}

const FACTUAL_RULES = [
  'Never invent statistics',
  'Never invent studies',
  'Never invent quotations',
  'Never invent prices, dates',
  'Use only the information provided',
  'say so plainly',
  'Never present an assumption',
];
const EDITORIAL_RULES = ['No generic introduction', 'No repetition', 'No empty sentences', 'No overly long paragraphs'];

// ---------------------------------------------------------------- context

test('keyword method: the real keyword (not the title) is the article primary keyword', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { articleCall } = await runKeyword(record);

  expect(articleCall.user).toContain(`Primary keyword: ${KEYWORD}`);
  expect(articleCall.user).toContain(`Primary keyword "${KEYWORD}"`);
  expect(articleCall.user).not.toContain(`Primary keyword "${TITLE}"`);
});

test('keyword method: Brand Profile, research notes, type, tone, POV, country and SEO keywords reach the article prompt', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { articleCall } = await runKeyword(record, {
    researchNotes: 'Search intent: beginners.',
    articleType: 'how-to',
    toneOfVoice: 'friendly',
    pointOfView: 'second',
    targetCountry: 'Canada',
    seoKeywords: ['amigurumi mouse'],
  });

  expect(articleCall.system).toContain(BRAND);
  expect(articleCall.user).toContain('Search intent: beginners.');
  expect(articleCall.user).toContain('Article type: this is a how-to guide');
  expect(articleCall.user).toContain('warm and approachable');
  expect(articleCall.user).toContain('second person');
  expect(articleCall.user).toContain('readers in Canada');
  expect(articleCall.user).toContain('- amigurumi mouse');
  expect(articleCall.user).toContain('Main Content sections to write:');
});

test('URL method: the article prompt gets the resolved keyword, Brand Profile and source summary', () => {
  const source = readFileSync(join(process.cwd(), 'lib/wordpress/generate-article-from-url.ts'), 'utf8');
  const articleCall = source.slice(source.indexOf('buildWordPressArticlePrompt({'));
  const args = articleCall.slice(0, articleCall.indexOf('});'));
  expect(args).toContain('primaryKeyword: resolvedKeyword');
  expect(args).toContain('brandProfileContext');
  expect(args).toContain('researchNotes');
});

test('pins method: generations.keyword is the primary keyword of the outline and the article', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { outlineCall, articleCall } = await runPins(record, 'washable cat toys');

  expect(outlineCall.user).toContain('Primary keyword: "washable cat toys"');
  expect(outlineCall.user).toContain('Primary keyword "washable cat toys"');
  expect(articleCall.user).toContain('Primary keyword: washable cat toys');
  expect(articleCall.system).toContain(BRAND);
  expect(articleCall.user).toContain('Readers ask about washable yarn.');
});

test('pins method: deriveThemeKeyword is only the fallback when generations.keyword is missing', async () => {
  expect(resolvePinsPrimaryKeyword('  real keyword ', PINS)).toBe('real keyword');
  expect(resolvePinsPrimaryKeyword('   ', PINS)).toBe(deriveThemeKeyword(PINS));
  expect(resolvePinsPrimaryKeyword(null, PINS)).toBe('amigurumi');

  const record = installFetchStub(outlineFixture(), articleFixture());
  const { articleCall } = await runPins(record, null);
  expect(articleCall.user).toContain('Primary keyword: amigurumi');
});

test('pins route reads generations.keyword and passes it to the generator', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/wordpress/generate-from-pins/route.ts'), 'utf8');
  expect(route).toContain("generations(id, project_id, user_id, keyword)");
  expect(route).toContain('generationKeyword: generationRef.keyword');
});

// ---------------------------------------------------- contradictions / links

test('no prompt asks for a web-searched link, and the article prompt forbids invented URLs', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { outlineCall, articleCall } = await runKeyword(record);
  const pinsOutline = buildWordPressFromPinsPrompt({ primaryKeyword: 'k', pins: PINS, language: 'en', imageCount: 0 });

  for (const prompt of [outlineCall.user, articleCall.user, pinsOutline.user]) {
    expect(prompt).not.toMatch(/web search/i);
    expect(prompt).not.toMatch(/found and verified via/i);
    expect(prompt).toContain('Never invent, guess, or reconstruct a URL');
    expect(prompt).toContain('If no URL is provided, do not add any external link.');
  }
});

test('manual URLs are the only URLs allowed in the article prompt', () => {
  const { user } = buildWordPressArticlePrompt({
    outline: wordpressOutlineSchema.parse(outlineFixture()),
    language: 'en',
    primaryKeyword: KEYWORD,
    manualExternalUrls: ['https://example.org/yarn-safety'],
  });
  expect(user).toContain('- https://example.org/yarn-safety');
  expect(user).toContain('these are the only URLs allowed in the article');
});

test('meta title / description / slug rules stay in the outline, not in the writing prompt', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { outlineCall, articleCall } = await runKeyword(record);

  expect(outlineCall.user).toContain('Meta description: 150-160 characters');
  expect(outlineCall.user).toContain('the meta title, the meta description, the slug');
  expect(articleCall.user).not.toMatch(/meta (title|description)|slug/i);
  expect(articleCall.user).not.toContain(outlineFixture().metaDescription);
});

// ------------------------------------------------------------- anti-invention

test('anti-invention and editorial rules are in the keyword outline, pins outline and article prompts', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { outlineCall, articleCall } = await runKeyword(record);
  const pinsOutline = buildWordPressFromPinsPrompt({ primaryKeyword: 'k', pins: PINS, language: 'en', imageCount: 0 });

  for (const prompt of [outlineCall.user, articleCall.user, pinsOutline.user]) {
    for (const rule of [...FACTUAL_RULES, ...EDITORIAL_RULES]) expect(prompt).toContain(rule);
  }
});

// ------------------------------------------------------------------- sizes

const SECTIONS_FOR_SIZE: Record<(typeof ARTICLE_SIZES)[number], number> = { small: 6, medium: 10, large: 14 };

for (const size of ['small', 'medium', 'large'] as const) {
  test(`article size "${size}": outline and article prompts use its own section/word ranges`, async () => {
    const cfg = ARTICLE_SIZE_CONFIG[size];
    const record = installFetchStub(outlineFixture(SECTIONS_FOR_SIZE[size]), articleFixture());
    const { outlineCall, articleCall } = await runKeyword(record, { articleSize: size });

    expect(outlineCall.user).toContain(`${cfg.minSections} to ${cfg.maxSections} Main Content H2 sections`);
    expect(outlineCall.user).toContain(`${cfg.minSections}-${cfg.maxSections} H2 sections`);
    expect(outlineCall.user).toContain(`Target length: ${cfg.minWords}-${cfg.maxWords} words`);
    expect(articleCall.user).toContain(`Target ${cfg.minWords}-${cfg.maxWords} words`);
    expect(articleCall.user).toContain(`Target length: ${cfg.minWords}-${cfg.maxWords} words`);
    // The old hardcoded default must not leak next to a chosen size.
    expect(outlineCall.user).not.toContain('1800-2500');
    expect(articleCall.user).not.toContain('1800-2500');
    expect(articleCall.maxTokens).toBe(size === 'large' ? 11000 : 8000);
  });
}

test('no size chosen keeps the pre-existing 1800-2500 words / 8-10 sections defaults', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { outlineCall, articleCall } = await runKeyword(record);
  expect(outlineCall.user).toContain('8 to 10 Main Content H2 sections');
  expect(articleCall.user).toContain('Target 1800-2500 words');
});

// ------------------------------------------------------------ toggles (H3)

test('H3 is only requested when includeH3 is true, and banned when false', async () => {
  const promptFor = (includeH3: boolean | undefined) =>
    buildWordPressArticlePrompt({
      outline: wordpressOutlineSchema.parse(outlineFixture()),
      language: 'en',
      primaryKeyword: KEYWORD,
      includeH3,
    }).user;

  expect(promptFor(true)).toContain('H3 for subsections');
  expect(promptFor(true)).toContain('Use Markdown H3 subheadings');

  expect(promptFor(undefined)).not.toContain('H3 for subsections');
  expect(promptFor(undefined)).not.toContain('Use Markdown H3 subheadings');

  expect(promptFor(false)).not.toContain('H3 for subsections');
  expect(promptFor(false)).toContain('no H3 or deeper heading level');

  const outline = buildWordPressOutlinePrompt({ keyword: KEYWORD, language: 'en' }).user;
  expect(outline).not.toContain('H3 for subsections');
});

test('disabled blocks (FAQ, Key Takeaways, Conclusion, tables) are not requested', () => {
  const outline = buildWordPressOutlinePrompt({
    keyword: KEYWORD,
    language: 'en',
    includeFaq: false,
    includeKeyTakeaways: false,
    includeConclusion: false,
    includeTables: false,
  }).user;
  expect(outline).not.toMatch(/\d+\. FAQ —/);
  expect(outline).not.toMatch(/\d+\. Key Takeaways —/);
  expect(outline).not.toMatch(/\d+\. Conclusion —/);
  expect(outline).not.toMatch(/\d+\. Comparison Table —/);
  expect(outline).toContain('faqQuestions: return an empty array []');

  const article = buildWordPressArticlePrompt({
    outline: buildWordpressOutlineSchema({ keyTakeawaysRange: DISABLED_ARRAY_RANGE, faqRange: DISABLED_ARRAY_RANGE }).parse({
      ...outlineFixture(8, false),
      keyTakeawaysThemes: [],
    }),
    language: 'en',
    primaryKeyword: KEYWORD,
    includeConclusion: false,
    includeTables: false,
  }).user;
  expect(article).not.toMatch(/\d+\. FAQ —/);
  expect(article).not.toMatch(/\d+\. Key Takeaways —/);
  expect(article).not.toContain('"## Conclusion" section');
  expect(article).not.toContain('{{FAQ}}');
  expect(article).toContain('This article has no FAQ');
});

// ------------------------------------------------------------------- FAQ

test('FAQ enabled: rendered once in the final content, at the marker, before the Conclusion', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { result, articleCall } = await runKeyword(record, { includeFaq: true });

  expect(articleCall.user).toContain('"{{FAQ}}" on its own, exactly once');
  expect(result.content.match(/## Frequently Asked Questions/g)).toHaveLength(1);
  expect(result.content).toContain('### Question 0?\n\nAnswer 0.');
  expect(result.content).toContain('### Question 3?\n\nAnswer 3.');
  expect(result.content).not.toContain('{{FAQ}}');
  expect(result.content.indexOf('## Frequently Asked Questions')).toBeLessThan(result.content.indexOf('## Conclusion'));
});

test('FAQ disabled: no FAQ requested and none in the final content', async () => {
  const record = installFetchStub(outlineFixture(8, false), articleFixture(false));
  const { result, outlineCall, articleCall } = await runKeyword(record, { includeFaq: false });

  expect(outlineCall.user).toContain('faqQuestions: return an empty array []');
  expect(articleCall.user).toContain('This article has no FAQ');
  expect(result.content).not.toContain('Frequently Asked Questions');
  expect(result.content).not.toContain('{{FAQ}}');
});

test('FAQ with includeH3 false renders questions without H3', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { result } = await runKeyword(record, { includeH3: false });
  expect(result.content).toContain('## Frequently Asked Questions');
  expect(result.content).not.toContain('### ');
  expect(result.content).toContain('Question 0?\n\nAnswer 0.');
});

test('insertFaqSection: localized heading, append fallback, single section, stray marker removed', () => {
  const faq = [{ question: 'Q?', answer: 'A.' }];

  expect(insertFaqSection('# T\n\n{{FAQ}}\n\n## Fazit', faq, { language: 'de', useH3: true })).toBe(
    '# T\n\n## Häufig gestellte Fragen\n\n### Q?\n\nA.\n\n## Fazit'
  );
  expect(insertFaqSection('# T\n\nBody.', faq, { language: 'fr', useH3: true })).toBe(
    '# T\n\nBody.\n\n## Questions fréquentes\n\n### Q?\n\nA.\n'
  );
  const twoMarkers = insertFaqSection('# T\n\n{{FAQ}}\n\nMid.\n\n{{FAQ}}\n\nEnd.', faq, { language: 'en', useH3: true });
  expect(twoMarkers.match(/## Frequently Asked Questions/g)).toHaveLength(1);
  expect(twoMarkers).not.toContain('{{FAQ}}');

  const alreadyHasFaq = insertFaqSection('# T\n\n## FAQ\n\nOld.\n\n{{FAQ}}', faq, { language: 'en', useH3: true });
  expect(alreadyHasFaq).not.toContain('Frequently Asked Questions');
  expect(alreadyHasFaq).not.toContain('{{FAQ}}');

  expect(insertFaqSection('# T\n\n{{FAQ}}\n\nEnd.', [], { language: 'en', useH3: true })).toBe('# T\n\nEnd.');
});

// ------------------------------------------------------ Pinterest images

test('pins method: Pinterest images reused unchanged — only the featured image is generated/uploaded', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { result, storage } = await runPins(record, 'washable cat toys');

  expect(record.imageCalls).toBe(1);
  expect(storage.uploads).toEqual(['user-1/gen-2/FEATURED.png']);
  expect(result.internalImages.map((img) => img.url)).toEqual(PIN_IMAGE_URLS);
  expect(result.content).toContain('![Cotton yarn](https://pins.test/a.png)');
  expect(result.content).toContain('![Cat playing with a toy](https://pins.test/b.png)');
  expect(result.featuredImageUrl).toBe('https://storage.test/user-1/gen-2/FEATURED.png');
  // Pins keep their visible FAQ too (outline always plans 4-6 questions).
  expect(result.content.match(/## Frequently Asked Questions/g)).toHaveLength(1);
});

test('keyword method: no regression on images and outline fields', async () => {
  const record = installFetchStub(outlineFixture(), articleFixture());
  const { result, storage } = await runKeyword(record);

  expect(record.imageCalls).toBe(3);
  expect(storage.uploads.sort()).toEqual(['user-1/gen-1/FEATURED.png', 'user-1/gen-1/IMAGE_1.png', 'user-1/gen-1/IMAGE_2.png']);
  expect(result.title).toBe(TITLE);
  expect(result.slug).toBe('handmade-guide-playful-felines');
  expect(result.content).toContain('![Cotton yarn](https://storage.test/user-1/gen-1/IMAGE_1.png)');
  expect(result.content).not.toContain('{{IMAGE_');
});

// --------------------------------------------------------- external link

test('insertLinkAtAnchor links prose only and never rewrites anything else', () => {
  const content = '# Tight stitches\n\n{{IMAGE_1}}\n\nUse tight stitches for safety.\n\n[tight stitches](https://a.test) again tight stitches.';
  const linked = insertLinkAtAnchor(content, 'tight stitches', 'https://src.test');
  expect(linked).toBe(content.replace('Use tight stitches', 'Use [tight stitches](https://src.test)'));
  expect(insertLinkAtAnchor(content, 'not in the article', 'https://src.test')).toBeNull();
  expect(insertLinkAtAnchor('## Only a heading', 'Only a heading', 'https://src.test')).toBeNull();
});

test('addExternalLink never echoes the article: model returns an anchor, the service inserts the link', async () => {
  const article = '# T\n\nCotton yarn holds up to repeated washing.\n\n{{IMAGE_1}}';
  const record = installFetchStub({}, {}, {
    linkFound: true,
    anchorText: 'repeated washing',
    source: { url: 'https://source.test/washing', title: 'Washing guide' },
  });

  const result = await addExternalLink(article, 'Topic', 'en');

  expect(result.content).toBe('# T\n\nCotton yarn holds up to [repeated washing](https://source.test/washing).\n\n{{IMAGE_1}}');
  expect(record.otherRequests).toEqual(['https://source.test/washing']);
  expect(record.chats[0].maxTokens).toBeLessThanOrEqual(1500);
  expect(record.chats[0].user).toContain('Do not return the article');
});

test('addExternalLink keeps the article unchanged when the anchor is not found verbatim', async () => {
  const article = '# T\n\nCotton yarn holds up well.';
  installFetchStub({}, {}, {
    linkFound: true,
    anchorText: 'invented phrase',
    source: { url: 'https://source.test/x', title: 'X' },
  });
  const result = await addExternalLink(article, 'Topic', 'en');
  expect(result).toEqual({ content: article, source: null });
});
