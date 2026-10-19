import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { addPinterestUtm, pinterestUtmContent } from '@/lib/analytics/utm';
import { formatPinterestLinkCell, generatePinterestCsv } from '@/lib/csv/pinterest';
import type { Pin } from '@/types/database';

// TASK-070 — offline by construction: pure string building, no network,
// no Supabase, no AI.

function pin(overrides: Partial<Pin> = {}): Pin {
  return {
    id: 'pin-1',
    generation_id: 'gen-1',
    language: 'en',
    title: 'Small Bathroom Storage Ideas',
    description: 'Clever ways to organize a small bathroom.',
    keywords: 'bathroom storage, small bathroom',
    board: 'Summer Eats',
    board_id: null,
    board_section: null,
    image_prompt: 'A bright bathroom shelf.',
    image_analysis: null,
    media_url: 'https://example.com/image.png',
    link_url: 'https://example.com/article',
    publish_date: null,
    visual_format: 'photo',
    overlay_text: null,
    title_banner_template: null,
    cta_banner_template: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function linkColumn(csv: string): string[] {
  // Test fixtures hold no comma inside quoted fields before "Link".
  return csv.replace(/^﻿/, '').split('\n').slice(1).map((row) => row.split(',')[4]);
}

test('adds the three UTM parameters with the exact values', () => {
  expect(addPinterestUtm('https://example.com/article', 1)).toBe(
    'https://example.com/article?utm_source=pinterest&utm_medium=organic&utm_content=pin-01'
  );
  const url = new URL(addPinterestUtm('https://example.com/article', 3));
  expect(url.searchParams.get('utm_source')).toBe('pinterest');
  expect(url.searchParams.get('utm_medium')).toBe('organic');
  expect(url.searchParams.get('utm_content')).toBe('pin-03');
});

test('utm_content numbering is two-digit and deterministic', () => {
  expect(pinterestUtmContent(1)).toBe('pin-01');
  expect(pinterestUtmContent(2)).toBe('pin-02');
  expect(pinterestUtmContent(10)).toBe('pin-10');
  expect(pinterestUtmContent(100)).toBe('pin-100');
});

test('CSV rows get pin-01, pin-02, pin-03 in export order', () => {
  const pins = [pin({ id: 'a' }), pin({ id: 'b' }), pin({ id: 'c' })];
  const links = linkColumn(generatePinterestCsv(pins, { utmTracking: true }));
  expect(links.map((l) => new URL(l).searchParams.get('utm_content'))).toEqual([
    'pin-01',
    'pin-02',
    'pin-03',
  ]);
  // Same input → same CSV.
  expect(generatePinterestCsv(pins, { utmTracking: true })).toBe(
    generatePinterestCsv(pins, { utmTracking: true })
  );
});

test('a Pin without link stays empty and keeps its row number', () => {
  const pins = [pin({ id: 'a', link_url: null }), pin({ id: 'b', link_url: '' }), pin({ id: 'c' })];
  const links = linkColumn(generatePinterestCsv(pins, { utmTracking: true }));
  expect(links[0]).toBe('');
  expect(links[1]).toBe('');
  expect(new URL(links[2]).searchParams.get('utm_content')).toBe('pin-03');
  expect(addPinterestUtm(null, 1)).toBe('');
  expect(addPinterestUtm('   ', 1)).toBe('   ');
});

test('option off (or omitted) exports the original URL unchanged', () => {
  const original = 'https://example.com/article?ref=home#top';
  const p = pin({ link_url: original });
  expect(formatPinterestLinkCell(p, 1, { utmTracking: false })).toBe(original);
  expect(linkColumn(generatePinterestCsv([p], { utmTracking: false }))[0]).toBe(original);
  expect(linkColumn(generatePinterestCsv([p]))[0]).toBe(original);
});

test('keeps existing parameters with their original encoding', () => {
  expect(addPinterestUtm('https://example.com/a?ref=home&q=a%20b&tag=x+y', 2)).toBe(
    'https://example.com/a?ref=home&q=a%20b&tag=x+y&utm_source=pinterest&utm_medium=organic&utm_content=pin-02'
  );
  const url = new URL(addPinterestUtm('https://example.com/a?utm_campaign=spring&utm_term=jar', 1));
  expect(url.searchParams.get('utm_campaign')).toBe('spring');
  expect(url.searchParams.get('utm_term')).toBe('jar');
});

test('replaces earlier OmniFlow UTM parameters instead of duplicating them', () => {
  const once = addPinterestUtm('https://example.com/a?x=1', 1);
  const twice = addPinterestUtm(once, 4);
  const url = new URL(twice);
  expect(url.searchParams.getAll('utm_source')).toEqual(['pinterest']);
  expect(url.searchParams.getAll('utm_medium')).toEqual(['organic']);
  expect(url.searchParams.getAll('utm_content')).toEqual(['pin-04']);
  expect(url.searchParams.get('x')).toBe('1');
  const foreign = new URL(
    addPinterestUtm('https://example.com/a?utm_source=facebook&utm_medium=cpc&utm_content=ad', 1)
  );
  expect(foreign.searchParams.getAll('utm_source')).toEqual(['pinterest']);
  expect(foreign.searchParams.getAll('utm_medium')).toEqual(['organic']);
});

test('keeps the #fragment after the query', () => {
  expect(addPinterestUtm('https://example.com/a?x=1#section-2', 1)).toBe(
    'https://example.com/a?x=1&utm_source=pinterest&utm_medium=organic&utm_content=pin-01#section-2'
  );
  expect(addPinterestUtm('https://example.com/a#top', 1)).toBe(
    'https://example.com/a?utm_source=pinterest&utm_medium=organic&utm_content=pin-01#top'
  );
});

test('encodes through the standard URL API (non-ASCII path, CSV-safe)', () => {
  const out = addPinterestUtm('https://example.com/küche-ideen?titel=Grün', 1);
  expect(out).toBe(
    'https://example.com/k%C3%BCche-ideen?titel=Gr%C3%BCn&utm_source=pinterest&utm_medium=organic&utm_content=pin-01'
  );
  expect(new URL(out).pathname).toBe('/k%C3%BCche-ideen');
  // A comma in a URL is quoted in the CSV instead of breaking the columns.
  const csv = generatePinterestCsv([pin({ link_url: 'https://example.com/a,b' })], { utmTracking: true });
  expect(csv).toContain('"https://example.com/a,b?utm_source=pinterest&utm_medium=organic&utm_content=pin-01"');
});

test('never invents a destination: relative, invalid and non-http links stay as is', () => {
  expect(addPinterestUtm('/article', 1)).toBe('/article');
  expect(addPinterestUtm('not a url', 1)).toBe('not a url');
  expect(addPinterestUtm('mailto:hello@example.com', 1)).toBe('mailto:hello@example.com');
});

test('does not mutate the Pin (pins.link_url is never changed)', () => {
  const p = pin({ link_url: 'https://example.com/article?x=1' });
  const snapshot = JSON.stringify(p);
  generatePinterestCsv([p], { utmTracking: true });
  formatPinterestLinkCell(p, 1, { utmTracking: true });
  expect(JSON.stringify(p)).toBe(snapshot);
});

test('existing export columns are unchanged when there is no link', () => {
  const p = pin({ link_url: null, publish_date: '2026-09-22T11:00:00.000Z' });
  expect(generatePinterestCsv([p], { utmTracking: true })).toBe(generatePinterestCsv([p]));
});

test('UTM module and CSV builder stay pure: no AI, network or database import', () => {
  for (const file of ['lib/analytics/utm.ts', 'lib/csv/pinterest.ts']) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(/openrouter|supabase|fetch\(|lib\/ai|lib\/social|wordpress/i);
  }
});

test('UTM is wired only into the Pinterest CSV export entry points', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
  for (const file of ['components/pinterest/export-csv-button.tsx', 'components/history/history-actions.tsx']) {
    const source = read(file);
    expect(source).toContain('generatePinterestCsv(');
    expect(source).toContain('{ utmTracking }');
    expect(source).toContain('useState(true)');
    expect(source).toContain('Add UTM tracking');
  }
});

test('no other platform or feature uses the UTM builder', () => {
  const importers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && readFileSync(join(process.cwd(), rel), 'utf8').includes("from '@/lib/analytics/utm'")) {
        importers.push(rel);
      }
    }
  };
  for (const dir of ['app', 'components', 'lib']) walk(dir);
  expect(importers).toEqual(['lib/csv/pinterest.ts']);
});
