// Sort by Status on the dashboard's Content streams table. The chosen sort is
// remembered in localStorage (a per-viewer convenience only — never needed to
// render); the default is the original stream order.
import type { StreamHealth } from '@/types/dashboard';

/** 'none' = original order, 'urgency' = most urgent first, 'reverse' = least urgent first. */
export type StreamStatusSort = 'none' | 'urgency' | 'reverse';

export const STREAM_STATUS_SORT_STORAGE_KEY = 'omniflow:dashboard-streams-status-sort';

/** Most urgent first. 'planned' streams are listed apart, but ranked last for completeness. */
export const STREAM_HEALTH_URGENCY: readonly StreamHealth[] = [
  'create-now',
  'needs-content',
  'needs-setup',
  'warming',
  'on-track',
  'paused',
  'planned',
];

/** Header click cycle: original → most urgent first → least urgent first → original. */
export function nextStreamStatusSort(current: StreamStatusSort): StreamStatusSort {
  if (current === 'none') return 'urgency';
  if (current === 'urgency') return 'reverse';
  return 'none';
}

/** Stable: streams with the same status keep their original relative order. */
export function sortStreamsByStatus<T extends { health: StreamHealth }>(streams: T[], sort: StreamStatusSort): T[] {
  if (sort === 'none') return streams;
  const direction = sort === 'urgency' ? 1 : -1;
  return streams
    .map((stream, index) => ({ stream, index }))
    .sort(
      (a, b) =>
        direction * (STREAM_HEALTH_URGENCY.indexOf(a.stream.health) - STREAM_HEALTH_URGENCY.indexOf(b.stream.health)) ||
        a.index - b.index
    )
    .map(({ stream }) => stream);
}

/** Anything other than a known value means "no stored choice". */
export function parseStoredStreamStatusSort(raw: string | null): StreamStatusSort {
  return raw === 'urgency' || raw === 'reverse' ? raw : 'none';
}

/** Minimal Storage surface, so the read/write rules can be tested without a browser. */
export type StreamStatusSortStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The in-memory value (this page view) wins, so sorting keeps working when localStorage is unavailable. */
export function readStreamStatusSort(
  memory: { value: StreamStatusSort | null },
  getStorage: () => StreamStatusSortStorage | null
): StreamStatusSort {
  if (memory.value) return memory.value;
  try {
    return parseStoredStreamStatusSort(getStorage()?.getItem(STREAM_STATUS_SORT_STORAGE_KEY) ?? null);
  } catch {
    return 'none';
  }
}

export function writeStreamStatusSort(
  sort: StreamStatusSort,
  memory: { value: StreamStatusSort | null },
  getStorage: () => StreamStatusSortStorage | null
): void {
  memory.value = sort;
  try {
    getStorage()?.setItem(STREAM_STATUS_SORT_STORAGE_KEY, sort);
  } catch {
    // the in-memory value above is enough for this page view
  }
}
