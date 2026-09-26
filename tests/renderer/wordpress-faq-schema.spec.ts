import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyFaqSection, type FaqItem } from '@/lib/wordpress/faq-section';
import {
  extractFaqFromContent,
  MAX_FAQ_ITEMS,
  parseStoredFaq,
  resolveArticleFaq,
  saveArticleFaq,
  storedFaqSchema,
} from '@/lib/wordpress/faq-data';
import {
  buildFaqPageJsonLd,
  decideFaqSchema,
  faqTextToPlain,
  hasExistingFaqSchema,
  renderFaqJsonLdScript,
  serializeJsonLd,
} from '@/lib/wordpress/faq-schema';
import { exportToHtml, exportToHtmlForWordPress, exportToMarkdownForWordPress } from '@/lib/wordpress/export';
import { FAQ_SCHEMA_REMOVED_WARNING, sendArticleToWordPress, type SendArticleInput } from '@/lib/wordpress/publish-post';
import { getWordPressArticleByGenerationId } from '@/lib/queries/wordpress';
import type { WordPressSiteCredentials } from '@/lib/wordpress/rest-client';

/**
 * Structured FAQ + FAQPage JSON-LD (TASK-FIX-055). Offline: static
 * migration/route checks, in-memory Supabase stubs and a stubbed WordPress
 * `fetch` — no database, no network, no AI call.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const FAQ: FaqItem[] = [
  { question: 'Wie oft sollte man lüften?', answer: 'Zwei- bis dreimal täglich für **fünf Minuten**.' },
  { question: 'Welche Farben wirken gemütlich?', answer: 'Warme Töne wie Beige und Terrakotta.' },
];

const BODY = '# Wohnzimmer\n\nIntro paragraph.\n\n## Häufige Fehler\n\nZu viel Deko.\n\n{{FAQ}}\n\n## Fazit\n\nEnde.';

function article(content: string, faq: unknown) {
  return { content, faq };
}

// ---------------------------------------------------------------- migration

test('migration 039 adds a nullable jsonb faq column on wordpress_articles only', () => {
  const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  expect(files).toContain('039_add_wordpress_article_faq.sql');
  expect(files.filter((f) => f.startsWith('039_'))).toHaveLength(1);
  const sql = read('supabase/migrations/039_add_wordpress_article_faq.sql');
  const statements = sql.split('\n').filter((line) => line.trim() && !line.trim().startsWith('--'));
  expect(statements).toEqual(['ALTER TABLE wordpress_articles ADD COLUMN faq jsonb;']);
  expect(sql).not.toMatch(/NOT NULL|DEFAULT|UPDATE |DROP /);
});

// --------------------------------------------------------------- validation

test('stored FAQ structure is validated with Zod', () => {
  expect(storedFaqSchema.safeParse(FAQ).success).toBe(true);
  expect(storedFaqSchema.safeParse([]).success).toBe(true);
  expect(storedFaqSchema.safeParse([{ question: 'Q?' }]).success).toBe(false);
  expect(storedFaqSchema.safeParse([{ question: '  ', answer: 'A' }]).success).toBe(false);
  expect(storedFaqSchema.safeParse([{ question: 'Q?', answer: 42 }]).success).toBe(false);
  expect(storedFaqSchema.safeParse({ question: 'Q?', answer: 'A' }).success).toBe(false);
  const tooMany = Array.from({ length: MAX_FAQ_ITEMS + 1 }, (_, i) => ({ question: `Q${i}?`, answer: 'A' }));
  expect(storedFaqSchema.safeParse(tooMany).success).toBe(false);
});

test('parseStoredFaq: null stays null (legacy), invalid becomes [], valid is trimmed', () => {
  expect(parseStoredFaq(null)).toBeNull();
  expect(parseStoredFaq(undefined)).toBeNull();
  expect(parseStoredFaq('not json')).toEqual([]);
  expect(parseStoredFaq([{ question: '', answer: 'x' }])).toEqual([]);
  expect(parseStoredFaq([])).toEqual([]);
  expect(parseStoredFaq([{ question: ' Q? ', answer: ' A. ' }])).toEqual([{ question: 'Q?', answer: 'A.' }]);
});

// ------------------------------------------------------ single source + render

test('applyFaqSection renders one section and returns exactly the rendered items', () => {
  const result = applyFaqSection(BODY, FAQ, { language: 'de', useH3: true });
  expect(result.faq).toEqual(FAQ);
  expect(result.content.match(/^## Häufig gestellte Fragen$/gm)).toHaveLength(1);
  expect(result.content).not.toContain('{{FAQ}}');
  for (const item of FAQ) {
    expect(result.content.split(`### ${item.question}`)).toHaveLength(2);
    expect(result.content.split(item.answer)).toHaveLength(2);
  }
  // Placed before the conclusion, never duplicated.
  expect(result.content.indexOf('Häufig gestellte Fragen')).toBeLessThan(result.content.indexOf('## Fazit'));
});

test('applyFaqSection: disabled/empty FAQ or a model-written FAQ → nothing saved', () => {
  const disabled = applyFaqSection(BODY, [], { language: 'de', useH3: true });
  expect(disabled.faq).toEqual([]);
  expect(disabled.content).not.toMatch(/Häufig gestellte Fragen|\{\{FAQ\}\}/);

  const own = applyFaqSection('# T\n\n## FAQ\n\n### Old?\n\nOld.\n\n{{FAQ}}', FAQ, { language: 'en', useH3: true });
  expect(own.faq).toEqual([]);
  expect(own.content.match(/^## /gm)).toHaveLength(1);
});

// ------------------------------------------------------------- persistence

function stubArticlesTable(result: { error: { message: string } | null } | 'throw') {
  const writes: { table: string; values: unknown; id: unknown }[] = [];
  const supabase = {
    from: (table: string) => ({
      update: (values: unknown) => ({
        eq: async (_col: string, id: unknown) => {
          if (result === 'throw') throw new Error('network down');
          writes.push({ table, values, id });
          return result;
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { supabase, writes };
}

test('saveArticleFaq writes the validated array on the article row', async () => {
  const { supabase, writes } = stubArticlesTable({ error: null });
  await saveArticleFaq(supabase, 'art-1', FAQ, 'test');
  expect(writes).toEqual([{ table: 'wordpress_articles', values: { faq: FAQ }, id: 'art-1' }]);
});

test('saveArticleFaq never throws: missing column / network error / invalid data', async () => {
  const warn = console.warn;
  const logged: string[] = [];
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(' '));
  try {
    const missing = stubArticlesTable({ error: { message: "Could not find the 'faq' column" } });
    await expect(saveArticleFaq(missing.supabase, 'art-1', FAQ, 'test')).resolves.toBeUndefined();
    const down = stubArticlesTable('throw');
    await expect(saveArticleFaq(down.supabase, 'art-1', FAQ, 'test')).resolves.toBeUndefined();
    const invalid = stubArticlesTable({ error: null });
    await saveArticleFaq(invalid.supabase, 'art-1', [{ question: '', answer: '' }], 'test');
    expect(invalid.writes).toHaveLength(0);
  } finally {
    console.warn = warn;
  }
  expect(logged).toHaveLength(3);
  // No FAQ text in the logs.
  for (const line of logged) expect(line).not.toContain('lüften');
});

test('jsonb round trip: the stored value reads back as the same FAQ', async () => {
  const stored = JSON.parse(JSON.stringify(FAQ));
  const row = { id: 'art-1', generation_id: 'gen-1', content: 'x', faq: stored };
  const supabase = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: table === 'wordpress_generations' ? { id: 'gen-1' } : table === 'wordpress_articles' ? row : null }),
          order: async () => ({ data: [] }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  const { article } = await getWordPressArticleByGenerationId(supabase, 'gen-1');
  expect(parseStoredFaq(article?.faq)).toEqual(FAQ);
});

test('every generate route saves the FAQ after the article insert, never in it', () => {
  for (const [path, tag] of [
    ['app/api/wordpress/generate/route.ts', 'wordpress'],
    ['app/api/wordpress/generate-from-pins/route.ts', 'wordpress-from-pins'],
    ['app/api/wordpress/generate-from-url/route.ts', 'wordpress-from-url'],
  ]) {
    const source = read(path);
    expect(source).toContain(`await saveArticleFaq(supabase, article.id, result.faq, '${tag}');`);
    const insert = source.slice(source.indexOf(".from('wordpress_articles')"), source.indexOf('.select()'));
    expect(insert).not.toMatch(/\bfaq\b/);
  }
});

// -------------------------------------------------------- legacy fallback

test('legacy articles: FAQ read from the H3 section of the content, never written back', () => {
  const content = applyFaqSection(BODY, FAQ, { language: 'de', useH3: true }).content;
  expect(extractFaqFromContent(content)).toEqual(FAQ);
  // Plain-paragraph questions (includeH3 "Non") are ambiguous → no fallback.
  const plain = applyFaqSection(BODY, FAQ, { language: 'de', useH3: false }).content;
  expect(extractFaqFromContent(plain)).toBeNull();
  expect(extractFaqFromContent('# T\n\n## Intro\n\nText.')).toBeNull();
  expect(extractFaqFromContent('# T\n\n## FAQ\n\n### Q without answer?\n\n## Fazit\n\nx')).toBeNull();
});

test('resolveArticleFaq: disabled, stored (even empty) wins, null falls back to content', () => {
  const content = applyFaqSection(BODY, FAQ, { language: 'de', useH3: true }).content;
  expect(resolveArticleFaq(article(content, FAQ), false)).toEqual({ items: [], source: 'none' });
  expect(resolveArticleFaq(article(content, FAQ), true)).toEqual({ items: FAQ, source: 'stored' });
  expect(resolveArticleFaq(article(content, []), null)).toEqual({ items: [], source: 'none' });
  expect(resolveArticleFaq(article(content, { bad: true }), null)).toEqual({ items: [], source: 'none' });
  expect(resolveArticleFaq(article(content, null), null)).toEqual({ items: FAQ, source: 'content' });
  // Row read before migration 039: no `faq` key at all.
  expect(resolveArticleFaq({ content }, null).source).toBe('content');
  expect(resolveArticleFaq({ content: '# T\n\nNo FAQ.' }, null)).toEqual({ items: [], source: 'none' });
});

// ---------------------------------------------------------------- JSON-LD

test('FAQPage JSON-LD holds only the saved Q/A, as plain text, with no URL but @context', () => {
  const withLink: FaqItem[] = [{ question: 'Where?', answer: 'See [this guide](https://evil.example/x) and ![img](https://img.example/a.png).' }];
  const jsonLd = buildFaqPageJsonLd([...FAQ, ...withLink]);
  expect(jsonLd).toEqual({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: FAQ[0].question, acceptedAnswer: { '@type': 'Answer', text: 'Zwei- bis dreimal täglich für fünf Minuten.' } },
      { '@type': 'Question', name: FAQ[1].question, acceptedAnswer: { '@type': 'Answer', text: FAQ[1].answer } },
      { '@type': 'Question', name: 'Where?', acceptedAnswer: { '@type': 'Answer', text: 'See this guide and .' } },
    ],
  });
  const urls = JSON.stringify(jsonLd).match(/https?:\/\/[^"\s]+/g);
  expect(urls).toEqual(['https://schema.org']);
  expect(buildFaqPageJsonLd([])).toBeNull();
});

test('JSON-LD is escaped so no answer can break out of the <script>', () => {
  const hostile: FaqItem[] = [{ question: 'A & B?', answer: 'x </script><script>alert(1)</script> <!-- \u2028 y' }];
  const script = renderFaqJsonLdScript(hostile)!;
  const inner = script.slice('<script type="application/ld+json">'.length, -'</script>'.length);
  expect(script.match(/<\/script>/gi)).toHaveLength(1);
  expect(inner).not.toMatch(/[<>&\u2028\u2029]/);
  const parsed = JSON.parse(inner);
  expect(parsed.mainEntity[0].name).toBe('A & B?');
  // HTML tags are stripped from the answer text, the rest survives.
  expect(parsed.mainEntity[0].acceptedAnswer.text).toContain('alert(1)');
  expect(JSON.parse(serializeJsonLd({ s: '<&>' }))).toEqual({ s: '<&>' });
});

test('an existing FAQ block or FAQPage schema is detected', () => {
  expect(hasExistingFaqSchema('<!-- wp:rank-math/faq-block {"questions":[]} -->')).toBe(true);
  expect(hasExistingFaqSchema('<div class="wp-block-rank-math-faq-block rank-math-faq">')).toBe(true);
  expect(hasExistingFaqSchema('<script type="application/ld+json">{"@type": "FAQPage"}</script>')).toBe(true);
  expect(hasExistingFaqSchema('<h2>Häufig gestellte Fragen</h2><h3>Q?</h3><p>A.</p>')).toBe(false);
});

test('decideFaqSchema: absent, empty, invalid, disabled, existing, not visible → no schema', () => {
  const content = applyFaqSection(BODY, FAQ, { language: 'de', useH3: true }).content;
  const html = exportToHtmlForWordPress({ content });
  const noFaqContent = applyFaqSection(BODY, [], { language: 'de', useH3: true }).content;

  expect(decideFaqSchema({ article: article(content, FAQ), includeFaq: false, html })).toEqual({ status: 'skipped', reason: 'disabled' });
  expect(decideFaqSchema({ article: article(content, []), includeFaq: true, html })).toEqual({ status: 'skipped', reason: 'no_faq' });
  expect(decideFaqSchema({ article: article(content, 'garbage'), includeFaq: true, html })).toEqual({ status: 'skipped', reason: 'no_faq' });
  expect(
    decideFaqSchema({ article: article(noFaqContent, null), includeFaq: null, html: exportToHtmlForWordPress({ content: noFaqContent }) })
  ).toEqual({ status: 'skipped', reason: 'no_faq' });
  expect(
    decideFaqSchema({ article: article(content, FAQ), includeFaq: true, html: `${html}<!-- wp:rank-math/faq-block -->` })
  ).toEqual({ status: 'skipped', reason: 'existing_schema' });
  // Stored FAQ that the visible content doesn't show → schema would not match the page.
  expect(decideFaqSchema({ article: article(noFaqContent, FAQ), includeFaq: true, html })).toEqual({ status: 'skipped', reason: 'not_visible' });
});

test('decideFaqSchema: one FAQPage for stored and legacy-fallback articles', () => {
  const content = applyFaqSection(BODY, FAQ, { language: 'de', useH3: true }).content;
  const html = exportToHtmlForWordPress({ content });
  for (const faq of [FAQ, null]) {
    const decision = decideFaqSchema({ article: article(content, faq), includeFaq: null, html });
    expect(decision.status).toBe('add');
    if (decision.status !== 'add') continue;
    expect(decision.script.match(/FAQPage/g)).toHaveLength(1);
    expect(decision.script).toBe(renderFaqJsonLdScript(FAQ));
  }
});

test('the visible FAQ matches the schema text once an external link lands in an answer', () => {
  const content = applyFaqSection(BODY, FAQ, { language: 'de', useH3: true }).content.replace(
    'Warme Töne',
    '[Warme Töne](https://source.example/farben)'
  );
  const decision = decideFaqSchema({ article: article(content, FAQ), includeFaq: true, html: exportToHtmlForWordPress({ content }) });
  expect(decision.status).toBe('add');
  expect(faqTextToPlain(content)).toContain(faqTextToPlain(FAQ[1].answer));
});

// ------------------------------------------------------------------ exports

test('HTML and Markdown exports are unchanged: one visible FAQ, no JSON-LD', () => {
  const content = applyFaqSection(BODY, FAQ, { language: 'de', useH3: true }).content;
  for (const out of [exportToMarkdownForWordPress({ content }), exportToHtml({ content }), exportToHtmlForWordPress({ content })]) {
    expect(out).not.toContain('application/ld+json');
    expect(out.match(/Häufig gestellte Fragen/g)).toHaveLength(1);
  }
});

// -------------------------------------------------------------- publishing

const SITE: WordPressSiteCredentials = { siteUrl: 'https://blog.example.test', username: 'editor', password: 'x' };
const BASE = 'https://blog.example.test/wp-json';

function installFakeSite(opts: { kses?: boolean; noRaw?: boolean; rankMath?: 'ok' | 'fail' } = {}) {
  const posts: { url: string; content: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const path = url.replace(BASE, '');
    const reply = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

    if (method === 'GET' && path.startsWith('/wp/v2/tags?')) return reply([{ id: 7, name: 'wohnzimmer' }]);
    if (method === 'POST' && path === '/wp/v2/tags') return reply({ id: 8, name: body.name }, 201);
    if (method === 'POST' && path.startsWith('/wp/v2/posts')) {
      posts.push({ url: path, content: body.content });
      // kses without unfiltered_html: tags stripped, inner text kept.
      const saved = opts.kses ? String(body.content).replace(/<\/?script[^>]*>/g, '') : body.content;
      const id = Number(/\/posts\/(\d+)$/.exec(path)?.[1] ?? 501);
      return reply({ id, link: `https://blog.example.test/?p=${id}`, status: body.status, ...(opts.noRaw ? {} : { content: { raw: saved } }) });
    }
    if (method === 'GET' && path === '/rankmath/v1') return reply({ routes: { '/rankmath/v1/updateMeta': { methods: ['POST'] } } });
    if (method === 'POST' && path === '/rankmath/v1/updateMeta') {
      return opts.rankMath === 'fail' ? reply({ message: 'Sorry' }, 403) : reply(true);
    }
    return reply({ message: `unexpected ${method} ${path}` }, 500);
  }) as typeof fetch;
  return { posts, restore: () => (globalThis.fetch = original) };
}

const CONTENT = applyFaqSection(BODY, FAQ, { language: 'de', useH3: true }).content;
const SCRIPT = renderFaqJsonLdScript(FAQ)!;

function publishInput(overrides: Partial<SendArticleInput> = {}): SendArticleInput {
  return {
    article: { id: 'article-1', title: 'Wohnzimmer', meta_title: 'Wohnzimmer', slug: 'wohnzimmer', meta_description: 'Desc.', wp_post_id: null },
    generation: { keyword: 'Wohnzimmer', source_type: 'keyword', seo_keywords: null, status: 'completed' },
    html: exportToHtmlForWordPress({ content: CONTENT }),
    status: 'draft',
    faqSchema: SCRIPT,
    ...overrides,
  };
}

async function silenced<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const warn = console.warn;
  const logs: string[] = [];
  console.warn = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  try {
    return { result: await fn(), logs };
  } finally {
    console.warn = warn;
  }
}

test('publish: one FAQPage script after the body, Rank Math meta unchanged', async () => {
  const site = installFakeSite();
  try {
    const { result } = await silenced(() => sendArticleToWordPress(SITE, publishInput()));
    expect(result.faqSchema).toBe('added');
    expect(result.rankMath.status).toBe('saved');
    expect(site.posts).toHaveLength(1);
    const sent = site.posts[0].content;
    expect(sent.match(/application\/ld\+json/g)).toHaveLength(1);
    expect(sent.match(/FAQPage/g)).toHaveLength(1);
    expect(sent.trimEnd().endsWith(SCRIPT)).toBe(true);
    // Visible FAQ still there exactly once, script outside of it.
    expect(sent.match(/Häufig gestellte Fragen/g)).toHaveLength(1);
    expect(result.warnings).not.toContain(FAQ_SCHEMA_REMOVED_WARNING);
  } finally {
    site.restore();
  }
});

test('publish: republishing the same post never stacks a second schema', async () => {
  const site = installFakeSite();
  try {
    const input = publishInput({ article: { ...publishInput().article, wp_post_id: 501 } });
    await silenced(() => sendArticleToWordPress(SITE, input));
    await silenced(() => sendArticleToWordPress(SITE, input));
    for (const post of site.posts) expect(post.content.match(/FAQPage/g)).toHaveLength(1);
    expect(site.posts.every((p) => p.url === '/wp/v2/posts/501')).toBe(true);
  } finally {
    site.restore();
  }
});

test('publish: script filtered by WordPress → re-sent without it, no visible JSON, warning', async () => {
  for (const opts of [{ kses: true }, { noRaw: true }]) {
    const site = installFakeSite(opts);
    try {
      const { result, logs } = await silenced(() => sendArticleToWordPress(SITE, publishInput()));
      expect(result.faqSchema).toBe('removed');
      expect(result.warnings).toContain(FAQ_SCHEMA_REMOVED_WARNING);
      expect(site.posts).toHaveLength(2);
      expect(site.posts[1].url).toBe('/wp/v2/posts/501');
      expect(site.posts[1].content).not.toContain('FAQPage');
      expect(site.posts[1].content).not.toContain('mainEntity');
      expect(logs.join('\n')).toMatch(/step=faq_schema article=article-1 post=501/);
      expect(logs.join('\n')).not.toContain('lüften');
    } finally {
      site.restore();
    }
  }
});

test('publish: no schema when none is decided; Rank Math failure never blocks the post', async () => {
  const site = installFakeSite({ rankMath: 'fail' });
  try {
    const { result } = await silenced(() => sendArticleToWordPress(SITE, publishInput({ faqSchema: null })));
    expect(result.faqSchema).toBe('not_added');
    expect(result.rankMath.status).toBe('failed');
    expect(result.post.id).toBe(501);
    expect(site.posts[0].content).toBe(publishInput().html);

    const withSchema = await silenced(() => sendArticleToWordPress(SITE, publishInput()));
    expect(withSchema.result.faqSchema).toBe('added');
    expect(withSchema.result.rankMath.status).toBe('failed');
  } finally {
    site.restore();
  }
});

test('publish route: schema decided from the saved FAQ and include_faq, after internal links', () => {
  const route = read('app/api/wordpress/[id]/publish/route.ts');
  expect(route).toContain('decideFaqSchema({ article, includeFaq: generation.include_faq, html })');
  expect(route).toContain("faqSchema: faqDecision.status === 'add' ? faqDecision.script : null");
  const orchestrator = read('lib/wordpress/publish-post.ts');
  expect(orchestrator.indexOf('addInternalLinks(')).toBeLessThan(orchestrator.indexOf('const faqSchema = input.faqSchema'));
});
