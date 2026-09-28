import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import {
  STREAM_HEALTH_URGENCY,
  STREAM_STATUS_SORT_STORAGE_KEY,
  nextStreamStatusSort,
  parseStoredStreamStatusSort,
  readStreamStatusSort,
  sortStreamsByStatus,
  writeStreamStatusSort,
  type StreamStatusSort,
  type StreamStatusSortStorage,
} from '@/lib/dashboard/stream-status-sort';
import { STREAM_HEALTH_PRESENTATION } from '@/components/dashboard/stream-health-badge';
import type { StreamHealth } from '@/types/dashboard';

/** Dashboard Content streams — sort by Status. Offline: pure logic + source checks, no browser. */
const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

// Same order as the dashboard screenshot (original stream order).
const STREAMS: { id: string; health: StreamHealth }[] = [
  { id: 'badezimmer', health: 'needs-content' },
  { id: 'cardigan', health: 'warming' },
  { id: 'cat', health: 'create-now' },
  { id: 'sweater', health: 'warming' },
  { id: 'kuechen', health: 'on-track' },
  { id: 'wohnzimmer', health: 'warming' },
];
const ids = (list: { id: string }[]) => list.map((s) => s.id);

function fakeStorage(initial: Record<string, string> = {}): StreamStatusSortStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

test.describe('Content streams — sort by Status', () => {
  test('urgency order covers every status exactly once', () => {
    expect([...STREAM_HEALTH_URGENCY].sort()).toEqual(Object.keys(STREAM_HEALTH_PRESENTATION).sort());
    expect(STREAM_HEALTH_URGENCY.slice(0, 6)).toEqual(['create-now', 'needs-content', 'needs-setup', 'warming', 'on-track', 'paused']);
  });

  test('none keeps the original order', () => {
    expect(ids(sortStreamsByStatus(STREAMS, 'none'))).toEqual(ids(STREAMS));
  });

  test('urgency puts the most urgent first; ties keep their original order', () => {
    expect(ids(sortStreamsByStatus(STREAMS, 'urgency'))).toEqual(['cat', 'badezimmer', 'cardigan', 'sweater', 'wohnzimmer', 'kuechen']);
  });

  test('reverse puts the least urgent first; ties keep their original order', () => {
    expect(ids(sortStreamsByStatus(STREAMS, 'reverse'))).toEqual(['kuechen', 'cardigan', 'sweater', 'wohnzimmer', 'badezimmer', 'cat']);
  });

  test('does not mutate the input', () => {
    const copy = [...STREAMS];
    sortStreamsByStatus(STREAMS, 'urgency');
    expect(STREAMS).toEqual(copy);
  });

  test('clicks cycle none → urgency → reverse → none', () => {
    expect(nextStreamStatusSort('none')).toBe('urgency');
    expect(nextStreamStatusSort('urgency')).toBe('reverse');
    expect(nextStreamStatusSort('reverse')).toBe('none');
  });

  test('stored value: only known values are read, anything else is the original order', () => {
    expect(parseStoredStreamStatusSort('urgency')).toBe('urgency');
    expect(parseStoredStreamStatusSort('reverse')).toBe('reverse');
    for (const raw of [null, '', 'none', 'asc', 'URGENCY']) expect(parseStoredStreamStatusSort(raw)).toBe('none');
  });

  test('remembers the choice in localStorage and reads it back', () => {
    const storage = fakeStorage();
    writeStreamStatusSort('reverse', { value: null }, () => storage);
    expect(storage.data[STREAM_STATUS_SORT_STORAGE_KEY]).toBe('reverse');
    expect(readStreamStatusSort({ value: null }, () => storage)).toBe('reverse');
  });

  test('keeps working in memory when localStorage is unavailable or throws', () => {
    const memory: { value: StreamStatusSort | null } = { value: null };
    const throwing = (): StreamStatusSortStorage => {
      throw new Error('blocked');
    };
    expect(readStreamStatusSort(memory, throwing)).toBe('none');
    writeStreamStatusSort('urgency', memory, throwing);
    expect(readStreamStatusSort(memory, throwing)).toBe('urgency');
    expect(readStreamStatusSort({ value: null }, () => null)).toBe('none');
  });

  test('table: Status header is a button with an accessible label and aria-sort; planned streams stay apart', () => {
    const table = read('components/dashboard/content-streams-table.tsx');
    expect(table).toContain("'use client'");
    expect(table).toContain('<TableHead aria-sort={ariaSort}>');
    expect(table).toContain('aria-label={sortLabel}');
    expect(table).toContain('sortStreamsByStatus(coverage, sort)');
    const overview = read('components/dashboard/content-streams-overview.tsx');
    expect(overview).not.toContain("'use client'");
    expect(overview).toContain('<ContentStreamsTable coverage={coverage} />');
    expect(overview).toContain('splitPlannedStreams(allStreams)');
  });
});
