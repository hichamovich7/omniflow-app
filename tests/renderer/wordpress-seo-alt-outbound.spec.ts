import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addExternalLink,
  extractUrlsFromText,
  insertLinkAtLooseAnchor,
  insertLinkAtRelevantPhrase,
  outboundUrlRejection,
} from '@/lib/ai/services/external-link';
import { generateArticleFromPins, generateWordPressArticle } from '@/lib/wordpress/generate-article';
import { generateArticleFromUrl } from '@/lib/wordpress/generate-article-from-url';
import { buildPinSummaries, type PinContextSource } from '@/lib/wordpress/pins-context';
import { runArticleQualityCheck, type ArticleQualityInput } from '@/lib/wordpress/quality-check';
import { buildFeaturedImageAltText, isGenericAltText, resolveInternalImageAltText } from '@/lib/wordpress/image-alt-text';
import { uploadMedia } from '@/lib/wordpress/rest-client';
import { exportToHtmlForWordPress } from '@/lib/wordpress/export';

/**
 * WordPress SEO — featured/internal image alt text on /wp/v2/media and one
 * verified outbound link per article (+ the Quality Gate outbound_link
 * check). Offline: global fetch is a stub — no network, no paid AI call, no
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
  'FIRECRAWL_API_KEY',
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
  console.error = () => {};
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.AI_FAST_PROVIDER = 'openrouter';
  process.env.AI_FAST_MODEL = 'test-vendor/fast-model';
  process.env.AI_IMAGE_PROVIDER = 'openrouter';
  process.env.AI_IMAGE_MODEL = 'test-vendor/image-model';
  process.env.OPENROUTER_API_KEY = 'sk-test';
  process.env.OPENROUTER_IMAGE_API_KEY = 'sk-test';
  process.env.FIRECRAWL_API_KEY = 'fc-test';
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

const SITE_URL = 'https://www.myblog.test';
const SOURCE_URL = 'https://www.cdc.test/healthy-pets/cat-toys-safety';
const SOURCE_TITLE = 'Cat toys safety at home';
const NO_LINK = { linkFound: false, anchorText: null, source: null };

// ----------------------------------------------------------------- fetch stub

interface WebAnswer {
  json: object;
  citations?: { url: string; title: string }[];
}

interface StubOptions {
  /** Non-web text calls in order (summary for the URL method, outline, article). */
  texts?: object[];
  /** Web-search call answers in order; "no link" once exhausted. */
  web?: WebAnswer[];
  /** Status per verified URL (default 200 HTML). */
  status?: Record<string, number>;
}

interface StubRecord {
  webCalls: number;
  textCalls: number;
  verified: string[];
  verifyHeaders: Record<string, string>[];
}

