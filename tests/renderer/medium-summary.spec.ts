import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assembleMediumSummary,
  buildMediumSummaryPrompt,
  checkMediumSummary,
  countWords,
  detectLanguage,
  generateMediumSummary,
  loadOmniflowArticleMediumSource,
  loadWordPressPostMediumSource,
  MediumSummaryError,
  NO_PERMALINK_WARNING,
  parseMediumSummaryResponse,
  validateMediumPermalink,
  type MediumGenerateTextFn,
  type MediumSummarySource,
} from '@/lib/social/medium-summary';
import { mediumSummaryFilename } from '@/lib/social/medium-summary-filename';
import {
  isPublicArticleImageUrl,
  mediumImageHosts,
  NO_IMAGE_WARNING,
  selectMediumImage,
  type MediumImageCandidate,
} from '@/lib/social/medium-image';
import { mediumSummaryRequestSchema } from '@/lib/validations/medium-summary';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { WordPressReadError } from '@/lib/wordpress/post-reader';
import { encryptSecret } from '@/lib/wordpress/crypto';
import { SOCIAL_PLATFORMS } from '@/lib/social/platforms';
import type { ChatMessage } from '@/lib/ai/types';

process.env.WORDPRESS_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
process.env.R2_PUBLIC_URL = 'https://media.n8nflow.org';

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = 'user-1';
const OTHER = 'user-2';
const GEN_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SITE_URL = 'https://crochet.example.test';
const PASSWORD = 'abcd efgh ijkl mnop';
const PERMALINK = `${SITE_URL}/colorful-crochet-scarf-patterns/`;
const URL_PATTERN = /https?:\/\/[^\s)"'<>]+/g;

// ---------------------------------------------------------------------------
// Fixtures

const SECTIONS = [
  ['On the Bias Scarf', 'Diagonal bands in double crochet give this scarf a gentle slant that looks great with a plain coat.'],
  ['Waves Scarf', 'A simple repeat of taller and shorter stitches turns the rows into soft waves across the whole piece.'],
  ['Color-Block Scarf', 'Large blocks of color are joined row by row, which keeps the finishing quick and tidy for beginners.'],
  ['Ombre Scarf', 'The shades move slowly from light to dark, so the scarf feels calm and easy to match with jackets.'],
  ['Striped Scarf', 'Thin and wide stripes alternate in a rhythm that hides small tension changes and looks deliberate.'],
] as const;

const FILLER =
  'Each pattern lists the stitches used, explains how to start the foundation chain and shares advice on keeping the edges straight while you work through the rows at your own pace.';

function articleMarkdown(): string {
  const intro = `A colorful crochet scarf can change the feel of a winter outfit. This list of 10 free patterns shows ideas for every level. ${FILLER}`;
  const parts = SECTIONS.map(([heading, text], index) => `## ${index + 1}. ${heading}\n\n${text} ${FILLER} ${FILLER}`);
  return [intro, ...parts].join('\n\n');
}

function articleHtml(): string {
  const intro = `<p>A colorful crochet scarf can change the feel of a winter outfit. This list of 10 free patterns shows ideas for every level. ${FILLER}</p>`;
  const parts = SECTIONS.map(([heading, text], index) => `<h2>${index + 1}. ${heading}</h2><p>${text} ${FILLER} ${FILLER}</p>`);
  return intro + parts.join('');
}

const SUMMARY_SENTENCES = [
  'Here is a friendly tour of scarf ideas that bring a little brightness to cold mornings.',
  'The collection walks you from simple diagonal bands to calm gradients, with a clear path for every skill level.',
  'What stands out is how each design keeps the steps short and the results neat, even for a first project.',
  'You will find relaxed rhythms of stitches that hide small mistakes and make the finished piece look intentional.',
  'The guide also shares practical habits, such as starting a steady foundation and keeping the edges straight.',
  'It is a good companion for quiet evenings, when you want a project that grows quickly without stress.',
];

function summaryBody(words: number): string {
  const out: string[] = [];
  let count = 0;
  let index = 0;
  while (count < words) {
    const sentence = SUMMARY_SENTENCES[index % SUMMARY_SENTENCES.length];
    out.push(sentence);
    count += countWords(sentence);
    index += 1;
    if (index % 4 === 0) out.push(index === 4 ? '\n\n## Why these scarves work\n\n' : '\n\n');
  }
  return out.join(' ').replace(/ \n/g, '\n').replace(/\n /g, '\n');
}

function modelAnswer(overrides: { title?: string; subtitle?: string; body?: string } = {}): string {
  return JSON.stringify({
    title: 'Bright Crochet Scarves for Cold Days',
    subtitle: 'A short tour of the colorful scarf ideas from our latest guide.',
    body: summaryBody(380),
    ...overrides,
  });
}

