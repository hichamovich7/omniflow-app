import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { baseExport, prepareArticleExport, type PrepareExportInput } from '@/lib/wordpress/export-with-links';
import {
  exportCopyFeedback,
  INTERNAL_LINKS_EXPORT_FAILED_MESSAGE,
  NO_PUBLISHED_POSTS_MESSAGE,
  NO_RELEVANT_POSTS_MESSAGE,
} from '@/lib/wordpress/export-copy-feedback';
import { insertInternalLinksInMarkdown, type InternalLinkContext } from '@/lib/wordpress/internal-links';
import { exportArticleSchema } from '@/lib/validations/wordpress-export';
import type { WordPressSiteCredentials } from '@/lib/wordpress/rest-client';

/**
 * Copy Markdown / Copy HTML with automatic internal links (TASK-FIX-052).
 * Offline: WordPress is a stubbed global fetch — no network, no database,
 * no AI call.
 */

const SITE: WordPressSiteCredentials = {
  siteUrl: 'https://blog.example.test',
  username: 'editor',
  password: 'abcd EFGH ijkl MNOP',
};
const BASE = 'https://blog.example.test/wp-json';
const ROOT = join(__dirname, '..', '..');

interface RawPost {
  id: number;
  link: string;
  slug: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  categories: number[];
  tags: number[];
  status: string;
}

function post(id: number, title: string, extra: { categories?: number[]; tags?: number[]; link?: string } = {}): RawPost {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id,
    link: extra.link ?? `https://blog.example.test/${slug}/`,
    slug,
    title: { rendered: title },
    excerpt: { rendered: '' },
    categories: extra.categories ?? [],
    tags: extra.tags ?? [],
    status: 'publish',
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

interface Call {
  method: string;
  url: string;
}

function installFakeSite(fake: { posts?: RawPost[]; fail?: boolean; tags?: { id: number; name: string }[] } = {}) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    const path = url.replace(BASE, '');
    if (method === 'GET' && path.startsWith('/wp/v2/posts?')) {
      if (fake.fail) return json({ code: 'rest_error', message: 'Down' }, 503);
      const posts = fake.posts ?? [];
      return json(posts, 200, { 'X-WP-TotalPages': '1' });
    }
    if (method === 'GET' && path.startsWith('/wp/v2/tags?')) {
      const search = decodeURIComponent(new URL(url).searchParams.get('search') ?? '').toLowerCase();
      return json((fake.tags ?? []).filter((t) => t.name.toLowerCase().includes(search)));
    }
    return json({ code: 'unexpected', message: `${method} ${path}` }, 500);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
    writes: () => calls.filter((c) => c.method !== 'GET'),
    postListCalls: () => calls.filter((c) => c.url.includes('/wp/v2/posts?')),
  };
}

let site: ReturnType<typeof installFakeSite> | undefined;
test.afterEach(() => {
  site?.restore();
  site = undefined;
});

const CONTENT = [
  '# Cozy Living Room Ideas for Small Apartments',
  '',
  'A cozy living room starts with warm light and soft textiles.',
  '',
  '## Living room decor that feels warm',
  '',
  'Good living room decor mixes wood, wool and plants.',
  '',
  '- A small reading nook near the window changes everything.',
  '- Keep the cozy living room clutter-free.',
  '',
  '![reading nook by the window](https://cdn.example.test/reading-nook.png)',
  '',
  '<figure><img src="https://cdn.example.test/decor.png" alt="living room decor"><figcaption>Living room decor</figcaption></figure>',
  '',
  'Plants add life. See [this guide on indoor plants](https://other.example.com/plants) for tips on a reading nook.',
  '',
  '> A cozy living room is a feeling, not a budget.',
  '',
  '| Item | Why |',
  '| --- | --- |',
  '| Reading nook | living room decor |',
  '',
  '```',
  'cozy living room in a code block',
  '```',
  '',
  '## Frequently Asked Questions',
  '',
  '### How do I choose living room decor?',
  '',
  'Pick living room decor that matches your light.',
  '',
].join('\n');

const PUBLISHED = [
  post(11, 'The Cozy Living Room Checklist', { categories: [7] }),
  post(12, 'Living Room Decor Basics'),
  post(13, 'How to Build a Reading Nook'),
];

function exportInput(overrides: Partial<PrepareExportInput> = {}): PrepareExportInput {
  return {
    article: {
      content: CONTENT,
      title: 'Cozy Living Room Ideas for Small Apartments',
      slug: 'cozy-living-room-ideas',
      wp_post_id: null,
    },
    generation: {
      keyword: 'cozy living room',
      source_type: 'keyword',
      seo_keywords: 'living room decor, reading nook',
      status: 'completed',
      article_size: 'medium',
    },
    pins: null,
    categoryIds: [7],
    format: 'html',
    includeInternalLinks: true,
    ...overrides,
  };
}