function installStub(opts: StubOptions = {}): StubRecord {
  const record: StubRecord = { webCalls: 0, textCalls: 0, verified: [], verifyHeaders: [] };
  const texts = [...(opts.texts ?? [])];
  const web = [...(opts.web ?? [])];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.firecrawl.dev')) {
      return Response.json({ success: true, data: { markdown: 'Source body about cat toy safety.', metadata: { title: 'Cat toy safety' } } });
    }
    if (url.includes('openrouter.ai')) {
      if (url.endsWith('/images')) return Response.json({ data: [{ b64_json: Buffer.from('png').toString('base64') }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as { plugins?: unknown[] };
      if (Array.isArray(body.plugins) && body.plugins.length > 0) {
        record.webCalls += 1;
        const answer = web.shift() ?? { json: NO_LINK };
        const annotations = (answer.citations ?? []).map((c) => ({ type: 'url_citation', url_citation: c }));
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer.json), annotations } }] });
      }
      record.textCalls += 1;
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(texts.shift() ?? {}) } }] });
    }
    record.verified.push(url);
    record.verifyHeaders.push(Object.fromEntries(new Headers(init?.headers).entries()));
    const status = opts.status?.[url] ?? 200;
    return new Response(status === 200 ? `<html><head><title>${SOURCE_TITLE}</title></head><body>ok</body></html>` : 'nope', {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;
  return record;
}

function storageStub(): SupabaseClient {
  return {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
}

const ARTICLE = [
  '# Safe crochet cat toys',
  '',
  'Tight stitches keep stuffing inside, which matters for **cat toys safety** at home.',
  '',
  '## Washing',
  '',
  'Cotton yarn holds up to repeated washing without shedding fibers.',
].join('\n');

/** The article with every Markdown link unwrapped — what it was before linking. */
function unlink(markdown: string): string {
  return markdown.replace(/(?<!!)\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function linkCount(markdown: string, url: string): number {
  return markdown.split(`](${url})`).length - 1;
}

// =============================================================== alt text

test('featured alt text: the article subject in its own language, keyword once, never generic', () => {
  const fr = buildFeaturedImageAltText({ title: 'Jouets en crochet pour chat : le guide de la laine lavable', keyword: 'jouets crochet chat' });
  expect(fr).toBe('Jouets en crochet pour chat : le guide de la laine lavable – jouets crochet chat');
  const de = buildFeaturedImageAltText({ title: 'Häkelspielzeug für Katzen sicher waschen', keyword: 'Häkelspielzeug für Katzen' });
  expect(de).toBe('Häkelspielzeug für Katzen sicher waschen');
  const es = buildFeaturedImageAltText({ title: '**Juguetes** de ganchillo para gatos', keyword: null });
  expect(es).toBe('Juguetes de ganchillo para gatos');

  for (const alt of [fr, de, es]) {
    expect(alt).toBeTruthy();
    expect(isGenericAltText(alt)).toBe(false);
    expect(alt!.toLowerCase()).not.toMatch(/featured image|generated image|image \d/);
    expect(alt!.length).toBeLessThanOrEqual(125);
  }
  // The keyword is never repeated when the title already has it.
  expect(de!.match(/Häkelspielzeug/g)).toHaveLength(1);
});

test('generic alt texts are detected and replaced', () => {
  for (const generic of ['', 'featured image', 'Image 1', 'generated image', 'Photo', 'Image générée', 'Beitragsbild', 'imagen destacada']) {
    expect(isGenericAltText(generic)).toBe(true);
  }
  expect(isGenericAltText('Crocheted mouse toy on a wooden floor')).toBe(false);
  const fallback = { title: 'Juguetes de ganchillo para gatos', keyword: 'juguetes ganchillo' };
  expect(resolveInternalImageAltText('Ovillos de algodón', fallback)).toBe('Ovillos de algodón');
  expect(resolveInternalImageAltText('image 2', fallback)).toBe('Juguetes de ganchillo para gatos – juguetes ganchillo');
});

test('uploadMedia sends alt_text in the /wp/v2/media request and returns the saved value', async () => {
  const requests: { url: string; method: string; body?: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? 'GET' });
    if (url.startsWith('https://storage.test')) return new Response(Buffer.from('png'), { headers: { 'content-type': 'image/png' } });
    const alt = new URL(url).searchParams.get('alt_text');
    return Response.json({ id: 42, source_url: 'https://myblog.test/wp-content/uploads/a.png', alt_text: alt ?? '' });
  }) as typeof fetch;

  const site = { siteUrl: SITE_URL, username: 'u', password: 'p' };
  const alt = 'Jouets en crochet pour chat : le guide de la laine lavable';
  const uploaded = await uploadMedia(site, 'https://storage.test/FEATURED.png', 'slug-featured.png', alt);

  const media = requests.find((r) => r.url.includes('/wp-json/wp/v2/media'));
  expect(media?.method).toBe('POST');
  expect(new URL(media!.url).pathname).toBe('/wp-json/wp/v2/media');
  expect(new URL(media!.url).searchParams.get('alt_text')).toBe(alt);
  expect(uploaded).toEqual({ id: 42, sourceUrl: 'https://myblog.test/wp-content/uploads/a.png', altText: alt });
});

test('uploadMedia sets alt_text with one follow-up call when WordPress ignores it on upload', async () => {
  const requests: { url: string; body?: string }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.startsWith('https://storage.test')) return new Response(Buffer.from('png'), { headers: { 'content-type': 'image/png' } });
    if (url.endsWith('/media/7')) return Response.json({ id: 7, alt_text: JSON.parse(String(init?.body)).alt_text });
    return Response.json({ id: 7, source_url: 'https://myblog.test/a.png', alt_text: '' });
  }) as typeof fetch;

  const uploaded = await uploadMedia({ siteUrl: SITE_URL, username: 'u', password: 'p' }, 'https://storage.test/a.png', 'a.png', 'Ovillos de algodón');
  expect(requests.map((r) => new URL(r.url).pathname)).toEqual(['/a.png', '/wp-json/wp/v2/media', '/wp-json/wp/v2/media/7']);
  expect(JSON.parse(requests[2].body!)).toEqual({ alt_text: 'Ovillos de algodón' });
  expect(uploaded.altText).toBe('Ovillos de algodón');
});

