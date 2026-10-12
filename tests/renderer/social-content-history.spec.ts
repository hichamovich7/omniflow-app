import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadOmniflowArticleMediumSource,
  loadPinterestGenerationMediumSource,
  loadWordPressPostMediumSource,
  SAVE_FAILED_WARNING,
  SAVE_UNAVAILABLE_WARNING,
  saveMediumSummary,
  type MediumSummaryResult,
} from '@/lib/social/medium-summary';
import {
  deleteSocialContentGeneration,
  getSocialContentGeneration,
  insertSocialContentGeneration,
  listSocialContentGenerations,
} from '@/lib/queries/social-content';
import {
  ACTIVE_SOCIAL_CONTENT_PLATFORMS,
  contentPreview,
  mediumSummaryRow,
  parseSocialContentFilters,
  periodStart,
  regenerateRequestFor,
  SOCIAL_CONTENT_PLATFORMS,
  sourceHref,
  type SocialContentSourceRef,
} from '@/lib/social/social-content';
import { mediumSummaryRequestSchema } from '@/lib/validations/medium-summary';
import { encryptSecret } from '@/lib/wordpress/crypto';

process.env.WORDPRESS_ENCRYPTION_KEY = 'a'.repeat(64);

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = 'user-1';
const OTHER = 'user-2';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_PROJECT = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '11111111-1111-4111-8111-111111111111';
const WP_GEN_ID = '33333333-3333-4333-8333-333333333333';
const PIN_GEN_ID = '55555555-5555-4555-8555-555555555555';
const SAVED_ID = '66666666-6666-4666-8666-666666666666';
const SITE_URL = 'https://crochet.example.test';
const PERMALINK = `${SITE_URL}/colorful-crochet-scarf-patterns/`;
const IMAGE = `${SITE_URL}/wp-content/uploads/featured.jpg`;

// ---------------------------------------------------------------------------
// Fake Supabase recording every call (filters, inserts, deletes)

type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: string;
  args: unknown[];
}

function fakeSupabase(tables: Record<string, Row[]>, options: { insertError?: { code: string } } = {}) {
  const calls: Call[] = [];
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    let mode: 'select' | 'insert' | 'delete' = 'select';
    let inserted: Row | null = null;
    const record = (op: string, ...args: unknown[]) => calls.push({ table, op, args });
    const result = () => {
      if (mode === 'insert') {
        return options.insertError ? { data: null, error: options.insertError } : { data: { id: SAVED_ID, ...inserted }, error: null };
      }
      if (mode === 'delete') {
        tables[table] = (tables[table] ?? []).filter((row) => !rows.includes(row));
      }
      return { data: rows, error: null, count: rows.length };
    };
    const builder = {
      select: (...args: unknown[]) => (record('select', ...args), builder),
      eq: (column: string, value: unknown) => (record('eq', column, value), (rows = rows.filter((r) => r[column] === value)), builder),
      neq: (column: string, value: unknown) => ((rows = rows.filter((r) => r[column] !== value)), builder),
      in: (column: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[column]))), builder),
      gte: (column: string, value: string) => (record('gte', column, value), (rows = rows.filter((r) => String(r[column]) >= value)), builder),
      order: () => builder,
      range: (from: number, to: number) => (record('range', from, to), builder),
      single: async () => {
        const out = result();
        if (mode === 'insert') return out;
        const first = (out.data as Row[])[0];
        return { data: first ?? null, error: first ? null : { message: 'no rows' } };
      },
      maybeSingle: async () => ({ data: (result().data as Row[])[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve(result()),
      insert: (row: Row) => (record('insert', row), (mode = 'insert'), (inserted = row), builder),
      update: () => (record('update'), builder),
      upsert: () => (record('upsert'), builder),
      delete: () => (record('delete'), (mode = 'delete'), builder),
    };
    return builder;
  }
  return { client: { from } as unknown as SupabaseClient, calls, tables };
}

const ARTICLE_MD = '## 1. Waves Scarf\n\nA simple repeat of taller and shorter stitches turns the rows into soft waves across the whole piece.';