function stubModel(...answers: string[]) {
  const calls: ChatMessage[][] = [];
  const fn: MediumGenerateTextFn = async ({ messages }) => {
    calls.push(messages);
    return answers[Math.min(calls.length - 1, answers.length - 1)];
  };
  return { fn, calls };
}

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  const writes: string[] = [];
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => ((rows = rows.filter((r) => r[column] === value)), builder),
      in: (column: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[column]))), builder),
      order: () => builder,
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      insert: () => (writes.push(`insert:${table}`), builder),
      update: () => (writes.push(`update:${table}`), builder),
      upsert: () => (writes.push(`upsert:${table}`), builder),
      delete: () => (writes.push(`delete:${table}`), builder),
    };
    return builder;
  }
  return { client: { from } as unknown as SupabaseClient, writes };
}

function db(overrides: { generation?: Row; article?: Row; site?: Row; project?: Row; noSite?: boolean } = {}) {
  return fakeSupabase({
    wordpress_generations: [
      { id: GEN_ID, user_id: USER, project_id: PROJECT_ID, status: 'completed', language: 'en', keyword: 'crochet scarf', seo_keywords: null, ...overrides.generation },
    ],
    wordpress_articles: [
      {
        id: 'art-1',
        generation_id: GEN_ID,
        status: 'completed',
        title: '10 Free Colorful Crochet Scarf Patterns',
        meta_description: 'Ten colorful scarves to crochet.',
        content: articleMarkdown(),
        wp_post_id: 1527,
        publish_status: 'published',
        ...overrides.article,
      },
    ],
    wordpress_article_images: [],
    wordpress_sites: overrides.noSite
      ? []
      : [
          { id: SITE_ID, project_id: PROJECT_ID, user_id: USER, site_url: SITE_URL, wp_username: 'editor', encrypted_application_password: encryptSecret(PASSWORD), created_at: '', ...overrides.site },
        ],
    projects: [{ id: PROJECT_ID, user_id: USER, niche: 'Crochet', description: '', default_language: 'en', ...overrides.project }],
  });
}

function wpPost(overrides: Row = {}): Row {
  return {
    id: 1527,
    date: '2026-10-02T09:00:00',
    status: 'publish',
    link: PERMALINK,
    title: { rendered: '10 Free Colorful Crochet Scarf Patterns' },
    excerpt: { rendered: '<p>Ten colorful scarves.</p>' },
    content: { rendered: articleHtml(), protected: false },
    categories: [],
    _embedded: {},
    ...overrides,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(respond: (url: string) => Response) {
  const calls: Array<{ url: string; method: string }> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return respond(String(input));
  }) as typeof fetch;
  return { fn, calls };
}

function urlsIn(text: string): string[] {
  return text.match(URL_PATTERN) ?? [];
}

// ---------------------------------------------------------------------------

test.describe('Medium summary — OmniFlow article', () => {
  test('generates from an OmniFlow article: CTA with the exact permalink read by one GET', async () => {
    const { client, writes } = db();
    const wp = fakeFetch(() => json(wpPost()));
    const source = await loadOmniflowArticleMediumSource(client, USER, GEN_ID, { fetchImpl: wp.fn });
    expect(source.sourceType).toBe('omniflow_article');
    expect(source.permalink).toBe(PERMALINK);
    expect(source.permalinkWarning).toBeNull();
    expect(wp.calls).toEqual([{ url: `${SITE_URL}/wp-json/wp/v2/posts/1527?_embed=wp:featuredmedia,wp:term`, method: 'GET' }]);

    const model = stubModel(modelAnswer());
    const result = await generateMediumSummary(source, model.fn);
    expect(model.calls).toHaveLength(1);
    expect(result.ctaUrl).toBe(PERMALINK);
    expect(result.markdown).toContain(`[Read the full guide on our blog →](${PERMALINK})`);
    expect(result.markdown).toContain('**Want to explore the complete article?**');
    expect(result.html).toContain(`<a href="${PERMALINK}">Read the full guide on our blog →</a>`);
    // No image in this fixture: only the image warning.
    expect(result.warnings).toEqual([NO_IMAGE_WARNING]);
    expect(writes).toEqual([]);
  });

  test('unpublished article (no wp_post_id): summary without link, clear warning, no WordPress call', async () => {
    const { client } = db({ article: { wp_post_id: null, publish_status: 'draft' } });
    const wp = fakeFetch(() => json(wpPost()));
    const source = await loadOmniflowArticleMediumSource(client, USER, GEN_ID, { fetchImpl: wp.fn });
    expect(wp.calls).toEqual([]);
    expect(source.permalink).toBeNull();

    const result = await generateMediumSummary(source, stubModel(modelAnswer()).fn);
    expect(result.ctaUrl).toBeNull();
    expect(result.warnings).toEqual([NO_PERMALINK_WARNING, NO_IMAGE_WARNING]);
    expect(urlsIn(result.markdown)).toEqual([]);
    expect(result.html).not.toContain('<a ');
  });

  test('post only a draft on WordPress, or unreadable (404): no link, never a guessed URL', async () => {
    const draft = await loadOmniflowArticleMediumSource(db().client, USER, GEN_ID, {
      fetchImpl: fakeFetch(() => json(wpPost({ status: 'draft', link: `${SITE_URL}/?p=1527` }))).fn,
    });
    expect(draft.permalink).toBeNull();
    const missing = await loadOmniflowArticleMediumSource(db().client, USER, GEN_ID, {
      fetchImpl: fakeFetch(() => json({ code: 'rest_post_invalid_id' }, 404)).fn,
    });
    expect(missing.permalink).toBeNull();
    expect(missing.permalinkWarning).toBe(NO_PERMALINK_WARNING);
  });

  test('ownership: another user’s article or project is refused before any WordPress or AI call', async () => {
    const wp = fakeFetch(() => json(wpPost()));
    await expect(loadOmniflowArticleMediumSource(db({ generation: { user_id: OTHER } }).client, USER, GEN_ID, { fetchImpl: wp.fn })).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
    await expect(loadOmniflowArticleMediumSource(db({ project: { user_id: OTHER } }).client, USER, GEN_ID, { fetchImpl: wp.fn })).rejects.toBeInstanceOf(
      SocialGenerationError
    );
    await expect(loadOmniflowArticleMediumSource(db().client, USER, '99999999-9999-4999-8999-999999999999')).rejects.toMatchObject({ code: 'not_found' });
    await expect(loadOmniflowArticleMediumSource(db({ article: { status: 'generating' } }).client, USER, GEN_ID)).rejects.toMatchObject({
      code: 'article_not_completed',
    });
    expect(wp.calls).toEqual([]);
  });

  test('a connection owned by someone else is never used to read the permalink', async () => {
    const wp = fakeFetch(() => json(wpPost()));
    const source = await loadOmniflowArticleMediumSource(db({ site: { user_id: OTHER } }).client, USER, GEN_ID, { fetchImpl: wp.fn });
    expect(wp.calls).toEqual([]);
    expect(source.permalink).toBeNull();
  });
});