test('publish route: alt text on featured and internal uploads, the stored article is never rewritten', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/wordpress/[id]/publish/route.ts'), 'utf8');
  expect(route).toContain('buildFeaturedImageAltText(altSource)');
  expect(route).toMatch(/uploadMedia\(credentials, article\.featured_image_url, `\$\{article\.slug\}-featured\.png`, altText\)/);
  expect(route).toContain('resolveInternalImageAltText(image.alt_text, altSource)');
  // The only wordpress_articles writes are publish status fields — never `content`.
  const updates = [...route.matchAll(/\.update\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  expect(updates.length).toBeGreaterThan(0);
  for (const update of updates) expect(update).not.toMatch(/\bcontent\s*:/);
});

// ========================================================== outbound URLs

test('internal, image, tracking and invalid URLs are never outbound links', () => {
  expect(outboundUrlRejection('https://myblog.test/other-post', SITE_URL)).toBe('internal');
  expect(outboundUrlRejection('http://www.myblog.test/', 'https://myblog.test')).toBe('internal');
  expect(outboundUrlRejection('https://cdn.example.org/photo.JPG')).toBe('image');
  expect(outboundUrlRejection('https://bit.ly/abc')).toBe('tracking');
  expect(outboundUrlRejection('https://example.org/page?utm_source=x')).toBe('tracking');
  expect(outboundUrlRejection('https://www.google.com/url?q=https://a.org')).toBe('tracking');
  expect(outboundUrlRejection('javascript:alert(1)')).toBe('invalid');
  expect(outboundUrlRejection('http://localhost:3000/a')).toBe('invalid');
  expect(outboundUrlRejection(SOURCE_URL, SITE_URL)).toBeNull();
  expect(extractUrlsFromText('See https://a.org/x, and (https://b.org/y).')).toEqual(['https://a.org/x', 'https://b.org/y']);
});

test('manual URL is linked first on a natural phrase, verified, without any search', async () => {
  const record = installStub();
  const result = await addExternalLink(ARTICLE, 'Safe crochet cat toys', 'en', { candidateUrls: [SOURCE_URL], siteUrl: SITE_URL });

  expect(result.origin).toBe('candidate');
  expect(result.source?.url).toBe(SOURCE_URL);
  expect(record.webCalls).toBe(0);
  expect(record.verified).toEqual([SOURCE_URL]);
  expect(record.verifyHeaders[0]['user-agent']).toContain('Mozilla/5.0');
  expect(linkCount(result.content, SOURCE_URL)).toBe(1);
  // Only a link was added, on words already in a prose line — nothing else changed.
  expect(unlink(result.content)).toBe(ARTICLE);
  expect(result.content).toMatch(/\[[^\]]*(safety|cat toys)[^\]]*\]\(https:\/\/www\.cdc\.test/i);
  expect(result.content.split('\n')[0]).toBe('# Safe crochet cat toys');
});

test('an outbound link already in the article is kept as-is and never duplicated', async () => {
  const article = ARTICLE.replace('repeated washing', `[repeated washing](${SOURCE_URL})`);
  const record = installStub();
  const result = await addExternalLink(article, 'Safe crochet cat toys', 'en', { candidateUrls: [SOURCE_URL] });
  expect(result).toEqual({ content: article, source: { url: SOURCE_URL, title: SOURCE_TITLE }, origin: 'existing' });
  expect(record.webCalls).toBe(0);
  expect(linkCount(result.content, SOURCE_URL)).toBe(1);
});