function htmlHrefs(html: string): string[] {
  return [...html.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
}

function mdLinks(md: string): { text: string; url: string }[] {
  return [...md.matchAll(/(?<!!)\[([^\]]*)\]\(([^)]*)\)/g)].map((m) => ({ text: m[1], url: m[2] }));
}

// ---------------------------------------------------------------------------

test.describe('HTML export', () => {
  test('adds valid HTML internal links', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const result = await prepareArticleExport(SITE, exportInput());
    expect(result.internalLinks.status).toBe('inserted');
    expect(result.internalLinks.insertedCount).toBe(3);
    expect(result.content).toContain(
      '<p>A <a href="https://blog.example.test/the-cozy-living-room-checklist/">cozy living room</a> starts'
    );
    expect(htmlHrefs(result.content)).toContain('https://blog.example.test/living-room-decor-basics/');
    expect(result.content).not.toContain('<h1>');
  });

  test('keeps external links, images, figures, tables, quotes, code, headings and FAQ unchanged', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const original = baseExport({ content: CONTENT }, 'html');
    const result = await prepareArticleExport(SITE, exportInput());
    const untouched = (html: string) => [
      /<p><img[^>]*><\/p>/.exec(html)?.[0],
      /<figure>[\s\S]*?<\/figure>/.exec(html)?.[0],
      /<p>Plants add life[\s\S]*?<\/p>/.exec(html)?.[0],
      /<blockquote>[\s\S]*?<\/blockquote>/.exec(html)?.[0],
      /<table>[\s\S]*?<\/table>/.exec(html)?.[0],
      /<pre>[\s\S]*?<\/pre>/.exec(html)?.[0],
      ...(html.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/g) ?? []),
      html.slice(html.indexOf('<h2>Frequently Asked Questions</h2>')),
    ];
    expect(untouched(result.content)).toEqual(untouched(original));
    expect(untouched(original).every((part) => part !== undefined)).toBe(true);
  });
});