function world(overrides: { pinGeneration?: Row; article?: Row } = {}) {
  return fakeSupabase({
    wordpress_generations: [{ id: WP_GEN_ID, user_id: USER, project_id: PROJECT_ID, status: 'completed', language: 'en', keyword: 'scarf' }],
    wordpress_articles: [
      {
        id: 'art-1',
        generation_id: WP_GEN_ID,
        status: 'completed',
        title: 'Colorful Crochet Scarf Patterns',
        meta_description: 'Scarves.',
        content: ARTICLE_MD,
        wp_post_id: 1527,
        featured_image_url: null,
        ...overrides.article,
      },
    ],
    wordpress_article_images: [],
    wordpress_sites: [
      { id: SITE_ID, project_id: PROJECT_ID, user_id: USER, site_url: SITE_URL, wp_username: 'editor', encrypted_application_password: encryptSecret('pw pw pw'), created_at: '' },
    ],
    projects: [
      { id: PROJECT_ID, user_id: USER, default_language: 'en' },
      { id: OTHER_PROJECT, user_id: USER, default_language: 'en' },
    ],
    generations: [
      {
        id: PIN_GEN_ID,
        user_id: USER,
        project_id: PROJECT_ID,
        source_type: 'omniflow_article',
        source_wordpress_generation_id: WP_GEN_ID,
        source_wordpress_site_id: null,
        source_wordpress_post_id: null,
        ...overrides.pinGeneration,
      },
    ],
  });
}

const wpPost = () => ({
  id: 1527,
  date: '2026-10-02T09:00:00',
  status: 'publish',
  link: PERMALINK,
  title: { rendered: 'Colorful Crochet Scarf Patterns' },
  excerpt: { rendered: '' },
  content: { rendered: `<h2>1. Waves Scarf</h2><p>${'A simple repeat of stitches turns the rows into soft waves. '.repeat(4)}</p>`, protected: false },
  categories: [],
  _embedded: {},
});

function fakeFetch() {
  const calls: Array<{ url: string; method: string }> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return new Response(JSON.stringify(wpPost()), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fn, calls };
}

const RESULT: MediumSummaryResult = {
  title: 'Bright Crochet Scarves',
  subtitle: 'A short tour.',
  markdown: `# Bright Crochet Scarves\n\n*A short tour.*\n\n![Scarves](${IMAGE})\n\nBody text.\n\n---\n\n**Want to explore the complete article?**\n[Read the full guide on our blog →](${PERMALINK})\n`,
  html: `<h1>Bright Crochet Scarves</h1>\n<img src="${IMAGE}" alt="Scarves">\n<p>Body text.</p>\n<hr>\n<p><a href="${PERMALINK}">Read the full guide on our blog →</a></p>\n`,
  wordCount: 412,
  ctaUrl: PERMALINK,
  imageUrl: IMAGE,
  imageAlt: 'Scarves',
  language: 'en',
  warnings: [],
};

function inserted(calls: Call[]): Row {
  const call = calls.find((c) => c.table === 'social_content_generations' && c.op === 'insert');
  expect(call, 'one insert into social_content_generations').toBeTruthy();
  return call!.args[0] as Row;
}

// ---------------------------------------------------------------------------