test('an internal URL is refused, from the user and from the search', async () => {
  const internal = 'https://myblog.test/cat-toys';
  const record = installStub({
    web: [
      { json: { linkFound: true, anchorText: 'repeated washing', source: { url: internal, title: 'Mine' } } },
      { json: NO_LINK },
    ],
  });
  const result = await addExternalLink(ARTICLE, 'Safe crochet cat toys', 'en', { candidateUrls: [internal], siteUrl: SITE_URL });
  expect(result).toEqual({ content: ARTICLE, source: null, origin: null });
  expect(record.verified).toEqual([]);
});

test('an invented URL (not among the search results) is refused; a real search result is used instead', async () => {
  const invented = 'https://www.cdc.test/made-up-page';
  const record = installStub({
    web: [
      {
        json: { linkFound: true, anchorText: 'repeated washing', source: { url: invented, title: 'Invented' } },
        citations: [{ url: SOURCE_URL, title: SOURCE_TITLE }],
      },
    ],
  });
  const result = await addExternalLink(ARTICLE, 'Safe crochet cat toys', 'en');
  expect(record.verified).not.toContain(invented);
  expect(result.content).not.toContain(invented);
  expect(result.source?.url).toBe(SOURCE_URL);
  expect(result.origin).toBe('search');
  expect(record.webCalls).toBe(1);
});

test('an unreachable URL is refused', async () => {
  installStub({
    status: { [SOURCE_URL]: 404 },
    web: [{ json: { linkFound: true, anchorText: 'repeated washing', source: { url: SOURCE_URL, title: 'x' } } }, { json: NO_LINK }],
  });
  const result = await addExternalLink(ARTICLE, 'Safe crochet cat toys', 'en');
  expect(result.source).toBeNull();
  expect(result.content).toBe(ARTICLE);
});

test('fallback: exactly one more search when the first finds no reliable source', async () => {
  const record = installStub({
    web: [
      { json: NO_LINK },
      { json: { linkFound: true, anchorText: 'repeated washing', source: { url: SOURCE_URL, title: SOURCE_TITLE } } },
    ],
  });
  const result = await addExternalLink(ARTICLE, 'Safe crochet cat toys', 'en');
  expect(record.webCalls).toBe(2);
  expect(result.origin).toBe('search');
  expect(result.content).toContain(`[repeated washing](${SOURCE_URL})`);
});

test('no reliable source: two searches at most, article unchanged, Quality Gate warns without blocking', async () => {
  const record = installStub();
  const result = await addExternalLink(ARTICLE, 'Safe crochet cat toys', 'en');
  expect(record.webCalls).toBe(2);
  expect(result).toEqual({ content: ARTICLE, source: null, origin: null });

  const report = runArticleQualityCheck(qualityInput({ content: result.content, outboundLinkUrl: null }));
  const outbound = report.checks.find((c) => c.key === 'outbound_link');
  expect(outbound?.status).toBe('warning');
  expect(outbound?.message).toContain('No outbound link');
  expect(outbound?.message).toContain('Fix:');
  expect(report.qualityIssues.some((m) => m.includes('outbound'))).toBe(false);
});

test('a search that throws (model without web plugin) never breaks the article', async () => {
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  const result = await addExternalLink(ARTICLE, 'Safe crochet cat toys', 'en');
  expect(result).toEqual({ content: ARTICLE, source: null, origin: null });
});

test('anchor matching tolerates case and apostrophe changes but links the article’s own text', () => {
  const content = 'Line one.\n\nL’acrylique Bon Marché perd ses fibres au lavage.';
  const linked = insertLinkAtLooseAnchor(content, "l'acrylique bon marché", 'https://a.org/x');
  expect(linked).toBe('Line one.\n\n[L’acrylique Bon Marché](https://a.org/x) perd ses fibres au lavage.');
  expect(insertLinkAtLooseAnchor('## L’acrylique bon marché', "l'acrylique bon marché", 'https://a.org/x')).toBeNull();
});

test('relevant-phrase anchor: short phrase from prose, never a heading, image or existing link', () => {
  const content = ['# Cotton washing', '![cotton washing](https://img.test/a.png)', 'See [cotton washing](https://x.org).', 'Wash cotton toys cold to keep their shape.'].join('\n\n');
  const linked = insertLinkAtRelevantPhrase(content, 'https://a.org/cotton-washing', ['Cotton washing guide']);
  expect(linked).not.toBeNull();
  const lines = linked!.split('\n\n');
  expect(lines.slice(0, 3)).toEqual(content.split('\n\n').slice(0, 3));
  expect(lines[3]).toMatch(/^Wash \[cotton toys\]\(https:\/\/a\.org\/cotton-washing\)|^\[Wash cotton\]/);
  expect(insertLinkAtRelevantPhrase('Nothing related here at all.', 'https://a.org/x', ['Quantum physics'])).toBeNull();
});