test.describe('Markdown export', () => {
  test('adds Markdown links and never HTML', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const original = baseExport({ content: CONTENT }, 'markdown');
    const result = await prepareArticleExport(SITE, exportInput({ format: 'markdown' }));
    expect(result.internalLinks.insertedCount).toBe(3);
    expect(result.content).toContain('A [cozy living room](https://blog.example.test/the-cozy-living-room-checklist/) starts');
    expect(result.content).toContain('Good [living room decor](https://blog.example.test/living-room-decor-basics/) mixes');
    expect(result.content).toContain('- A small [reading nook](https://blog.example.test/how-to-build-a-reading-nook/) near');
    expect(result.content).not.toContain('<a ');
    expect(result.content).not.toContain('href=');
    // Only the three link insertions differ from the original.
    expect(result.content.replace(/\[([^\]]*)\]\(https:\/\/blog\.example\.test\/[^)]*\)/g, '$1')).toBe(original);
  });

  test('keeps images, figures, external links, headings, quotes, tables, code and FAQ unchanged', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const result = await prepareArticleExport(SITE, exportInput({ format: 'markdown' }));
    for (const line of [
      '![reading nook by the window](https://cdn.example.test/reading-nook.png)',
      '<figure><img src="https://cdn.example.test/decor.png" alt="living room decor"><figcaption>Living room decor</figcaption></figure>',
      'Plants add life. See [this guide on indoor plants](https://other.example.com/plants) for tips on a reading nook.',
      '## Living room decor that feels warm',
      '> A cozy living room is a feeling, not a budget.',
      '| Reading nook | living room decor |',
      'cozy living room in a code block',
      '### How do I choose living room decor?',
      'Pick living room decor that matches your light.',
    ]) {
      expect(result.content.split('\n')).toContain(line);
    }
  });

  test('one link per paragraph, no duplicate URL or post', () => {
    const md = [
      'Our cozy living room guide covers living room decor and a reading nook.',
      '',
      'Another cozy living room trick.',
      '',
      'Every cozy living room has texture.',
    ].join('\n');
    const ctx = context();
    const result = insertInternalLinksInMarkdown(md, ctx, [
      candidate(1, 'The Cozy Living Room Checklist'),
      candidate(2, 'Living Room Decor Basics'),
      candidate(3, 'How to Build a Reading Nook'),
    ]);
    const perParagraph = result.markdown.split('\n\n').map((p) => mdLinks(p).length);
    expect(perParagraph.every((n) => n <= 1)).toBe(true);
    const urls = mdLinks(result.markdown).map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(new Set(result.links.map((l) => l.postId)).size).toBe(result.links.length);
  });

  test('respects the maximum: 3 for small, 5 for medium and large', () => {
    const md = Array.from({ length: 10 }, (_, i) => `Paragraph ${i} about topic${i} planning basics.`).join('\n\n');
    const candidates = Array.from({ length: 10 }, (_, i) =>
      candidate(100 + i, `Topic${i} planning basics`, { categories: [7] })
    );
    const base = { primaryKeyword: null, seoKeywords: [], title: 'Planning basics' };
    expect(insertInternalLinksInMarkdown(md, context({ ...base, articleSize: 'small' }), candidates).links).toHaveLength(3);
    expect(insertInternalLinksInMarkdown(md, context({ ...base, articleSize: 'medium' }), candidates).links).toHaveLength(5);
    expect(insertInternalLinksInMarkdown(md, context({ ...base, articleSize: 'large' }), candidates).links).toHaveLength(5);
  });

  test('skips a paragraph that already holds a link, autolink or bare URL', () => {
    const md = [
      'See <https://x.example.com> for a cozy living room.',
      '',
      'Visit https://y.example.com/a about a cozy living room.',
      '',
      'Read [our story](https://blog.example.test/story/) on a cozy living room.',
    ].join('\n');
    expect(insertInternalLinksInMarkdown(md, context(), [candidate(1, 'The Cozy Living Room Checklist')]).markdown).toBe(md);
  });

  test('never links inside inline code, setext headings, HTML blocks or indented code', () => {
    const md = [
      'Use `cozy living room` as a CSS class.',
      '',
      'Cozy living room',
      '================',
      '',
      '<div>cozy living room</div>',
      '',
      '    cozy living room indented code',
    ].join('\n');
    expect(insertInternalLinksInMarkdown(md, context(), [candidate(1, 'The Cozy Living Room Checklist')]).markdown).toBe(md);
  });

  test('FAQ without H3 (plain paragraphs) is excluded, a later H2 is eligible again', () => {
    const md = ['## FAQ', '', 'About living room decor.', '', '## Conclusion', '', 'Enjoy your living room decor.'].join('\n');
    const result = insertInternalLinksInMarkdown(md, context(), [candidate(2, 'Living Room Decor Basics')]);
    expect(result.markdown).toBe(
      ['## FAQ', '', 'About living room decor.', '', '## Conclusion', '', 'Enjoy your [living room decor](https://blog.example.test/living-room-decor-basics/).'].join('\n')
    );
  });

  test('encodes parentheses in the Markdown URL', () => {
    const c = candidate(1, 'The Cozy Living Room Checklist', { url: 'https://blog.example.test/a_(b)/' });
    const result = insertInternalLinksInMarkdown('A cozy living room.', context({ seoKeywords: [] }), [c]);
    expect(result.markdown).toBe('A [cozy living room](https://blog.example.test/a_%28b%29/).');
  });
});