test.describe('Medium summary — existing WordPress post', () => {
  test('generates from an external post (GET only), with its exact permalink', async () => {
    const { client, writes } = db();
    const wp = fakeFetch(() => json(wpPost()));
    const source = await loadWordPressPostMediumSource(client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn });
    expect(source.sourceType).toBe('external_wordpress_post');
    expect(source.externalPost).toEqual({ siteId: SITE_ID, postId: 1527 });
    expect(source.permalink).toBe(PERMALINK);
    expect(wp.calls.every((call) => call.method === 'GET')).toBe(true);
    expect(wp.calls).toHaveLength(1);

    const result = await generateMediumSummary(source, stubModel(modelAnswer()).fn);
    expect(result.ctaUrl).toBe(PERMALINK);
    expect(urlsIn(result.markdown)).toEqual([PERMALINK]);
    expect(writes).toEqual([]);
  });

  test('ownership of the connection and of its project', async () => {
    const wp = fakeFetch(() => json(wpPost()));
    await expect(
      loadWordPressPostMediumSource(db({ site: { user_id: OTHER } }).client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn })
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      loadWordPressPostMediumSource(db({ project: { user_id: OTHER } }).client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn })
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(loadWordPressPostMediumSource(db({ noSite: true }).client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(wp.calls).toEqual([]);
  });

  test('inaccessible or empty post: explicit read errors', async () => {
    const load = (response: Response) =>
      loadWordPressPostMediumSource(db().client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: fakeFetch(() => response).fn });
    await expect(load(json({}, 404))).rejects.toMatchObject({ code: 'not_found' });
    await expect(load(json({}, 401))).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(load(json(wpPost({ content: { rendered: '<p>Too short.</p>', protected: false } })))).rejects.toBeInstanceOf(WordPressReadError);
    await expect(load(json(wpPost({ content: { rendered: articleHtml(), protected: true } })))).rejects.toMatchObject({ code: 'empty_content' });
  });

  test('draft post or link outside the connected site: no CTA link', async () => {
    const load = (post: Row) =>
      loadWordPressPostMediumSource(db().client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: fakeFetch(() => json(post)).fn });
    expect((await load(wpPost({ status: 'draft' }))).permalink).toBeNull();
    expect((await load(wpPost({ link: 'https://other.example/colorful-crochet-scarf-patterns/' }))).permalink).toBeNull();
    expect((await load(wpPost({ link: '' }))).permalinkWarning).toBe(NO_PERMALINK_WARNING);
  });

  test('language follows the post itself when its text is clearly in another language', async () => {
    const french =
      '<p>Le crochet est une activité simple et agréable pour les soirées. Dans cet article, vous trouverez des idées pour une écharpe avec des rayures, et les étapes sont expliquées pour les débutants. Votre projet est prêt en une semaine avec une laine douce et des couleurs que vous aimez.</p>'.repeat(
        6
      );
    const source = await loadWordPressPostMediumSource(db().client, USER, { siteId: SITE_ID, postId: 1527 }, {
      fetchImpl: fakeFetch(() => json(wpPost({ content: { rendered: french, protected: false } }))).fn,
    });
    expect(source.language).toBe('fr');
    expect(buildMediumSummaryPrompt(source)[0].content).toContain('Write in French');
  });
});