// ============================================================ Quality Gate

function qualityInput(overrides: Partial<ArticleQualityInput>): ArticleQualityInput {
  return {
    title: 'Safe crochet cat toys',
    metaTitle: 'Safe crochet cat toys',
    metaDescription: 'x'.repeat(155),
    slug: 'safe-crochet-cat-toys',
    content: ARTICLE,
    contentBeforeImages: ARTICLE,
    language: 'en',
    expectedH2Headings: ['Washing'],
    expectedImageMarkers: [],
    faqExpected: false,
    allowedUrls: [],
    siteUrl: SITE_URL,
    finishReasons: ['stop'],
    ...overrides,
  };
}

function outboundCheck(overrides: Partial<ArticleQualityInput>) {
  return runArticleQualityCheck(qualityInput(overrides)).checks.find((c) => c.key === 'outbound_link');
}

test('Quality Gate outbound_link: verified external passes, internal links never count', () => {
  const linked = ARTICLE.replace('repeated washing', `[repeated washing](${SOURCE_URL})`);
  expect(outboundCheck({ content: linked, outboundLinkUrl: SOURCE_URL })?.status).toBe('passed');

  const internalOnly = ARTICLE.replace('repeated washing', '[repeated washing](https://myblog.test/washing)');
  const internal = outboundCheck({ content: internalOnly, outboundLinkUrl: null });
  expect(internal?.status).toBe('warning');
  expect(internal?.message).toContain('1 internal link(s) not counted');

  const unverified = outboundCheck({ content: linked, outboundLinkUrl: null });
  expect(unverified?.status).toBe('warning');
  expect(unverified?.message).toContain('none could be verified');
});

test('Rank Math sees a real external <a href> in the HTML sent to WordPress', async () => {
  installStub();
  const { content } = await addExternalLink(ARTICLE, 'Safe crochet cat toys', 'en', { candidateUrls: [SOURCE_URL], siteUrl: SITE_URL });
  const html = exportToHtmlForWordPress({ content });
  const hrefs = [...html.matchAll(/<a href="([^"]+)"([^>]*)>/g)];
  expect(hrefs.map((m) => m[1])).toEqual([SOURCE_URL]);
  expect(hrefs[0][2]).not.toContain('nofollow');
  expect(new URL(hrefs[0][1]).hostname).not.toBe(new URL(SITE_URL).hostname);
});

// ================================================= Keyword / Pins / URL

const OUTLINE = {
  title: 'Safe crochet cat toys',
  metaTitle: 'Safe crochet cat toys',
  slug: 'safe-crochet-cat-toys',
  metaDescription: 'How to crochet cat toys that stay safe: tight stitches, washable cotton yarn and no small parts your cat could swallow.',
  promise: 'Show readers how to crochet safe cat toys.',
  quickAnswerAngle: 'Tight stitches and cotton yarn.',
  keyTakeawaysThemes: ['yarn', 'stitches', 'safety', 'washing'],
  sections: Array.from({ length: 8 }, (_, i) => ({ heading: `Section ${i + 1}`, summary: `Summary ${i + 1}` })),
  includeComparisonTable: false,
  comparisonTableReason: 'Not a comparison.',
  commonMistakesThemes: ['loose stitches', 'small parts', 'wrong yarn'],
  faqQuestions: ['Is cotton safe?', 'How big?', 'Can I wash it?', 'Catnip?'],
  featuredImage: { prompt: 'A crocheted mouse toy on a wooden floor.', altText: 'Crocheted mouse toy' },
  images: [{ placementMarker: 'IMAGE_1', prompt: 'Cotton yarn.', altText: 'Cotton yarn skeins' }],
};

// Keyword / URL outlines plan 2-3 internal images; the Pins outline one per reused Pin image.
const OUTLINE_TWO_IMAGES = {
  ...OUTLINE,
  images: [...OUTLINE.images, { placementMarker: 'IMAGE_2', prompt: 'A cat playing.', altText: 'Cat playing with a toy' }],
};

