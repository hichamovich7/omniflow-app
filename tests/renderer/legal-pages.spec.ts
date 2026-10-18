import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'playwright/test';
import { legalOperator, legalPages, getLegalPage } from '@/lib/legal/content';
import { isLegalPath, legalRoutes } from '@/lib/legal/routes';

function allText(slug: Parameters<typeof getLegalPage>[0]) {
  const page = getLegalPage(slug);
  return [
    page.intro,
    ...page.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.items ?? []), ...(s.after ?? [])]),
  ].join('\n');
}

test.describe('Legal pages (TASK-069)', () => {
  test('every footer route has content and a page file', () => {
    expect(legalRoutes.map((r) => r.href.slice(1)).sort()).toEqual(legalPages.map((p) => p.slug).sort());
    for (const page of legalPages) {
      const file = path.join(process.cwd(), 'app', '(legal)', page.slug, 'page.tsx');
      expect(existsSync(file), `${file} exists`).toBe(true);
      expect(page.sections.length).toBeGreaterThan(0);
    }
  });

  test('legal paths are public, other paths are not', () => {
    for (const route of legalRoutes) {
      expect(isLegalPath(route.href)).toBe(true);
      expect(isLegalPath(route.href + '/')).toBe(true);
    }
    expect(isLegalPath('/dashboard')).toBe(false);
    expect(isLegalPath('/privacy-extra')).toBe(false);
    expect(isLegalPath('/api/privacy')).toBe(false);
  });

  test('inline links only point to existing legal pages', () => {
    const hrefs = new Set(legalRoutes.map((r) => r.href));
    for (const page of legalPages) {
      for (const [, , href] of allText(page.slug).matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
        if (href.startsWith('/')) expect(hrefs.has(href), `${page.slug} → ${href}`).toBe(true);
      }
    }
  });

  test('privacy policy lists the real processors and Facebook permissions', () => {
    const text = allText('privacy');
    for (const name of ['Supabase', 'Vercel', 'Cloudflare', 'OpenRouter', 'OpenAI', 'Meta Platforms']) {
      expect(text).toContain(name);
    }
    for (const scope of ['pages_show_list', 'pages_manage_posts', 'pages_manage_engagement', 'pages_read_engagement', 'pages_read_user_content']) {
      expect(text).toContain(scope);
    }
    expect(text).toMatch(/never publishes on a personal profile or a group/);
    expect(text).toMatch(/do not use your content to train AI models/);
    expect(text).toMatch(/do not collect payment data/);
  });

  test('data deletion page gives the steps Meta requires', () => {
    const text = allText('data-deletion');
    expect(text).toContain('Disconnect Page');
    expect(text).toContain('Business integrations');
    expect(text).toContain('Data deletion request');
    expect(text).toContain('30 days');
    expect(text).toContain(legalOperator.email);
  });

  test('cookie policy matches the cookies and storage keys in the code', () => {
    const text = allText('cookies');
    for (const key of ['omniflow_meta_oauth', 'omniflow_meta_pending', 'omniflow:sidebar-groups', 'omniflow:dashboard-streams-status-sort']) {
      expect(text).toContain(key);
    }
    expect(text).toMatch(/do not use advertising, analytics/);
  });

  test('GDPR page covers every data subject right', () => {
    const text = allText('gdpr');
    for (const article of ['Art. 15', 'Art. 16', 'Art. 17', 'Art. 18', 'Art. 20', 'Art. 21', 'Art. 7']) {
      expect(text).toContain(article);
    }
    expect(text).toMatch(/within one month/);
  });
});