test.describe('Medium summary — content rules', () => {
  let source: MediumSummarySource;
  test.beforeAll(async () => {
    source = await loadOmniflowArticleMediumSource(db().client, USER, GEN_ID, { fetchImpl: fakeFetch(() => json(wpPost())).fn });
  });

  test('the prompt carries the article as data, its language, the rules — and no URL at all', () => {
    const messages = buildMediumSummaryPrompt(source);
    const all = messages.map((message) => message.content).join('\n');
    expect(urlsIn(all)).toEqual([]);
    expect(all).not.toContain(PERMALINK);
    expect(messages[0].content).toContain('Write in English');
    expect(messages[0].content).toMatch(/Never invent anything/);
    expect(messages[0].content).toMatch(/No URL, no link/);
    expect(messages[1].content).toMatch(/^<article>/);
    for (const [heading] of SECTIONS) expect(messages[1].content).toContain(heading);
  });

  test('URLs and links written by the model (Pinterest, destination…) are removed — the permalink is the only link', async () => {
    const body = `${summaryBody(360)}\n\nSave it on https://www.pinterest.com/pin/123456/ or [our shop](https://shop.example.test/scarves) and www.destination.example.test.`;
    const result = await generateMediumSummary(source, stubModel(modelAnswer({ body })).fn);
    expect(urlsIn(result.markdown)).toEqual([PERMALINK]);
    expect(result.markdown).not.toMatch(/pinterest\.com|shop\.example|destination\.example/);
    expect([...result.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([PERMALINK]);
    expect(result.markdown).toContain('our shop');
  });

  test('300-600 words: a too-short or too-long draft is sent back once, then refused', async () => {
    expect(checkMediumSummary(parseMediumSummaryResponse(modelAnswer({ body: summaryBody(150) })), source)[0]).toMatch(/must have between 300 and 600/);
    expect(checkMediumSummary(parseMediumSummaryResponse(modelAnswer({ body: summaryBody(700) })), source)[0]).toMatch(/must have between 300 and 600/);

    const fixed = stubModel(modelAnswer({ body: summaryBody(150) }), modelAnswer());
    const result = await generateMediumSummary(source, fixed.fn);
    expect(fixed.calls).toHaveLength(2);
    expect(fixed.calls[1][1].content).toMatch(/previous answer was refused[\s\S]*between 300 and 600/);
    expect(result.wordCount).toBeGreaterThanOrEqual(300);
    expect(result.wordCount).toBeLessThanOrEqual(600);

    const failing = stubModel(modelAnswer({ body: summaryBody(150) }));
    await expect(generateMediumSummary(source, failing.fn)).rejects.toMatchObject({ code: 'invalid_summary', status: 422 });
    expect(failing.calls).toHaveLength(2);
  });

  test('invented facts are refused: numbers and project details absent from the article', () => {
    const numbers = parseMediumSummaryResponse(modelAnswer({ body: `${summaryBody(360)} Over 75% of makers finish it in 3 hours.` }));
    expect(checkMediumSummary(numbers, source).join(' ')).toMatch(/Numbers not in the article: 75, 3/);

    const details = parseMediumSummaryResponse(modelAnswer({ body: `${summaryBody(360)} Pair it with a matching cowl in merino.` }));
    expect(checkMediumSummary(details, source).join(' ')).toMatch(/Details not in the article: .*cowl/);

    // Numbers really in the article ("10 free patterns") and list markers are fine.
    const grounded = parseMediumSummaryResponse(modelAnswer({ body: `${summaryBody(360)}\n\n1. Ten ideas, 10 patterns in total.` }));
    expect(checkMediumSummary(grounded, source)).toEqual([]);
  });

  test('an invented fact triggers one corrective retry naming it', async () => {
    const model = stubModel(modelAnswer({ body: `${summaryBody(360)} Over 75% of makers love it.` }), modelAnswer());
    await generateMediumSummary(source, model.fn);
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1][1].content).toContain('Numbers not in the article: 75');
  });

  test('language: a summary in another language is refused; the CTA follows the article language', () => {
    const french = { ...source, language: 'fr' as const };
    const english = parseMediumSummaryResponse(modelAnswer());
    expect(checkMediumSummary(english, french).join(' ')).toMatch(/written in English; write it in French/);
    expect(detectLanguage(summaryBody(200))).toBe('en');

    const assembled = assembleMediumSummary(english, { language: 'fr', permalink: PERMALINK, permalinkWarning: null });
    expect(assembled.markdown).toContain(`[Lisez le guide complet sur notre blog →](${PERMALINK})`);
    expect(assembleMediumSummary(english, { language: 'en', permalink: PERMALINK, permalinkWarning: null }).markdown).toContain(
      'Want to explore the complete article?'
    );
  });

  test('copying the article word for word is refused', () => {
    const copied = parseMediumSummaryResponse(modelAnswer({ body: `${articleMarkdown()}\n\n${summaryBody(60)}`.slice(0, 3000) }));
    expect(checkMediumSummary(copied, source).join(' ')).toMatch(/copied word for word/);
  });

  test('too short an article is refused before any AI call', async () => {
    const tiny = { ...source, context: { ...source.context, plainText: 'A short note about one scarf.' } };
    const model = stubModel(modelAnswer());
    await expect(generateMediumSummary(tiny, model.fn)).rejects.toBeInstanceOf(MediumSummaryError);
    await expect(generateMediumSummary(tiny, model.fn)).rejects.toMatchObject({ code: 'article_too_short' });
    expect(model.calls).toEqual([]);
  });

  test('unreadable model output is retried, then refused', async () => {
    const model = stubModel('not json', modelAnswer());
    await generateMediumSummary(source, model.fn);
    expect(model.calls).toHaveLength(2);
    await expect(generateMediumSummary(source, stubModel('not json').fn)).rejects.toMatchObject({ code: 'invalid_summary' });
  });
});

