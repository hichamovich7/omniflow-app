import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseQualityReport, saveQualityReport } from '@/lib/wordpress/quality-report';
import type { ArticleQualityReport } from '@/lib/wordpress/quality-check';
import { getWordPressArticleByGenerationId } from '@/lib/queries/wordpress';
import {
  buildQualityReportView,
  QUALITY_REPORT_INFORMATIONAL_NOTE,
  QUALITY_REPORT_MISSING_MESSAGE,
  QUALITY_REPORT_OPEN_STORAGE_PREFIX,
  parseStoredQualityReportOpen,
  qualityReportDefaultOpen,
  qualityReportStorageKey,
  serializeQualityReportOpen,
} from '@/lib/wordpress/quality-report-view';

/**
 * Quality Report V1 persistence and display (TASK-FIX-046). Offline: static
 * migration/route/component checks, in-memory Supabase stubs, the card's
 * display model — no database, no network.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const FAILED_REPORT: ArticleQualityReport = {
  status: 'failed',
  qualityIssues: ['A generation step stopped at the token limit (finish_reason "length").'],
  warnings: ['Meta title is 65 characters (target ≤ 60).'],
  checks: [
    { key: 'truncation', status: 'failed', message: 'A generation step stopped at the token limit (finish_reason "length").' },
    { key: 'meta_title', status: 'warning', message: 'Meta title is 65 characters (target ≤ 60).' },
    { key: 'slug', status: 'passed', message: 'Slug is valid.' },
  ],
};

const PASSED_REPORT: ArticleQualityReport = {
  status: 'passed',
  qualityIssues: [],
  warnings: [],
  checks: [{ key: 'slug', status: 'passed', message: 'Slug is valid.' }],
};

// ---------------------------------------------------------------- migration

test('migration 037 adds a nullable jsonb quality_report on wordpress_generations only', () => {
  const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  expect(files[files.length - 1]).toBe('037_add_wordpress_quality_report.sql');
  expect(files.filter((f) => f.startsWith('037_'))).toHaveLength(1);

  const sql = read('supabase/migrations/037_add_wordpress_quality_report.sql')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
  expect(sql).toBe('ALTER TABLE wordpress_generations ADD COLUMN quality_report jsonb;');
});

test('no existing migration is modified', () => {
  const changed = execSync('git diff --name-only HEAD -- supabase/migrations', { cwd: ROOT, encoding: 'utf8' }).trim();
  expect(changed).toBe('');
});

// --------------------------------------------------------- parse / validate

test('parseQualityReport keeps a valid report exactly and rejects anything else', () => {
  expect(parseQualityReport(JSON.parse(JSON.stringify(FAILED_REPORT)))).toEqual(FAILED_REPORT);
  expect(parseQualityReport(null)).toBeNull();
  expect(parseQualityReport(undefined)).toBeNull();
  expect(parseQualityReport({ ...FAILED_REPORT, status: 'unknown' })).toBeNull();
  expect(parseQualityReport({ ...FAILED_REPORT, checks: [{ key: 'x', status: 'passed' }] })).toBeNull();
  expect(parseQualityReport('{"status":"passed"}')).toBeNull();
});

// ----------------------------------------------------------------- persist

function updateStub(result: { error: { message: string } | null } | 'throw') {
  const calls: { table: string; values: unknown; id: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      update: (values: unknown) => ({
        eq: async (_column: string, id: unknown) => {
          calls.push({ table, values, id });
          if (result === 'throw') throw new Error('network down');
          return result;
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

test('saveQualityReport writes the full JSON on wordpress_generations', async () => {
  const { client, calls } = updateStub({ error: null });
  await saveQualityReport(client, 'gen-1', FAILED_REPORT, 'wordpress');
  expect(calls).toEqual([{ table: 'wordpress_generations', values: { quality_report: FAILED_REPORT }, id: 'gen-1' }]);
});

test('saveQualityReport never throws (column missing, network error) — it only logs', async () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
  try {
    await saveQualityReport(updateStub({ error: { message: 'column "quality_report" does not exist' } }).client, 'g', PASSED_REPORT, 'wordpress');
    await saveQualityReport(updateStub('throw').client, 'g', PASSED_REPORT, 'wordpress');
  } finally {
    console.warn = originalWarn;
  }
  expect(warnings).toHaveLength(2);
  expect(warnings[0]).toContain('[wordpress] quality report not saved');
});

test('the three generation routes save the report after marking the generation completed', () => {
  for (const [route, tag] of [
    ['generate', 'wordpress'],
    ['generate-from-pins', 'wordpress-from-pins'],
    ['generate-from-url', 'wordpress-from-url'],
  ]) {
    const source = read(`app/api/wordpress/${route}/route.ts`);
    const save = source.indexOf(`saveQualityReport(supabase, generation.id, result.quality, '${tag}')`);
    expect(save).toBeGreaterThan(-1);
    expect(source.lastIndexOf("status: 'completed'", save)).toBeGreaterThan(-1);
    // The status update itself never carries the report (a missing column must not fail it).
    expect(source).not.toMatch(/update\(\{[^}]*status: 'completed'[^}]*quality_report/);
  }
});

// -------------------------------------------------------------- detail read

function detailStub(generationRow: Record<string, unknown> | null) {
  const rows: Record<string, unknown> = {
    wordpress_generations: generationRow,
    wordpress_articles: generationRow ? { id: 'art-1', generation_id: 'gen-1' } : null,
  };
  return {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: async () => ({ data: [] }),
        single: async () => ({ data: rows[table] ?? null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

test('the detail read returns the validated report', async () => {
  const result = await getWordPressArticleByGenerationId(detailStub({ id: 'gen-1', quality_report: FAILED_REPORT }), 'gen-1');
  expect(result.qualityReport).toEqual(FAILED_REPORT);
  expect(result.article).not.toBeNull();
});

test('the detail read returns null for old or malformed reports', async () => {
  expect((await getWordPressArticleByGenerationId(detailStub({ id: 'gen-1', quality_report: null }), 'gen-1')).qualityReport).toBeNull();
  expect((await getWordPressArticleByGenerationId(detailStub({ id: 'gen-1' }), 'gen-1')).qualityReport).toBeNull();
  expect(
    (await getWordPressArticleByGenerationId(detailStub({ id: 'gen-1', quality_report: { status: 'nope' } }), 'gen-1')).qualityReport
  ).toBeNull();
  expect((await getWordPressArticleByGenerationId(detailStub(null), 'gen-1')).qualityReport).toBeNull();
});

// ------------------------------------------------------------------ display
// Playwright's test runner rewrites JSX in imported .tsx files, so the card
// is tested through its pure display model plus a static read of its source.

test('display model: failed report — status, summary, issues, warnings, every check labelled', () => {
  const view = buildQualityReportView(FAILED_REPORT);
  expect(view).toMatchObject({ statusLabel: 'Issues found', tone: 'danger' });
  expect(view.summary).toBe('1 of 3 checks passed · 1 warning · 1 issue.');
  expect(view.issues).toEqual(FAILED_REPORT.qualityIssues);
  expect(view.warnings).toEqual(FAILED_REPORT.warnings);
  expect(view.checks.map((c) => [c.label, c.statusLabel])).toEqual([
    ['Truncation', 'Failed'],
    ['Meta title', 'Warning'],
    ['Slug', 'Passed'],
  ]);
});

test('display model: passed / warning status, plurals and unknown check keys', () => {
  expect(buildQualityReportView(PASSED_REPORT)).toMatchObject({
    statusLabel: 'Passed',
    tone: 'success',
    summary: '1 of 1 checks passed · 0 warnings · 0 issues.',
  });
  const warning = buildQualityReportView({ ...PASSED_REPORT, status: 'warning', warnings: ['a', 'b'] });
  expect(warning).toMatchObject({ statusLabel: 'Warnings', tone: 'warning' });
  expect(warning.summary).toContain('2 warnings');
  const unknown = buildQualityReportView({ ...PASSED_REPORT, checks: [{ key: 'future_check', status: 'passed', message: 'ok' }] });
  expect(unknown.checks[0].label).toBe('future_check');
});

test('card source: renders the display model, the missing-report message, and no action', () => {
  const card = read('components/wordpress/article-quality-report.tsx');
  expect(card).toContain('buildQualityReportView(report)');
  expect(card).toContain('QUALITY_REPORT_MISSING_MESSAGE');
  expect(card).toContain('QUALITY_REPORT_INFORMATIONAL_NOTE');
  expect(card).toContain('All checks ({view.checks.length})');
  // The only interactive element is the toggle of the disclosure shell below.
  expect(card).not.toMatch(/<(button|Button|form|a|Link|input)\b/);
  expect(card).not.toContain("'use client'");
  expect(card).toContain('<QualityReportDisclosure');
  const disclosure = read('components/wordpress/quality-report-disclosure.tsx');
  expect(disclosure).not.toMatch(/<(form|a|Link|input)\b/);
  expect(disclosure.match(/<button/g)).toHaveLength(1);
  expect(QUALITY_REPORT_MISSING_MESSAGE).toContain('No quality report for this article');
  expect(QUALITY_REPORT_INFORMATIONAL_NOTE).toContain('never blocks export or publishing');
});

test('the review page renders the card, and publishing ignores the report', () => {
  const page = read('app/(dashboard)/wordpress/[id]/page.tsx');
  expect(page).toContain('<ArticleQualityReportCard report={qualityReport} generationId={id} />');
  const publish = read('app/api/wordpress/[id]/publish/route.ts');
  expect(publish).not.toContain('quality');
});

// ------------------------------------------------------------ collapsible card

const WARNING_REPORT: ArticleQualityReport = {
  status: 'warning',
  qualityIssues: [],
  warnings: ['Meta title is 65 characters (target ≤ 60).'],
  checks: [{ key: 'meta_title', status: 'warning', message: 'Meta title is 65 characters (target ≤ 60).' }],
};

test('default state: collapsed when every check passed, open for warnings, issues or no report', () => {
  expect(qualityReportDefaultOpen(PASSED_REPORT)).toBe(false);
  expect(qualityReportDefaultOpen(WARNING_REPORT)).toBe(true);
  expect(qualityReportDefaultOpen(FAILED_REPORT)).toBe(true);
  expect(qualityReportDefaultOpen(null)).toBe(true);
});

test('open/closed state is stored per generationId and round-trips', () => {
  expect(qualityReportStorageKey('gen-a')).toBe(`${QUALITY_REPORT_OPEN_STORAGE_PREFIX}gen-a`);
  expect(qualityReportStorageKey('gen-a')).not.toBe(qualityReportStorageKey('gen-b'));
  expect(parseStoredQualityReportOpen(serializeQualityReportOpen(true))).toBe(true);
  expect(parseStoredQualityReportOpen(serializeQualityReportOpen(false))).toBe(false);
  // No stored choice (or a corrupted value) falls back to the default state.
  expect(parseStoredQualityReportOpen(null)).toBeNull();
  expect(parseStoredQualityReportOpen('yes')).toBeNull();
});

test('disclosure: toggle button with aria-expanded / aria-controls, panel hidden when closed', () => {
  const disclosure = read('components/wordpress/quality-report-disclosure.tsx');
  expect(disclosure).toContain("'use client'");
  expect(disclosure).toContain('type="button"');
  expect(disclosure).toContain('aria-expanded={open}');
  expect(disclosure).toContain('aria-controls={panelId}');
  expect(disclosure).toContain('<div id={panelId} hidden={!open}>');
  expect(disclosure).toContain('onClick={() => writeStoredOpen(storageKey, !open)}');
  expect(disclosure).toContain('const open = stored ?? defaultOpen;');
  expect(disclosure).toContain('qualityReportStorageKey(generationId)');
  // Server snapshot = no stored choice → same first render on server and client.
  expect(disclosure).toContain('() => null');
  // localStorage access is guarded and a failed write still toggles for this view.
  expect(disclosure).toContain('memoryOpen.set(key, open);');
  expect(disclosure.match(/try \{/g)?.length).toBeGreaterThanOrEqual(2);

  const card = read('components/wordpress/article-quality-report.tsx');
  expect(card).toContain('const defaultOpen = qualityReportDefaultOpen(report);');
  expect(card.match(/defaultOpen=\{defaultOpen\}/g)).toHaveLength(2);
  expect(card.match(/generationId=\{generationId\}/g)).toHaveLength(2);
});

test('export, copy, save and publish stay outside the collapsible card and are always rendered', () => {
  const page = read('app/(dashboard)/wordpress/[id]/page.tsx');
  const cardAt = page.indexOf('<ArticleQualityReportCard');
  const publishAt = page.indexOf('<PublishControl');
  const copyExportAt = page.indexOf('<CopyExportButtons');
  const categoryAt = page.indexOf('<ArticleCategoryEditor');
  expect(publishAt).toBeGreaterThan(-1);
  expect(copyExportAt).toBeGreaterThan(-1);
  expect(categoryAt).toBeGreaterThan(cardAt);
  // Rendered before the card and never as its children: collapsing it hides nothing else.
  expect(publishAt).toBeLessThan(cardAt);
  expect(copyExportAt).toBeLessThan(cardAt);
  expect(page).toMatch(/<ArticleQualityReportCard [^>]*\/>/);
  const card = read('components/wordpress/article-quality-report.tsx');
  expect(card).not.toMatch(/PublishControl|CopyExportButtons|ArticleCategoryEditor/);
});