const ARTICLE_RESPONSE = {
  content: ['# Safe crochet cat toys', 'Tight stitches matter for cat toys safety at home.', '{{IMAGE_1}}', '## Washing', 'Cotton yarn holds up to repeated washing.', '{{FAQ}}'].join('\n\n'),
  quickAnswer: 'Tight stitches and cotton yarn.',
  keyTakeaways: ['a', 'b', 'c', 'd'],
  comparisonTable: null,
  commonMistakes: ['x', 'y', 'z'],
  faq: Array.from({ length: 4 }, (_, i) => ({ question: `Question ${i}?`, answer: `Answer ${i}.` })),
};

const SEARCH_HIT: WebAnswer = {
  json: { linkFound: true, anchorText: 'repeated washing', source: { url: SOURCE_URL, title: SOURCE_TITLE } },
  citations: [{ url: SOURCE_URL, title: SOURCE_TITLE }],
};

function expectOutbound(result: { content: string; quality: { checks: { key: string; status: string }[] } }) {
  expect(linkCount(result.content, SOURCE_URL)).toBe(1);
  expect(result.quality.checks.find((c) => c.key === 'outbound_link')?.status).toBe('passed');
  expect(result.quality.checks.find((c) => c.key === 'unauthorized_urls')?.status).toBe('passed');
}

test('keyword method: verified outbound link from the search, Quality Gate passes', async () => {
  installStub({ texts: [OUTLINE_TWO_IMAGES, ARTICLE_RESPONSE], web: [SEARCH_HIT] });
  const result = await generateWordPressArticle({
    supabase: storageStub(),
    userId: 'u',
    generationId: 'g',
    keyword: 'crochet cat toys',
    language: 'en',
    brandProfileDescription: null,
    siteUrl: SITE_URL,
  });
  expectOutbound(result);
});

test('keyword method: a URL of the research notes is used before any search', async () => {
  const record = installStub({ texts: [OUTLINE_TWO_IMAGES, ARTICLE_RESPONSE] });
  const result = await generateWordPressArticle({
    supabase: storageStub(),
    userId: 'u',
    generationId: 'g',
    keyword: 'crochet cat toys',
    language: 'en',
    brandProfileDescription: null,
    researchNotes: `Official guidance: ${SOURCE_URL}.`,
    siteUrl: SITE_URL,
  });
  expect(record.webCalls).toBe(0);
  expectOutbound(result);
});

test('pins method: verified outbound link, the Pin link to the own site is not the outbound link', async () => {
  installStub({ texts: [OUTLINE, ARTICLE_RESPONSE], web: [SEARCH_HIT] });
  const row: PinContextSource = {
    title: 'Crochet cat toys that last',
    description: 'Tight stitches and cotton yarn.',
    keywords: 'crochet cat toys',
    overlay_text: null,
    image_analysis: null,
    board: 'Crochet',
    board_id: 'b1',
    board_section: null,
    link_url: 'https://myblog.test/cat-toys',
  };
  const result = await generateArticleFromPins({
    supabase: storageStub(),
    userId: 'u',
    generationId: 'g',
    pins: buildPinSummaries([row], new Map()),
    internalImageUrls: ['https://pins.test/a.png'],
    generationKeyword: 'crochet cat toys',
    language: 'en',
    brandProfileDescription: null,
    siteUrl: SITE_URL,
  });
  expectOutbound(result);
});

test('URL method: the scraped source URL is the outbound link, no search needed', async () => {
  const summary = {
    theme: 'Cat toy safety',
    topics: ['stitches', 'yarn', 'washing', 'stuffing'],
    angles: ['safety first', 'durability'],
    keyPoints: ['tight stitches', 'cotton yarn', 'no small parts'],
  };
  const record = installStub({ texts: [summary, OUTLINE_TWO_IMAGES, ARTICLE_RESPONSE] });
  const result = await generateArticleFromUrl({
    supabase: storageStub(),
    userId: 'u',
    generationId: 'g',
    sourceUrl: SOURCE_URL,
    language: 'en',
    brandProfileDescription: null,
    siteUrl: SITE_URL,
  });
  expect(record.webCalls).toBe(0);
  expectOutbound(result);
});
