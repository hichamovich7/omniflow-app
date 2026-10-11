import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  NO_WORDPRESS_SITE_MESSAGE,
  PINTEREST_SOURCE_HREFS,
  pinterestSourceOptions,
} from '@/components/pinterest/pinterest-source-chooser';
import { hasWordPressSite } from '@/lib/queries/wordpress-sites';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test.describe('Pin source chooser', () => {
  test('three sources, each pointing where that flow starts', () => {
    const options = pinterestSourceOptions('keyword', true);
    expect(options.map((o) => [o.label, o.href])).toEqual([
      ['From keyword', '/pinterest'],
      ['From OmniFlow WordPress article', '/wordpress/history'],
      ['From existing WordPress article', '/pinterest/from-wordpress'],
    ]);
    expect(PINTEREST_SOURCE_HREFS['existing-post']).toBe('/pinterest/from-wordpress');
  });

  test('exactly one source is marked as current', () => {
    for (const active of ['keyword', 'omniflow-article', 'existing-post'] as const) {
      const options = pinterestSourceOptions(active, true);
      expect(options.filter((o) => o.current).map((o) => o.kind)).toEqual([active]);
    }
  });

  test('without a connected site: "From existing WordPress article" is disabled, explained, with no link', () => {
    const options = pinterestSourceOptions('keyword', false);
    expect(options[2]).toMatchObject({ kind: 'existing-post', disabled: true, href: null, description: NO_WORDPRESS_SITE_MESSAGE });
    expect(options.slice(0, 2).every((o) => !o.disabled && o.href)).toBe(true);
    expect(NO_WORDPRESS_SITE_MESSAGE).toMatch(/No WordPress site connected/);
  });

  test('the component renders the disabled state with a way to connect a site, links otherwise — navigation only', () => {
    const source = read('components/pinterest/pinterest-source-chooser.tsx');
    expect(source).toContain('aria-label="Pin source"');
    expect(source).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(source).toContain('aria-disabled="true"');
    expect(source).toMatch(/href="\/projects"[\s\S]*Connect a WordPress site/);
    expect(source).not.toMatch(/fetch\(|'use client'|useState|onClick|lib\/ai/);
  });
});

test.describe('hasWordPressSite()', () => {
  function fake(result: { count: number | null; error: { message: string } | null }) {
    const calls: string[] = [];
    const builder = {
      select: (columns: string, options: unknown) => (calls.push(`select:${columns}:${JSON.stringify(options)}`), builder),
      eq: (column: string, value: unknown) => (calls.push(`eq:${column}:${value}`), builder),
      then: (resolve: (value: typeof result) => unknown) => resolve(result),
    };
    return { client: { from: (table: string) => (calls.push(`from:${table}`), builder) } as unknown as SupabaseClient, calls };
  }

  test("counts the user's own connections with a head query on a public column", async () => {
    const one = fake({ count: 2, error: null });
    expect(await hasWordPressSite(one.client, 'user-1')).toBe(true);
    expect(one.calls).toEqual(['from:wordpress_sites', 'select:id:{"count":"exact","head":true}', 'eq:user_id:user-1']);
    expect(await hasWordPressSite(fake({ count: 0, error: null }).client, 'user-1')).toBe(false);
    expect(await hasWordPressSite(fake({ count: null, error: { message: 'x' } }).client, 'user-1')).toBe(false);
  });
});

test.describe('Wiring in the Pinterest pages and the dashboard', () => {
  const generator = read('app/(dashboard)/pinterest/page.tsx');
  const create = read('app/(dashboard)/pinterest/create/page.tsx');
  const fromWordPress = read('app/(dashboard)/pinterest/from-wordpress/page.tsx');
  const dashboard = read('app/(dashboard)/dashboard/page.tsx');
  const form = read('components/pinterest/pin-form.tsx');

  test('the Pinterest generator shows the chooser with the connection state', () => {
    expect(generator).toContain('<PinterestSourceChooser active="keyword" hasWordPressSite={wordpressConnected} />');
    expect(generator).toContain('hasWordPressSite(supabase, user.id)');
    expect(form).toContain('{sourceChooser}');
  });

  test('/pinterest/create (OmniFlow article) and /pinterest/from-wordpress show it too', () => {
    expect(create).toContain('<PinterestSourceChooser active="omniflow-article"');
    expect(fromWordPress.match(/<PinterestSourceChooser active="existing-post" hasWordPressSite \/>/g)).toHaveLength(2);
    expect(fromWordPress).toContain('Connect a WordPress site');
  });

  test('dashboard quick action: link when connected, disabled with an explanation otherwise', () => {
    expect(dashboard).toContain("label: 'Generate from existing WordPress article'");
    expect(dashboard).toContain("href: '/pinterest/from-wordpress'");
    expect(dashboard).toContain('disabled: !wordpressConnected');
    expect(dashboard).toContain('data-testid="quick-action-disabled"');
    expect(dashboard).toContain('{NO_WORDPRESS_SITE_MESSAGE}');
    for (const label of ['New Project', 'Generate Pinterest Pins', 'Generate WordPress Article', 'Pinterest History', 'WordPress History']) {
      expect(dashboard).toContain(label);
    }
  });

  test('no page calls the AI or writes on load; existing flows keep their entry points', () => {
    for (const page of [generator, create, fromWordPress, dashboard]) expect(page).not.toMatch(/generateText|analyzeImage|generateImage|lib\/ai\/engine/);
    // OmniFlow article flow: same guard and loader.
    expect(create).toContain("source !== 'wordpress' || !articleId || !isValidUuid(articleId)");
    expect(create).toContain('loadArticlePinterestSource(supabase, user.id, articleId)');
    // Keyword flow: same form, projects and boards.
    expect(generator).toContain('<PinForm');
    expect(generator).toMatch(/projects=\{list\}[\s\S]*boards=\{boards \?\? \[\]\}/);
    // The WordPress article generators (keyword / Pins / URL) are untouched by this change.
    expect(read('components/wordpress/social-content-studio.tsx')).toContain('Generate Pinterest content');
  });
});