test.describe('Medium summary — export and assembly', () => {
  const draft = parseMediumSummaryResponse(modelAnswer({ title: 'Bright <b>Scarves</b> & More', body: `${summaryBody(340)}\n\n<script>alert(1)</script>` }));

  test('Markdown: title, subtitle, summary, CTA — no HTML from the model', () => {
    const result = assembleMediumSummary(draft, { language: 'en', permalink: PERMALINK, permalinkWarning: null });
    expect(result.markdown.startsWith('# Bright Scarves & More\n\n*A short tour')).toBe(true);
    expect(result.markdown).toContain('## Why these scarves work');
    expect(result.markdown).not.toMatch(/<script|<b>/);
    expect(result.markdown.trimEnd().endsWith(`[Read the full guide on our blog →](${PERMALINK})`)).toBe(true);
    expect(result.wordCount).toBe(countWords(`${draft.subtitle}\n${draft.body}`));
  });

  test('HTML: escaped title, rendered body, exact CTA href', () => {
    const result = assembleMediumSummary(draft, { language: 'en', permalink: PERMALINK, permalinkWarning: null });
    expect(result.html).toContain('<h1>Bright Scarves &amp; More</h1>');
    expect(result.html).toContain('<h2>Why these scarves work</h2>');
    expect(result.html).not.toContain('<script');
    expect(result.html).toContain(`<a href="${PERMALINK}">`);
  });

  test('a permalink with parentheses stays a valid Markdown link', () => {
    const odd = `${SITE_URL}/scarf-(free)/`;
    const result = assembleMediumSummary(draft, { language: 'en', permalink: odd, permalinkWarning: null });
    expect(result.markdown).toContain(`(${SITE_URL}/scarf-%28free%29/)`);
    expect(result.ctaUrl).toBe(odd);
  });

  test('download file name', () => {
    expect(mediumSummaryFilename('Écharpes colorées : 10 idées!')).toBe('medium-summary-echarpes-colorees-10-idees.md');
    expect(mediumSummaryFilename('???')).toBe('medium-summary.md');
  });

  test('permalink validation: published, on the connected site, never rebuilt', () => {
    expect(validateMediumPermalink(PERMALINK, SITE_URL, 'publish')).toBe(PERMALINK);
    expect(validateMediumPermalink(PERMALINK, SITE_URL, 'draft')).toBeNull();
    expect(validateMediumPermalink('https://evil.example/x/', SITE_URL, 'publish')).toBeNull();
    expect(validateMediumPermalink('javascript:alert(1)', SITE_URL, 'publish')).toBeNull();
    expect(validateMediumPermalink('', SITE_URL, 'publish')).toBeNull();
  });
});

