import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  listMediumArticleOptions,
  listMediumPinterestOptions,
  listMediumSiteOptions,
} from '@/lib/queries/social-content';
import { NO_ARTICLE_FOR_MEDIUM_MESSAGE, pinterestGenerationHasArticle } from '@/lib/social/social-content';
import { mediumSummaryRequestSchema } from '@/lib/validations/medium-summary';

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = 'user-1';
const OTHER = 'user-2';
const SITE_ID = '11111111-1111-4111-8111-111111111111';

type Row = Record<string, unknown>;

/** Records every call; `.or()` is recorded and, for the Pinterest filter, applied. */
function fakeSupabase(tables: Record<string, Row[]>, options: { error?: boolean } = {}) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const record = (op: string, ...args: unknown[]) => calls.push({ table, op, args });
    const builder = {
      select: (...args: unknown[]) => (record('select', ...args), builder),
      eq: (column: string, value: unknown) => (record('eq', column, value), (rows = rows.filter((r) => r[column] === value)), builder),
      or: (filter: string) => {
        record('or', filter);
        rows = rows.filter((r) => r.source_wordpress_generation_id != null || r.source_type === 'external_wordpress_post');
        return builder;
      },
      order: () => builder,
      limit: (n: number) => (record('limit', n), builder),
      then: (resolve: (value: unknown) => unknown) =>
        resolve(options.error ? { data: null, error: { code: '42703' } } : { data: rows, error: null }),
      insert: () => (record('insert'), builder),
      update: () => (record('update'), builder),
      delete: () => (record('delete'), builder),
    };
    return builder;
  }
  return { client: { from } as unknown as SupabaseClient, calls };
}

