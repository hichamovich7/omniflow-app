import { expect, test } from 'playwright/test';
import { formatPinterestBoardCell, generatePinterestCsv } from '@/lib/csv/pinterest';
import type { Pin } from '@/types/database';

// Offline by construction: pure string formatting, no network, no Supabase.

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
    link_url: null,
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

test('board only: exports the bare board name', () => {
  expect(formatPinterestBoardCell(pin({ board: 'Summer Eats', board_section: null }))).toBe(
    'Summer Eats'
  );
});

test('board + section: exports "Board/Section"', () => {
  expect(
    formatPinterestBoardCell(pin({ board: 'Summer Eats', board_section: 'Appetizers' }))
  ).toBe('Summer Eats/Appetizers');
});

test('no board: exports an empty cell, never "/Section" alone', () => {
  expect(formatPinterestBoardCell(pin({ board: '', board_section: 'Appetizers' }))).toBe('');
});

test('legacy pins without board_section export exactly as before', () => {
  // Pins created before this migration read back with board_section === null.
  expect(formatPinterestBoardCell(pin({ board: 'Boho Bathroom Ideas', board_section: null }))).toBe(
    'Boho Bathroom Ideas'
  );
});

test('accented characters and internal spaces are preserved verbatim', () => {
  expect(
    formatPinterestBoardCell(pin({ board: 'Recettes d\'été', board_section: 'Apéritifs & Amuse-bouches' }))
  ).toBe('Recettes d\'été/Apéritifs & Amuse-bouches');
});

test('CSV export: every row carries "Board/Section" in the existing "Pinterest board" column, other columns unaffected', () => {
  const pins = [
    pin({ id: 'p1', title: 'Pin One', board: 'Summer Eats', board_section: 'Appetizers' }),
    pin({ id: 'p2', title: 'Pin Two', board: 'Summer Eats', board_section: 'Appetizers' }),
    pin({ id: 'p3', title: 'Pin Three', board: 'Winter Cozy', board_section: null }),
  ];

  const csv = generatePinterestCsv(pins);
  const lines = csv.replace(/^﻿/, '').split('\n');
  // Keywords contain a comma, so escapeCsvField quotes them — pre-existing
  // behavior, unrelated to this feature.
  const quotedKeywords = `"${pins[0].keywords}"`;

  expect(lines[0]).toBe(
    ['Title', 'Media URL', 'Pinterest board', 'Description', 'Link', 'Publish date', 'Keywords or tags'].join(',')
  );
  expect(lines[1]).toBe(
    ['Pin One', 'https://example.com/image.png', 'Summer Eats/Appetizers', pins[0].description, '', '', quotedKeywords].join(',')
  );
  expect(lines[2]).toBe(
    ['Pin Two', 'https://example.com/image.png', 'Summer Eats/Appetizers', pins[1].description, '', '', quotedKeywords].join(',')
  );
  expect(lines[3]).toBe(
    ['Pin Three', 'https://example.com/image.png', 'Winter Cozy', pins[2].description, '', '', quotedKeywords].join(',')
  );
});