test.describe('Medium summary — API, UI and safety', () => {
  test('request schema: exactly one source', () => {
    expect(mediumSummaryRequestSchema.safeParse({ wordpressArticleId: GEN_ID }).success).toBe(true);
    expect(mediumSummaryRequestSchema.safeParse({ wordpressPost: { siteId: SITE_ID, postId: 1527 } }).success).toBe(true);
    expect(mediumSummaryRequestSchema.safeParse({}).success).toBe(false);
    expect(mediumSummaryRequestSchema.safeParse({ wordpressArticleId: 'nope' }).success).toBe(false);
    expect(mediumSummaryRequestSchema.safeParse({ wordpressArticleId: GEN_ID, wordpressPost: { siteId: SITE_ID, postId: 1 } }).success).toBe(false);
    expect(mediumSummaryRequestSchema.safeParse({ wordpressArticleId: GEN_ID, url: PERMALINK }).success).toBe(false);
  });

  test('route: auth, validation, rate limit + trial cap, centralized AI wrapper; saving goes through the history helper only', () => {
    const route = read('app/api/social/medium-summary/route.ts');
    expect(route).toContain('supabase.auth.getUser()');
    expect(route).toContain('mediumSummaryRequestSchema.safeParse');
    expect(route).toMatch(/checkRateLimit\([^)]*'social\/medium-summary'[\s\S]*enforceTrialLimit: true/);
    expect(route).toContain("from '@/lib/ai/engine'");
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|openrouter\.ai/i);
    expect(route).toContain('saveMediumSummary(supabase, user.id, source, result)');
  });

  test('no Medium API and no WordPress write anywhere in the feature', () => {
    for (const path of [
      'lib/social/medium-summary.ts',
      'app/api/social/medium-summary/route.ts',
      'components/social/medium-summary-panel.tsx',
      'components/social/medium-summary-result.tsx',
      'components/social/medium-export.ts',
    ]) {
      const code = read(path);
      expect(code).not.toMatch(/api\.medium\.com|medium\.com\/v1|integrationToken/i);
      expect(code).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'[\s\S]*wp-json/);
      expect(code).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    }
    // The generator's only request is the summary endpoint (shared helper); the panel and result view do not fetch.
    const helper = read('components/social/medium-export.ts');
    expect(helper.match(/fetch\(/g)).toHaveLength(1);
    expect(helper).toContain("fetch('/api/social/medium-summary'");
    expect(read('components/social/medium-summary-panel.tsx')).not.toContain('fetch(');
    expect(read('components/social/medium-summary-result.tsx')).not.toContain('fetch(');
  });

  test('panel: Copy Markdown, Copy HTML, Download Markdown, Regenerate, word count, CTA URL, warnings', () => {
    const panel = read('components/social/medium-summary-panel.tsx');
    const view = read('components/social/medium-summary-result.tsx');
    const helper = read('components/social/medium-export.ts');
    expect(panel).toContain('Generate Medium summary');
    expect(panel).toContain('<MediumSummaryResultView result={result} onRegenerate={generate} regenerating={loading} />');
    for (const label of ['Copy Markdown', 'Copy HTML', 'Download Markdown', 'Regenerate summary']) {
      expect(view).toContain(label);
    }
    expect(view).toContain("copyMediumContent('Markdown', result.markdown)");
    expect(view).toContain("copyMediumContent('HTML', result.html)");
    expect(view).toContain('downloadMediumMarkdown(result.title, result.markdown)');
    expect(helper).toContain('navigator.clipboard.writeText(content)');
    expect(helper).toMatch(/new Blob\(\[markdown\], \{ type: 'text\/markdown/);
    expect(helper).toContain('mediumSummaryFilename(title)');
    expect(view).toContain('{result.wordCount} words');
    expect(view).toContain("result.ctaUrl ?? 'none'");
    expect(view).toContain('result.warnings.map');
  });

  test('entry points: Studio Medium card and the existing-post page; Pinterest flows unchanged', () => {
    expect(SOCIAL_PLATFORMS.find((platform) => platform.id === 'medium')?.status).toBe('available');
    const studio = read('components/wordpress/social-content-studio.tsx');
    expect(studio).toContain('<MediumSummaryPanel source={{ wordpressArticleId: generationId }} />');
    expect(studio).toContain('href={articlePinterestCreateHref(generationId)}');
    const page = read('app/(dashboard)/pinterest/from-wordpress/page.tsx');
    expect(page).toContain('<MediumSummaryPanel source={{ wordpressPost: parsedSource.data }} />');
    expect(page).toContain('<WordPressPostPicker sites={sites}');
    expect(page).toContain('<PinForm');
  });
});

// ---------------------------------------------------------------------------
// Image (featured first, else the most relevant internal image; exact public URL only)

const FEATURED = `${SITE_URL}/wp-content/uploads/2026/10/featured-scarves.jpg`;
const WAVES = `${SITE_URL}/wp-content/uploads/2026/10/waves-scarf.jpg`;
const INTRO_IMG = `${SITE_URL}/wp-content/uploads/2026/10/intro.jpg`;

function htmlWithImages(images: { intro?: string; waves?: string; wavesAlt?: string; external?: string } = {}): string {
  const intro = `<p>A colorful crochet scarf can change the feel of a winter outfit. This list of 10 free patterns shows ideas for every level. ${FILLER}</p>${
    images.intro ? `<img src="${images.intro}" alt="image">` : ''
  }`;
  const parts = SECTIONS.map(([heading, text], index) => {
    const img =
      heading === 'Waves Scarf' && images.waves
        ? `<img src="${images.waves}" alt="${images.wavesAlt ?? 'Waves scarf in soft self-striping shades'}">`
        : heading === 'Ombre Scarf' && images.external
          ? `<img src="${images.external}" alt="Ombre crochet scarf with long gradient fringe, a perfect colorful scarf">`
          : '';
    return `<h2>${index + 1}. ${heading}</h2>${img}<p>${text} ${FILLER} ${FILLER}</p>`;
  });
  return intro + parts.join('');
}

const featuredMedia = (url: string, alt = 'Five colorful crochet scarves on a wooden bench') => ({
  'wp:featuredmedia': [{ source_url: url, alt_text: alt, caption: { rendered: '' } }],
});

async function externalResult(post: Row) {
  const wp = fakeFetch(() => json(post));
  const source = await loadWordPressPostMediumSource(db().client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn });
  const result = await generateMediumSummary(source, stubModel(modelAnswer()).fn);
  return { source, result, wp };
}

test.describe('Medium summary — image', () => {
  test('the featured image is used first, by its exact URL, in Markdown and HTML, with its alt text', async () => {
    const { result, wp } = await externalResult(
      wpPost({ _embedded: featuredMedia(FEATURED), content: { rendered: htmlWithImages({ waves: WAVES }), protected: false } })
    );
    expect(result.imageUrl).toBe(FEATURED);
    expect(result.imageAlt).toBe('Five colorful crochet scarves on a wooden bench');
    expect(result.markdown).toContain(`![Five colorful crochet scarves on a wooden bench](${FEATURED})`);
    expect(result.html).toContain(`<img src="${FEATURED}" alt="Five colorful crochet scarves on a wooden bench">`);
    // Image right after the subtitle, before the summary.
    expect(result.markdown.indexOf('![')).toBeLessThan(result.markdown.indexOf('## Why these scarves work'));
    expect(result.warnings).toEqual([]);
    // The image is referenced, never downloaded: still one GET (the post).
    expect(wp.calls).toHaveLength(1);
  });

  test('without a featured image, the most relevant internal image is used (descriptive alt, subject section)', async () => {
    const { result } = await externalResult(wpPost({ content: { rendered: htmlWithImages({ intro: INTRO_IMG, waves: WAVES }), protected: false } }));
    expect(result.imageUrl).toBe(WAVES);
    expect(result.imageAlt).toBe('Waves scarf in soft self-striping shades');
    expect(result.markdown).toContain(`![Waves scarf in soft self-striping shades](${WAVES})`);
    expect(result.html).toContain(`<img src="${WAVES}" alt="Waves scarf in soft self-striping shades">`);
  });

  test('missing or generic alt text is built from the verified section heading', async () => {
    const { result } = await externalResult(wpPost({ content: { rendered: htmlWithImages({ waves: WAVES, wavesAlt: '' }), protected: false } }));
    expect(result.imageUrl).toBe(WAVES);
    expect(result.imageAlt).toMatch(/^Waves Scarf/);
    expect(result.markdown).toContain(`![${result.imageAlt}](${WAVES})`);
  });

  test('an image hosted elsewhere is refused even with the best alt text; an off-site featured image falls back to an internal one', async () => {
    const external = 'https://cdn.othersite.example/ombre.jpg';
    const { result } = await externalResult(
      wpPost({
        _embedded: featuredMedia('https://i0.wp.com/crochet.example.test/featured.jpg'),
        content: { rendered: htmlWithImages({ waves: WAVES, external }), protected: false },
      })
    );
    expect(result.imageUrl).toBe(WAVES);
    expect(result.markdown).not.toContain('othersite');
    expect(result.markdown).not.toContain('i0.wp.com');
  });

  test('exact URL kept (query string included); the HTML attribute decodes to the same URL', async () => {
    const withQuery = `${SITE_URL}/wp-content/uploads/2026/10/featured-scarves.jpg?w=1200&h=800`;
    const { result } = await externalResult(wpPost({ _embedded: featuredMedia(withQuery) }));
    expect(result.imageUrl).toBe(withQuery);
    expect(result.markdown).toContain(`](${withQuery})`);
    const src = /<img src="([^"]+)"/.exec(result.html)?.[1] ?? '';
    expect(src.replace(/&amp;/g, '&')).toBe(withQuery);
  });

  test('no invented URL: every URL of the result is the permalink or an image really in the article', async () => {
    const { source, result } = await externalResult(
      wpPost({ _embedded: featuredMedia(FEATURED), content: { rendered: htmlWithImages({ intro: INTRO_IMG, waves: WAVES }), protected: false } })
    );
    const known = new Set([PERMALINK, ...source.imageCandidates.map((candidate) => candidate.url)]);
    const found = [...urlsIn(result.markdown), ...urlsIn(result.html)];
    expect(found).toContain(FEATURED);
    for (const url of found) expect(known.has(url), url).toBe(true);
  });

  test('all images invalid → summary without image and a warning', async () => {
    const { result } = await externalResult(
      wpPost({
        _embedded: featuredMedia('http://crochet.example.test/wp-content/uploads/featured.jpg'),
        content: { rendered: htmlWithImages({ external: 'https://cdn.othersite.example/ombre.jpg' }), protected: false },
      })
    );
    expect(result.imageUrl).toBeNull();
    expect(result.imageAlt).toBeNull();
    expect(result.markdown).not.toContain('![');
    expect(result.html).not.toContain('<img');
    expect(result.warnings).toContain(NO_IMAGE_WARNING);
  });

  test('URL checks: HTTPS, own site, no IP / local host, no signed or private storage URL, no credentials', () => {
    const site = mediumImageHosts(SITE_URL, false);
    expect(isPublicArticleImageUrl(FEATURED, site)).toBe(true);
    expect(isPublicArticleImageUrl('https://www.crochet.example.test/wp-content/uploads/a.jpg', site)).toBe(true);
    for (const refused of [
      'http://crochet.example.test/wp-content/uploads/a.jpg',
      'https://othersite.example/a.jpg',
      'https://crochet.example.test.evil.example/a.jpg',
      'https://192.168.1.10/a.jpg',
      'https://localhost/a.jpg',
      'https://wp.internal/a.jpg',
      'https://user:pass@crochet.example.test/a.jpg',
      `${SITE_URL}/a.jpg?X-Amz-Signature=abc`,
      `${SITE_URL}/a.jpg?token=abc`,
      'data:image/png;base64,AAAA',
      '/wp-content/uploads/a.jpg',
      // OmniFlow storage is not an allowed host for an existing post.
      'https://proj.supabase.co/storage/v1/object/public/wordpress-images/a.png',
      'https://media.n8nflow.org/images/wordpress/a.webp',
    ]) {
      expect(isPublicArticleImageUrl(refused, site), refused).toBe(false);
    }
    // OmniFlow article: its public storage is allowed too, never a signed / private object.
    const omniflow = mediumImageHosts(SITE_URL, true);
    expect(isPublicArticleImageUrl('https://proj.supabase.co/storage/v1/object/public/wordpress-images/a.png', omniflow)).toBe(true);
    expect(isPublicArticleImageUrl('https://media.n8nflow.org/images/wordpress/u/g/FEATURED.webp', omniflow)).toBe(true);
    expect(isPublicArticleImageUrl('https://proj.supabase.co/storage/v1/object/sign/wordpress-images/a.png?token=x', omniflow)).toBe(false);
    expect(isPublicArticleImageUrl('https://proj.supabase.co/storage/v1/object/authenticated/wordpress-images/a.png', omniflow)).toBe(false);
  });

  test('OmniFlow article: the WordPress featured image comes first when published, else the article’s own image', async () => {
    const storageFeatured = 'https://media.n8nflow.org/images/wordpress/user-1/gen/FEATURED.webp';
    const wp = fakeFetch(() => json(wpPost({ _embedded: featuredMedia(FEATURED) })));
    const source = await loadOmniflowArticleMediumSource(db({ article: { featured_image_url: storageFeatured } }).client, USER, GEN_ID, {
      fetchImpl: wp.fn,
    });
    expect(selectMediumImage(source.imageCandidates, source.imageHosts, source.title)?.url).toBe(FEATURED);

    const unpublished = await loadOmniflowArticleMediumSource(
      db({ article: { wp_post_id: null, featured_image_url: storageFeatured } }).client,
      USER,
      GEN_ID
    );
    const image = selectMediumImage(unpublished.imageCandidates, unpublished.imageHosts, unpublished.title);
    expect(image?.url).toBe(storageFeatured);
    expect(image?.origin).toBe('featured');
    expect(image?.altSource).toBe('generated');
    expect(image?.alt).toContain('10 Free Colorful Crochet Scarf Patterns');
  });

  test('OmniFlow article: an internal Markdown image in OmniFlow storage is used when there is no featured image', async () => {
    const internal = 'https://media.n8nflow.org/images/wordpress/user-1/gen/IMAGE_1.webp';
    const markdown = articleMarkdown().replace('## 2. Waves Scarf\n\n', `## 2. Waves Scarf\n\n![Waves scarf close-up](${internal})\n\n`);
    expect(markdown).toContain(internal);
    const source = await loadOmniflowArticleMediumSource(db({ article: { wp_post_id: null, content: markdown } }).client, USER, GEN_ID);
    const result = await generateMediumSummary(source, stubModel(modelAnswer()).fn);
    expect(result.imageUrl).toBe(internal);
    expect(result.markdown).toContain(`![Waves scarf close-up](${internal})`);
  });

  test('selection is pure: no candidate → null; ties keep document order', () => {
    const hosts = mediumImageHosts(SITE_URL, false);
    expect(selectMediumImage([], hosts, 'Title')).toBeNull();
    const candidate = (url: string): MediumImageCandidate => ({
      url,
      alt: 'Striped scarf',
      caption: '',
      origin: 'internal',
      sectionSubject: 'Striped Scarf',
      sectionKind: 'subject',
    });
    expect(selectMediumImage([candidate(`${SITE_URL}/a.jpg`), candidate(`${SITE_URL}/b.jpg`)], hosts, 'Scarves')?.url).toBe(`${SITE_URL}/a.jpg`);
  });

  test('panel shows the exact image URL; the preview renders the result HTML (with its image); nothing generated or re-hosted', () => {
    const view = read('components/social/medium-summary-result.tsx');
    expect(view).toContain("Image: {result.imageUrl ?? 'none'}");
    expect(view).toContain('<ArticleContent html={result.html} />');
    for (const path of ['lib/social/medium-image.ts', 'lib/social/medium-summary.ts']) {
      const code = read(path);
      expect(code).not.toMatch(/generateImage|uploadMedia|getMediaStorage|\.storage\.from\(/);
    }
  });
});
