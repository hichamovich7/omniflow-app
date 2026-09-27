// Open/closed state of each project card on /wordpress/categories, remembered
// per project in localStorage (a per-viewer convenience only — never needed to
// render). Cards are compact until the viewer opens them.
export const CATEGORY_CARD_OPEN_STORAGE_PREFIX = 'omniflow:wp-category-card-open:';

export function categoryCardStorageKey(projectId: string): string {
  return `${CATEGORY_CARD_OPEN_STORAGE_PREFIX}${projectId}`;
}

/** '1' / '0' as written by the card; anything else means "no stored choice". */
export function parseStoredCategoryCardOpen(raw: string | null): boolean | null {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

export function serializeCategoryCardOpen(open: boolean): string {
  return open ? '1' : '0';
}

/** Host of the connected site ("example.com"), or the raw value if it is not a URL. */
export function siteDomain(siteUrl: string): string {
  try {
    return new URL(siteUrl).host.replace(/^www\./, '');
  } catch {
    return siteUrl;
  }
}

export function categoryCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'category' : 'categories'}`;
}

/** Project id targeted by a `#project-<id>` link (Project detail page), if any. */
export function projectIdFromHash(hash: string): string | null {
  const match = /^#project-(.+)$/.exec(hash);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Minimal Storage surface, so the read/write rules can be tested without a browser. */
export type CategoryCardStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Stored state for one card. The in-memory value (this page view) wins, so the
 * toggle keeps working when localStorage is unavailable or refuses writes.
 */
export function readCategoryCardOpen(
  projectId: string,
  memory: Map<string, boolean>,
  getStorage: () => CategoryCardStorage | null
): boolean {
  const key = categoryCardStorageKey(projectId);
  const inMemory = memory.get(key);
  if (inMemory !== undefined) return inMemory;
  try {
    return parseStoredCategoryCardOpen(getStorage()?.getItem(key) ?? null) ?? false;
  } catch {
    return false;
  }
}

export function writeCategoryCardOpen(
  projectIds: string[],
  open: boolean,
  memory: Map<string, boolean>,
  getStorage: () => CategoryCardStorage | null
): void {
  for (const projectId of projectIds) {
    const key = categoryCardStorageKey(projectId);
    memory.set(key, open);
    try {
      getStorage()?.setItem(key, serializeCategoryCardOpen(open));
    } catch {
      // the in-memory value above is enough for this page view
    }
  }
}