test.describe('Saving a Medium summary', () => {
  test('saves the summary with its project, platform, status, content, image and exact CTA — returns the id', async () => {
    const db = world();
    const source = await loadOmniflowArticleMediumSource(db.client, USER, WP_GEN_ID, { fetchImpl: fakeFetch().fn });
    const saved = await saveMediumSummary(db.client, USER, source, RESULT);
    expect(saved.id).toBe(SAVED_ID);
    expect(saved.warnings).toEqual([]);
    const row = inserted(db.calls);
    expect(row).toMatchObject({
      user_id: USER,
      project_id: PROJECT_ID,
      platform: 'medium',
      status: 'completed',
      title: RESULT.title,
      subtitle: RESULT.subtitle,
      content_markdown: RESULT.markdown,
      content_html: RESULT.html,
      word_count: 412,
      image_url: IMAGE,
      image_alt: 'Scarves',
      cta_url: PERMALINK,
      language: 'en',
    });
  });

  test('OmniFlow article: source generation, plus the published post on the user’s site', async () => {
    const db = world();
    const source = await loadOmniflowArticleMediumSource(db.client, USER, WP_GEN_ID, { fetchImpl: fakeFetch().fn });
    await saveMediumSummary(db.client, USER, source, RESULT);
    expect(inserted(db.calls)).toMatchObject({
      source_type: 'omniflow_article',
      source_wordpress_generation_id: WP_GEN_ID,
      source_wordpress_site_id: SITE_ID,
      source_wordpress_article_id: 1527,
      source_pinterest_generation_id: null,
      source_title: 'Colorful Crochet Scarf Patterns',
    });

    const unpublished = world({ article: { wp_post_id: null } });
    const local = await loadOmniflowArticleMediumSource(unpublished.client, USER, WP_GEN_ID);
    await saveMediumSummary(unpublished.client, USER, local, { ...RESULT, ctaUrl: null });
    expect(inserted(unpublished.calls)).toMatchObject({
      source_wordpress_generation_id: WP_GEN_ID,
      source_wordpress_site_id: null,
      source_wordpress_article_id: null,
      cta_url: null,
    });
  });

  test('existing WordPress post: project of the connected site, site id and post id', async () => {
    const db = world();
    const source = await loadWordPressPostMediumSource(db.client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: fakeFetch().fn });
    await saveMediumSummary(db.client, USER, source, RESULT);
    expect(inserted(db.calls)).toMatchObject({
      project_id: PROJECT_ID,
      source_type: 'external_wordpress_post',
      source_wordpress_generation_id: null,
      source_wordpress_site_id: SITE_ID,
      source_wordpress_article_id: 1527,
      source_pinterest_generation_id: null,
    });
  });

  test('Pinterest generation from an OmniFlow article: Pinterest id + the article source kept', async () => {
    const db = world();
    const source = await loadPinterestGenerationMediumSource(db.client, USER, PIN_GEN_ID, { fetchImpl: fakeFetch().fn });
    await saveMediumSummary(db.client, USER, source, RESULT);
    expect(inserted(db.calls)).toMatchObject({
      project_id: PROJECT_ID,
      source_type: 'pinterest_generation',
      source_pinterest_generation_id: PIN_GEN_ID,
      source_wordpress_generation_id: WP_GEN_ID,
      source_wordpress_site_id: SITE_ID,
      source_wordpress_article_id: 1527,
    });
  });

  test('Pinterest generation from an existing WordPress post: Pinterest id + site + post id', async () => {
    const db = world({
      pinGeneration: { source_type: 'external_wordpress_post', source_wordpress_generation_id: null, source_wordpress_site_id: SITE_ID, source_wordpress_post_id: 1527 },
    });
    const source = await loadPinterestGenerationMediumSource(db.client, USER, PIN_GEN_ID, { fetchImpl: fakeFetch().fn });
    await saveMediumSummary(db.client, USER, source, RESULT);
    expect(inserted(db.calls)).toMatchObject({
      source_type: 'pinterest_generation',
      source_pinterest_generation_id: PIN_GEN_ID,
      source_wordpress_generation_id: null,
      source_wordpress_site_id: SITE_ID,
      source_wordpress_article_id: 1527,
    });
  });

  test('Pinterest: keyword generation (no article), another user’s generation, or another project are refused', async () => {
    const keyword = world({ pinGeneration: { source_type: null, source_wordpress_generation_id: null } });
    await expect(loadPinterestGenerationMediumSource(keyword.client, USER, PIN_GEN_ID)).rejects.toMatchObject({ code: 'no_article_source', status: 422 });
    await expect(loadPinterestGenerationMediumSource(world({ pinGeneration: { user_id: OTHER } }).client, USER, PIN_GEN_ID)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(loadPinterestGenerationMediumSource(world({ pinGeneration: { project_id: OTHER_PROJECT } }).client, USER, PIN_GEN_ID, { fetchImpl: fakeFetch().fn })).rejects.toMatchObject({
      code: 'project_mismatch',
    });
    await expect(loadPinterestGenerationMediumSource(world().client, USER, '99999999-9999-4999-8999-999999999999')).rejects.toMatchObject({ code: 'not_found' });
  });

  test('the Pinterest source never brings a Pin URL: the CTA stays the validated permalink', async () => {
    const db = world();
    const source = await loadPinterestGenerationMediumSource(db.client, USER, PIN_GEN_ID, { fetchImpl: fakeFetch().fn });
    expect(source.permalink).toBe(PERMALINK);
    const select = db.calls.find((call) => call.table === 'generations' && call.op === 'select');
    expect(String(select?.args[0])).not.toMatch(/website_url|pinterest_url|link/);
    expect(mediumSummaryRow(USER, source.ref, { ...RESULT }).cta_url).toBe(PERMALINK);
  });

  test('a failed save never loses the summary: content returned, id null, clear warning', async () => {
    const failing = fakeSupabase({}, { insertError: { code: '23503' } });
    const ref: SocialContentSourceRef = {
      sourceType: 'omniflow_article',
      projectId: PROJECT_ID,
      wordpressGenerationId: WP_GEN_ID,
      wordpressSiteId: null,
      wordpressPostId: null,
      pinterestGenerationId: null,
      sourceTitle: 'Article',
    };
    const saved = await saveMediumSummary(failing.client, USER, { ref }, RESULT);
    expect(saved.id).toBeNull();
    expect(saved.markdown).toBe(RESULT.markdown);
    expect(saved.html).toBe(RESULT.html);
    expect(saved.warnings).toEqual([SAVE_FAILED_WARNING]);

    const missing = fakeSupabase({}, { insertError: { code: 'PGRST205' } });
    expect((await saveMediumSummary(missing.client, USER, { ref }, RESULT)).warnings).toEqual([SAVE_UNAVAILABLE_WARNING]);
    expect(await insertSocialContentGeneration(missing.client, mediumSummaryRow(USER, ref, RESULT))).toEqual({ ok: false, reason: 'migration_required' });
  });

  test('a post id is never saved without its site', () => {
    const row = mediumSummaryRow(
      USER,
      { sourceType: 'omniflow_article', projectId: PROJECT_ID, wordpressGenerationId: WP_GEN_ID, wordpressSiteId: null, wordpressPostId: 1527, pinterestGenerationId: null, sourceTitle: null },
      RESULT
    );
    expect(row.source_wordpress_article_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------

function savedRow(overrides: Row = {}): Row {
  return {
    id: SAVED_ID,
    user_id: USER,
    project_id: PROJECT_ID,
    platform: 'medium',
    status: 'completed',
    source_type: 'omniflow_article',
    source_wordpress_generation_id: WP_GEN_ID,
    source_wordpress_site_id: null,
    source_wordpress_article_id: null,
    source_pinterest_generation_id: null,
    source_title: 'Colorful Crochet Scarf Patterns',
    title: 'Bright Crochet Scarves',
    content_markdown: RESULT.markdown,
    content_html: RESULT.html,
    created_at: '2026-10-10T10:00:00.000Z',
    projects: { name: 'Crochet' },
    ...overrides,
  };
}

test.describe('Medium history — list, filters, detail, delete', () => {
  test('the list is scoped to the user and the platform; filters map to project / source / status / date', async () => {
    const db = fakeSupabase({
      social_content_generations: [
        savedRow(),
        savedRow({ id: 'b', project_id: OTHER_PROJECT }),
        savedRow({ id: 'c', user_id: OTHER }),
        savedRow({ id: 'd', platform: 'facebook' }),
        savedRow({ id: 'e', source_type: 'external_wordpress_post', created_at: '2026-08-01T10:00:00.000Z' }),
      ],
    });
    const now = new Date('2026-10-12T10:00:00.000Z');
    const all = await listSocialContentGenerations(db.client, USER, 'medium', parseSocialContentFilters({}), now);
    expect(all.items.map((item) => item.id)).toEqual([SAVED_ID, 'b', 'e']);

    const byProject = await listSocialContentGenerations(db.client, USER, 'medium', parseSocialContentFilters({ project: OTHER_PROJECT }), now);
    expect(byProject.items.map((item) => item.id)).toEqual(['b']);
    const bySource = await listSocialContentGenerations(db.client, USER, 'medium', parseSocialContentFilters({ source: 'external_wordpress_post' }), now);
    expect(bySource.items.map((item) => item.id)).toEqual(['e']);
    const byDate = await listSocialContentGenerations(db.client, USER, 'medium', parseSocialContentFilters({ period: '30d' }), now);
    expect(byDate.items.map((item) => item.id)).toEqual([SAVED_ID, 'b']);
    const byStatus = await listSocialContentGenerations(db.client, USER, 'medium', parseSocialContentFilters({ status: 'failed' }), now);
    expect(byStatus.items).toEqual([]);

    const userFilters = db.calls.filter((call) => call.op === 'eq' && call.args[0] === 'user_id');
    expect(userFilters.length).toBe(5);
  });

  test('filters: invalid values are ignored; pages of 20', () => {
    expect(parseSocialContentFilters({ project: 'nope', source: 'x', period: '1y', status: 'weird', page: '-3' })).toEqual({ page: 1 });
    expect(parseSocialContentFilters({ project: PROJECT_ID, source: 'all', page: '2' })).toEqual({ project: PROJECT_ID, page: 2 });
    expect(periodStart('7d', new Date('2026-10-12T00:00:00.000Z'))).toBe('2026-10-05T00:00:00.000Z');
    expect(periodStart(undefined)).toBeNull();
  });

  test('detail: only the caller’s own row', async () => {
    const db = fakeSupabase({ social_content_generations: [savedRow()] });
    expect((await getSocialContentGeneration(db.client, USER, SAVED_ID))?.title).toBe('Bright Crochet Scarves');
    expect(await getSocialContentGeneration(db.client, OTHER, SAVED_ID)).toBeNull();
  });

  test('delete: only the caller’s own row, nothing else touched', async () => {
    const db = fakeSupabase({ social_content_generations: [savedRow()], wordpress_generations: [{ id: WP_GEN_ID }] });
    expect(await deleteSocialContentGeneration(db.client, OTHER, SAVED_ID)).toBe('not_found');
    expect(db.tables.social_content_generations).toHaveLength(1);
    expect(await deleteSocialContentGeneration(db.client, USER, SAVED_ID)).toBe('deleted');
    expect(db.tables.social_content_generations).toHaveLength(0);
    expect(db.tables.wordpress_generations).toHaveLength(1);
    expect(db.calls.filter((call) => call.op === 'delete').every((call) => call.table === 'social_content_generations')).toBe(true);
  });

  test('regenerate: same source as a valid summary request; disabled when the source is gone', () => {
    const omniflow = regenerateRequestFor(savedRow() as never);
    expect(omniflow).toEqual({ wordpressArticleId: WP_GEN_ID });
    const external = regenerateRequestFor(savedRow({ source_type: 'external_wordpress_post', source_wordpress_generation_id: null, source_wordpress_site_id: SITE_ID, source_wordpress_article_id: 1527 }) as never);
    expect(external).toEqual({ wordpressPost: { siteId: SITE_ID, postId: 1527 } });
    const pinterest = regenerateRequestFor(savedRow({ source_type: 'pinterest_generation', source_pinterest_generation_id: PIN_GEN_ID }) as never);
    expect(pinterest).toEqual({ pinterestGenerationId: PIN_GEN_ID });
    for (const request of [omniflow, external, pinterest]) expect(mediumSummaryRequestSchema.safeParse(request).success).toBe(true);
    expect(regenerateRequestFor(savedRow({ source_wordpress_generation_id: null }) as never)).toBeNull();
    expect(regenerateRequestFor(savedRow({ source_type: 'pinterest_generation', source_pinterest_generation_id: null }) as never)).toBeNull();
  });

  test('source links stay inside OmniFlow; preview has no URL or Markdown', () => {
    expect(sourceHref(savedRow() as never)).toBe(`/wordpress/${WP_GEN_ID}`);
    expect(sourceHref(savedRow({ source_type: 'pinterest_generation', source_pinterest_generation_id: PIN_GEN_ID }) as never)).toBe(`/pinterest/${PIN_GEN_ID}`);
    expect(
      sourceHref(savedRow({ source_type: 'external_wordpress_post', source_wordpress_site_id: SITE_ID, source_wordpress_article_id: 1527 }) as never)
    ).toBe(`/pinterest/from-wordpress?siteId=${SITE_ID}&postId=1527`);
    const preview = contentPreview(RESULT.markdown);
    expect(preview).toBe('A short tour. Body text. Want to explore the complete article? Read the full guide on our blog →');
    expect(preview).not.toMatch(/https?:|!\[|\*\*/);
  });
});

// ---------------------------------------------------------------------------

test.describe('Medium history — UI, routes, migration, safety', () => {
  test('migration 045: table, platforms prepared, sources nullable, RLS on user + project + sources, no secret column', () => {
    const sql = read('supabase/migrations/045_add_social_content_generations.sql');
    expect(sql).toContain('CREATE TABLE social_content_generations');
    expect(sql).toMatch(/user_id\s+uuid NOT NULL REFERENCES profiles\(id\)/);
    expect(sql).toMatch(/project_id\s+uuid NOT NULL REFERENCES projects\(id\)/);
    expect(sql).toContain("CHECK (platform IN ('medium', 'facebook', 'instagram', 'reels', 'tiktok'))");
    for (const column of [
      'source_wordpress_generation_id', 'source_wordpress_site_id', 'source_wordpress_article_id', 'source_pinterest_generation_id',
      'title', 'subtitle', 'content_markdown', 'content_html', 'image_url', 'image_alt', 'cta_url', 'status', 'source_type', 'created_at', 'updated_at',
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toMatch(/source_wordpress_generation_id\s+uuid REFERENCES wordpress_generations\(id\) ON DELETE SET NULL/);
    expect(sql).toMatch(/source_pinterest_generation_id\s+uuid REFERENCES generations\(id\) ON DELETE SET NULL/);
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('USING (user_id = auth.uid())');
    expect(sql).toMatch(/WITH CHECK \([\s\S]*FROM projects p WHERE p\.id = project_id AND p\.user_id = auth\.uid\(\)[\s\S]*wordpress_generations[\s\S]*wordpress_sites[\s\S]*FROM generations g/);
    const columns = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf('CREATE INDEX'));
    expect(columns).not.toMatch(/token|secret|password|api_key/i);
    expect(SOCIAL_CONTENT_PLATFORMS).toEqual(['medium', 'facebook', 'instagram', 'reels', 'tiktok']);
    expect(ACTIVE_SOCIAL_CONTENT_PLATFORMS).toEqual(['medium']);
  });

  test('DELETE route: auth, UUID, user-scoped delete only', () => {
    const route = read('app/api/social/generations/[id]/route.ts');
    expect(route).toContain('supabase.auth.getUser()');
    expect(route).toContain('isValidUuid(id)');
    expect(route).toContain('deleteSocialContentGeneration(supabase, user.id, id)');
    expect(route).not.toMatch(/wordpress_|wp-json|generations'\)/);
  });

  test('actions: Open, Copy Markdown, Copy HTML, Download Markdown, Regenerate, Delete behind a confirmation dialog', () => {
    const actions = read('components/social/social-content-actions.tsx');
    for (const label of ['Open', 'Copy Markdown', 'Copy HTML', 'Download Markdown', 'Regenerate', 'Delete this Medium summary?', 'Cancel']) {
      expect(actions).toContain(label);
    }
    expect(actions).toContain("copyMediumContent('Markdown', markdown)");
    expect(actions).toContain("copyMediumContent('HTML', html)");
    expect(actions).toContain('downloadMediumMarkdown(title, markdown)');
    expect(actions).toContain('requestMediumSummary<SavedMediumSummary>(regenerateSource)');
    // The Delete button only opens the dialog; the request is sent from its confirm button.
    expect(actions).toContain('onClick={() => setConfirmOpen(true)}');
    expect(actions).toMatch(/async function confirmDelete\(\)[\s\S]*fetch\(`\/api\/social\/generations\/\$\{id\}`, \{ method: 'DELETE' \}\)/);
    expect(actions).toContain('onClick={confirmDelete}');
    // An unsaved regeneration stays on screen.
    expect(actions).toContain('setUnsaved(response.data)');
  });

  test('pages: /medium list (filters, meta, preview, actions) and /medium/[id] detail', () => {
    const list = read('app/(dashboard)/medium/page.tsx');
    expect(list).toContain("listSocialContentGenerations(supabase, user.id, 'medium', filters)");
    expect(list).toContain('<MediumHistoryFilters');
    expect(list).toContain('contentPreview(item.content_markdown)');
    expect(list).toContain('<SocialContentMeta item={item} />');
    expect(list).toContain('regenerateSource={regenerateRequestFor(item)}');
    const filters = read('components/social/medium-history-filters.tsx');
    for (const label of ['aria-label="Project"', 'aria-label="Source"', 'aria-label="Date"', 'aria-label="Status"']) expect(filters).toContain(label);
    const meta = read('components/social/social-content-meta.tsx');
    for (const field of ['Platform', 'Status', 'Project: ', 'Source: ', 'CTA URL: ', 'Image: ', 'timeAgo(item.created_at)']) expect(meta).toContain(field);
    const detail = read('app/(dashboard)/medium/[id]/page.tsx');
    expect(detail).toContain('getSocialContentGeneration(supabase, user.id, id)');
    expect(detail).toContain("item.platform !== 'medium'");
    expect(detail).toContain('<ArticleContent html={item.content_html} />');
  });

  test('sidebar: Medium enabled; Facebook and LinkedIn still disabled', () => {
    const sidebar = read('components/layout/sidebar.tsx');
    expect(sidebar).toContain("{ href: '/medium', label: 'Medium', icon: PenSquare },");
    expect(sidebar).toContain("{ href: '/facebook', label: 'Facebook', icon: ThumbsUp, disabled: true },");
    expect(sidebar).toContain("{ href: '/linkedin', label: 'LinkedIn', icon: Briefcase, disabled: true },");
  });

  test('the generator shows the saved link, or keeps the content with a warning', () => {
    const view = read('components/social/medium-summary-result.tsx');
    expect(view).toContain('href={`/medium/${result.id}`}');
    expect(view).toContain('result.warnings.map');
  });

  test('no Medium publication, no WordPress write, no secret in the new files', () => {
    for (const path of [
      'lib/social/social-content.ts',
      'lib/queries/social-content.ts',
      'app/api/social/generations/[id]/route.ts',
      'components/social/social-content-actions.tsx',
      'components/social/social-content-meta.tsx',
      'components/social/medium-history-filters.tsx',
      'app/(dashboard)/medium/page.tsx',
      'app/(dashboard)/medium/[id]/page.tsx',
    ]) {
      const code = read(path);
      expect(code, path).not.toMatch(/api\.medium\.com|medium\.com\/v1|integrationToken/i);
      expect(code, path).not.toMatch(/wp-json|encrypted_application_password|decryptSecret|SERVICE_ROLE|OPENROUTER_API_KEY/);
    }
    // The client components never import server modules.
    for (const path of ['components/social/social-content-actions.tsx', 'components/social/medium-history-filters.tsx', 'components/social/medium-summary-result.tsx']) {
      expect(read(path)).not.toMatch(/from '@\/lib\/(queries|supabase\/server|wordpress\/crypto)/);
    }
  });
});