test.describe('option, empty blog and failures', () => {
  for (const format of ['html', 'markdown'] as const) {
    test(`${format}: option disabled → original export, WordPress never called`, async () => {
      site = installFakeSite({ posts: PUBLISHED });
      const result = await prepareArticleExport(SITE, exportInput({ format, includeInternalLinks: false }));
      expect(result.content).toBe(baseExport({ content: CONTENT }, format));
      expect(result.internalLinks.status).toBe('skipped');
      expect(site.calls).toHaveLength(0);
      expect(exportCopyFeedback(format === 'html' ? 'HTML' : 'Markdown', { kind: 'off' }).success).toBe(
        `${format === 'html' ? 'HTML' : 'Markdown'} copied without internal links.`
      );
    });
  }

  test('no WordPress site → original export, skipped', async () => {
    const result = await prepareArticleExport(null, exportInput());
    expect(result.content).toBe(baseExport({ content: CONTENT }, 'html'));
    expect(result.internalLinks.status).toBe('skipped');
  });

  test('new blog with no published article → original export and informative message', async () => {
    site = installFakeSite({ posts: [] });
    const result = await prepareArticleExport(SITE, exportInput({ format: 'markdown' }));
    expect(result.content).toBe(baseExport({ content: CONTENT }, 'markdown'));
    expect(result.internalLinks).toEqual({ status: 'none', insertedCount: 0, links: [], warnings: [] });
    expect(result.availablePosts).toBe(0);
    expect(exportCopyFeedback('Markdown', { kind: 'linked', report: result.internalLinks, availablePosts: 0 })).toEqual({
      success: 'Markdown copied without internal links.',
      info: NO_PUBLISHED_POSTS_MESSAGE,
      warnings: [],
    });
  });

  test('no relevant article → original export', async () => {
    site = installFakeSite({ posts: [post(40, 'Tax Tips for Freelancers'), post(41, 'Quarterly Budget Review')] });
    const result = await prepareArticleExport(SITE, exportInput());
    expect(result.content).toBe(baseExport({ content: CONTENT }, 'html'));
    expect(result.internalLinks.status).toBe('none');
    expect(result.availablePosts).toBe(2);
    expect(exportCopyFeedback('HTML', { kind: 'linked', report: result.internalLinks, availablePosts: 2 }).info).toBe(
      NO_RELEVANT_POSTS_MESSAGE
    );
  });

  test('WordPress API error → original export, non-blocking warning', async () => {
    site = installFakeSite({ fail: true });
    const result = await prepareArticleExport(SITE, exportInput({ format: 'markdown' }));
    expect(result.content).toBe(baseExport({ content: CONTENT }, 'markdown'));
    expect(result.internalLinks.status).toBe('failed');
    expect(exportCopyFeedback('Markdown', { kind: 'linked', report: result.internalLinks, availablePosts: 0 })).toEqual({
      success: 'Markdown copied without internal links.',
      info: null,
      warnings: [INTERNAL_LINKS_EXPORT_FAILED_MESSAGE],
    });
    // A failed export request (network / HTTP error) gives the same feedback.
    expect(exportCopyFeedback('HTML', { kind: 'failed' }).warnings).toEqual([INTERNAL_LINKS_EXPORT_FAILED_MESSAGE]);
  });

  test('success message counts the links', () => {
    const report = { status: 'inserted' as const, insertedCount: 3, links: [], warnings: [] };
    expect(exportCopyFeedback('HTML', { kind: 'linked', report, availablePosts: 9 }).success).toBe(
      'HTML copied with 3 internal links.'
    );
    expect(
      exportCopyFeedback('Markdown', { kind: 'linked', report: { ...report, insertedCount: 1 }, availablePosts: 9 }).success
    ).toBe('Markdown copied with 1 internal link.');
  });

  test('never logs content or credentials on failure', async () => {
    site = installFakeSite({ fail: true });
    const logged: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => logged.push(args.map(String).join(' '));
    try {
      await prepareArticleExport(SITE, exportInput());
    } finally {
      console.warn = originalWarn;
    }
    const all = logged.join('\n');
    expect(all).toContain('[wordpress export] step=internal_links_fetch http=503');
    expect(all).not.toContain('reading nook');
    expect(all).not.toContain(SITE.password);
  });
});