test.describe('Pins → Medium (button on a Pinterest generation)', () => {
  test('available only when the Pins were made from an article', () => {
    expect(pinterestGenerationHasArticle({ source_wordpress_generation_id: 'gen' })).toBe(true);
    expect(pinterestGenerationHasArticle({ source_type: 'external_wordpress_post', source_wordpress_site_id: SITE_ID, source_wordpress_post_id: 1527 })).toBe(true);
    expect(pinterestGenerationHasArticle({ source_type: 'external_wordpress_post', source_wordpress_site_id: null, source_wordpress_post_id: 1527 })).toBe(false);
    expect(pinterestGenerationHasArticle({ source_type: null, source_wordpress_generation_id: null })).toBe(false);
    expect(pinterestGenerationHasArticle({})).toBe(false);
    expect(NO_ARTICLE_FOR_MEDIUM_MESSAGE).toMatch(/created from a keyword/);
  });

  test('button: summarizes the source article of the generation, disabled with an explanation otherwise', () => {
    const button = read('components/pinterest/generate-medium-button.tsx');
    expect(button).toContain('Generate Medium summary');
    expect(button).toContain('requestMediumSummary<SavedMediumSummary>({ pinterestGenerationId: generationId })');
    expect(button).toContain('disabled={!hasArticle || loading}');
    expect(button).toContain('title={hasArticle ? undefined : NO_ARTICLE_FOR_MEDIUM_MESSAGE}');
    expect(button).toContain('aria-describedby={hasArticle ? undefined : messageId}');
    // Saved → open it in the history; not saved → shown in a dialog, never lost.
    expect(button).toContain('router.push(`/medium/${response.data.id}`)');
    expect(button).toContain('setUnsaved(response.data)');
    expect(button).toContain('<MediumSummaryResultView result={unsaved}');
    expect(button).not.toMatch(/fetch\(|selectedPinIds/);
    expect(mediumSummaryRequestSchema.safeParse({ pinterestGenerationId: '55555555-5555-4555-8555-555555555555' }).success).toBe(true);
  });

  test('shown in the default bar and in the selection bar, next to the existing actions', () => {
    const workspace = read('components/editorial/editorial-workspace.tsx');
    const matches = workspace.match(/<GenerateMediumButton generationId=\{generationId\} hasArticle=\{hasSourceArticle\} \/>/g) ?? [];
    expect(matches).toHaveLength(2);
    expect(workspace).toContain('<GenerateWordPressButton selectedPinIds={selectedIds} />');
    expect(workspace).toContain('<ExportCsvButton pins={pins} keyword={keyword} />');
    const page = read('app/(dashboard)/pinterest/[id]/page.tsx');
    expect(page).toContain('hasSourceArticle={pinterestGenerationHasArticle(generation)}');
  });
});

test.describe('/medium — New Medium summary', () => {
  test('OmniFlow articles: completed only, scoped to the user, published flag, newest 50', async () => {
    const db = fakeSupabase({
      wordpress_generations: [
        { id: 'a', user_id: USER, status: 'completed', keyword: 'scarf', created_at: '2026-10-10', projects: { name: 'Crochet' }, wordpress_articles: [{ title: 'Scarves', status: 'completed', wp_post_id: 7, publish_status: 'published' }] },
        { id: 'b', user_id: USER, status: 'completed', keyword: 'hat', created_at: '2026-10-09', projects: null, wordpress_articles: { title: '', status: 'completed', wp_post_id: null, publish_status: 'draft' } },
        { id: 'c', user_id: USER, status: 'completed', keyword: 'bag', created_at: '2026-10-08', projects: null, wordpress_articles: [{ title: 'Bags', status: 'failed', wp_post_id: null, publish_status: 'draft' }] },
        { id: 'd', user_id: USER, status: 'processing', keyword: 'rug', created_at: '2026-10-07', projects: null, wordpress_articles: [] },
        { id: 'e', user_id: OTHER, status: 'completed', keyword: 'other', created_at: '2026-10-06', projects: null, wordpress_articles: [{ title: 'Other', status: 'completed', wp_post_id: null, publish_status: 'draft' }] },
      ],
    });
    const options = await listMediumArticleOptions(db.client, USER);
    expect(options).toEqual([
      { id: 'a', title: 'Scarves', projectName: 'Crochet', createdAt: '2026-10-10', published: true },
      { id: 'b', title: 'hat', projectName: 'Project', createdAt: '2026-10-09', published: false },
    ]);
    expect(db.calls).toContainEqual({ table: 'wordpress_generations', op: 'eq', args: ['user_id', USER] });
    expect(db.calls).toContainEqual({ table: 'wordpress_generations', op: 'limit', args: [50] });
    expect(db.calls.some((call) => ['insert', 'update', 'delete'].includes(call.op))).toBe(false);
  });

  test('Pinterest generations: only those made from an article, scoped to the user; a query error gives none', async () => {
    const db = fakeSupabase({
      generations: [
        { id: 'p1', user_id: USER, status: 'completed', keyword: 'scarf pins', pins_requested: 5, created_at: '2026-10-10', projects: { name: 'Crochet' }, source_wordpress_generation_id: 'a', source_type: 'omniflow_article' },
        { id: 'p2', user_id: USER, status: 'completed', keyword: 'post pins', pins_requested: 3, created_at: '2026-10-09', projects: null, source_wordpress_generation_id: null, source_type: 'external_wordpress_post' },
        { id: 'p3', user_id: USER, status: 'completed', keyword: 'keyword pins', pins_requested: 10, created_at: '2026-10-08', projects: null, source_wordpress_generation_id: null, source_type: null },
        { id: 'p4', user_id: OTHER, status: 'completed', keyword: 'other', pins_requested: 1, created_at: '2026-10-07', projects: null, source_wordpress_generation_id: 'x', source_type: 'omniflow_article' },
      ],
    });
    const options = await listMediumPinterestOptions(db.client, USER);
    expect(options.map((option) => option.id)).toEqual(['p1', 'p2']);
    expect(options[0]).toEqual({ id: 'p1', keyword: 'scarf pins', projectName: 'Crochet', pins: 5, createdAt: '2026-10-10' });
    expect(db.calls).toContainEqual({ table: 'generations', op: 'or', args: ['source_wordpress_generation_id.not.is.null,source_type.eq.external_wordpress_post'] });
    expect(await listMediumPinterestOptions(fakeSupabase({}, { error: true }).client, USER)).toEqual([]);
  });

  test('sites: public columns only (never the encrypted password)', async () => {
    const db = fakeSupabase({ wordpress_sites: [{ id: SITE_ID, user_id: USER, site_url: 'https://crochet.example.test', projects: { name: 'Crochet' } }] });
    expect(await listMediumSiteOptions(db.client, USER)).toEqual([{ id: SITE_ID, siteUrl: 'https://crochet.example.test', projectName: 'Crochet' }]);
    const select = db.calls.find((call) => call.op === 'select');
    expect(String(select?.args[0])).not.toMatch(/password|encrypted/);
  });

  test('chooser: three sources, in-place pickers, generation through the existing panel, history refreshed', () => {
    const chooser = read('components/social/new-medium-summary.tsx');
    for (const label of ['New Medium summary', 'From OmniFlow WordPress article', 'From existing WordPress article', 'From Pinterest Pins']) {
      expect(chooser).toContain(label);
    }
    // Each source produces one of the three request bodies of the summary endpoint.
    expect(chooser).toContain('source: { wordpressArticleId: article.id }');
    expect(chooser).toContain('source: { wordpressPost: { siteId: post.siteId, postId: post.postId } }');
    expect(chooser).toContain('source: { pinterestGenerationId: item.id }');
    expect(chooser).toContain('<WordPressPostPicker');
    expect(chooser).toContain('onSelectPost={(post) =>');
    expect(chooser).toContain('<MediumSummaryPanel key={JSON.stringify(selected.source)} source={selected.source} onGenerated={() => router.refresh()} />');
    // No WordPress site → the existing-post option is disabled with a link to connect one.
    expect(chooser).toContain("const disabled = option.kind === 'existing-post' && sites.length === 0;");
    expect(chooser).toContain('Connect a WordPress site');
    // Choosing never generates: no request of its own.
    expect(chooser).not.toContain('fetch(');
    expect(chooser).toMatch(/Pins created from a keyword have no article to summarize/);
  });

  test('post picker: in-place selection for Medium, the Pinterest link kept by default', () => {
    const picker = read('components/social/wordpress-post-picker.tsx');
    expect(picker).toContain('onSelectPost?: (post: PickedWordPressPost) => void;');
    expect(picker).toContain('onClick={() => onSelectPost({ siteId, postId: post.id, title: post.title })}');
    expect(picker).toContain('href={wordpressPostPinterestHref({ siteId, postId: post.id })}');
    const pinterestPage = read('app/(dashboard)/pinterest/from-wordpress/page.tsx');
    expect(pinterestPage).toContain('<WordPressPostPicker sites={sites} initialSiteId={siteId && isValidUuid(siteId) ? siteId : null} />');
  });

  test('/medium: the chooser above the history; lists loaded read-only, no AI on load', () => {
    const page = read('app/(dashboard)/medium/page.tsx');
    expect(page).toContain('<NewMediumSummary articles={articleOptions} sites={siteOptions} pinterest={pinterestOptions} />');
    expect(page).toContain('listMediumArticleOptions(supabase, user.id)');
    expect(page).toContain('listMediumSiteOptions(supabase, user.id)');
    expect(page).toContain('listMediumPinterestOptions(supabase, user.id)');
    expect(page.indexOf('<NewMediumSummary')).toBeLessThan(page.indexOf('<MediumHistoryFilters'));
    expect(page).not.toMatch(/generateText|lib\/ai/);
    const panel = read('components/social/medium-summary-panel.tsx');
    expect(panel).toContain('onGenerated?.(response.data)');
  });
});