test.describe('selection rules shared with publish', () => {
  test('excludes the current article', async () => {
    site = installFakeSite({ posts: [post(77, 'The Cozy Living Room Checklist'), ...PUBLISHED.slice(1)] });
    const result = await prepareArticleExport(
      SITE,
      exportInput({ article: { ...exportInput().article, wp_post_id: 77 } })
    );
    expect(result.internalLinks.links.map((l) => l.postId)).not.toContain(77);
    expect(result.content).not.toContain('the-cozy-living-room-checklist');
  });

  test('ignores posts outside the configured site', async () => {
    site = installFakeSite({
      posts: [post(90, 'The Cozy Living Room Checklist', { link: 'https://evil.example.com/cozy/' })],
    });
    const result = await prepareArticleExport(SITE, exportInput());
    expect(result.content).not.toContain('evil.example.com');
    expect(result.internalLinks.status).toBe('none');
  });

  test('tags are only looked up, never created, and nothing is written to WordPress', async () => {
    site = installFakeSite({ posts: [post(50, 'Warm Light for Living Spaces', { tags: [31] })], tags: [{ id: 31, name: 'reading nook' }] });
    const result = await prepareArticleExport(
      SITE,
      exportInput({ generation: { ...exportInput().generation, keyword: 'unrelated', seo_keywords: 'reading nook' }, categoryIds: [] })
    );
    expect(site.writes()).toEqual([]);
    expect(site.calls.some((c) => c.url.includes('/wp/v2/tags?search='))).toBe(true);
    // Shared tag (+2) + 2 topic words (+2) → linked, same rule as publish.
    expect(result.internalLinks.links.map((l) => l.postId)).toEqual([50]);
  });

  test('the stored article content is never modified', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const input = exportInput();
    const snapshot = JSON.stringify(input.article);
    await prepareArticleExport(SITE, input);
    await prepareArticleExport(SITE, { ...input, format: 'markdown' });
    expect(JSON.stringify(input.article)).toBe(snapshot);
    expect(input.article.content).toBe(CONTENT);
  });

  test('Keyword method: primary keyword from the user keyword', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const result = await prepareArticleExport(
      SITE,
      exportInput({ format: 'markdown', generation: { ...exportInput().generation, seo_keywords: null } })
    );
    expect(result.internalLinks.links[0]).toEqual({
      postId: 11,
      url: 'https://blog.example.test/the-cozy-living-room-checklist/',
      anchor: 'cozy living room',
    });
  });

  test('Pins method: source Pinterest keyword, never the pin-title label', async () => {
    site = installFakeSite({ posts: [post(21, 'Pin Title One Recap'), post(22, 'Reading Nook Lighting')] });
    const result = await prepareArticleExport(
      SITE,
      exportInput({
        format: 'markdown',
        article: { ...exportInput().article, content: '# T\n\nPin Title One recap here.\n\nA reading nook glows at night.\n' },
        generation: { keyword: 'Pin Title One + Pin Title Two', source_type: 'pins', seo_keywords: null, status: 'completed' },
        pins: { sourceKeyword: 'reading nook', pinKeywords: [] },
        categoryIds: [],
      })
    );
    expect(result.internalLinks.links.map((l) => l.postId)).toEqual([22]);
    expect(result.content).toContain('A [reading nook](https://blog.example.test/reading-nook-lighting/) glows');
  });

  test('URL method: resolved keyword', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const result = await prepareArticleExport(
      SITE,
      exportInput({
        article: { ...exportInput().article, content: '# T\n\nGood living room decor mixes wood and wool.\n' },
        generation: { keyword: 'living room decor', source_type: 'url', seo_keywords: null, status: 'completed' },
      })
    );
    expect(result.internalLinks.links.map((l) => l.postId)).toEqual([12]);
  });
});

test.describe('wiring', () => {
  test('the review page never computes internal links while rendering', () => {
    const page = readFileSync(join(ROOT, 'app/(dashboard)/wordpress/[id]/page.tsx'), 'utf8');
    expect(page).not.toMatch(/internal-links|export-with-links|fetchPublishedPostsPage|prepareArticleExport/);
    expect(page).toContain('internalLinksAvailable={!!wordpressSite}');
    // Copy buttons are rendered whether or not a site is connected.
    expect(page).not.toMatch(/wordpressSite \? \(\s*<PublishControl/);
  });

  test('the copy buttons call the export route only when the option is on', () => {
    const source = readFileSync(join(ROOT, 'components/wordpress/copy-export-buttons.tsx'), 'utf8');
    expect(source).toContain('/api/wordpress/${generationId}/export');
    expect(source).toContain('useState(true)'); // option on by default
    expect(source).toContain('Include internal links');
    expect(source).toMatch(/if \(!withLinks\) \{\s*try \{\s*await navigator\.clipboard\.writeText\(original\)/);
  });

  test('the export route validates input, auth and ownership and writes nothing', () => {
    const route = readFileSync(join(ROOT, 'app/api/wordpress/[id]/export/route.ts'), 'utf8');
    expect(route).toContain('supabase.auth.getUser()');
    expect(route).toContain('exportArticleSchema.safeParse');
    expect(route).toContain('generation.user_id !== user.id');
    expect(route).not.toMatch(/\.(update|insert|upsert|delete)\(/);
    expect(exportArticleSchema.safeParse({ format: 'pdf', includeInternalLinks: true }).success).toBe(false);
    expect(exportArticleSchema.safeParse({ format: 'html' }).success).toBe(false);
    expect(exportArticleSchema.safeParse({ format: 'markdown', includeInternalLinks: false }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------

function context(overrides: Partial<InternalLinkContext> = {}): InternalLinkContext {
  return {
    primaryKeyword: 'cozy living room',
    seoKeywords: ['living room decor', 'reading nook'],
    title: 'Cozy Living Room Ideas for Small Apartments',
    categoryIds: [7],
    tagIds: [],
    articleSize: 'medium',
    excludePostId: null,
    excludeSlug: null,
    ...overrides,
  };
}

function candidate(id: number, title: string, extra: { url?: string; categories?: number[] } = {}) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id,
    url: extra.url ?? `https://blog.example.test/${slug}/`,
    slug,
    title,
    excerpt: '',
    categories: extra.categories ?? [],
    tags: [],
  };
}
