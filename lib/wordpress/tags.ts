import type { WordPressGeneration } from '@/types/wordpress';

export const MAX_WORDPRESS_TAGS = 8;
export const MAX_WORDPRESS_TAG_LENGTH = 60;
const MAX_KEYWORD_LENGTH = 200;

/**
 * SEO data from the Pinterest side, loaded only for the Pins method
 * (getPinsSeoSource in lib/queries/wordpress.ts). `sourceKeyword` is the
 * keyword the user typed on the Pinterest generation the selected Pins come
 * from — null when absent or when the Pins don't share one keyword.
 */
export interface PinsSeoSource {
  sourceKeyword: string | null;
  /** Each selected Pin's comma-separated `pins.keywords`, in Pin order. */
  pinKeywords: string[];
}

export type FocusKeywordSource = 'wordpress_generation.keyword' | 'pinterest_generation.keyword';

export interface ResolvedFocusKeyword {
  keyword: string | null;
  source: FocusKeywordSource | null;
}

type GenerationSeoFields = Pick<WordPressGeneration, 'keyword' | 'source_type' | 'seo_keywords' | 'status'>;

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// URL method placeholder before the AI-resolved keyword replaces it
// (deriveInitialKeyword in the generate-from-url route).
const URL_METHOD_PASTED_PLACEHOLDER = 'Pasted content';

/**
 * A usable keyword: non-empty, not a URL, not over-long. Never derived from
 * anything — values that fail are dropped, not repaired.
 */
export function asReliableKeyword(value: string | null | undefined): string | null {
  const keyword = collapseSpaces(value ?? '');
  if (!keyword || keyword.length > MAX_KEYWORD_LENGTH) return null;
  if (/^https?:\/\//i.test(keyword) || /^www\./i.test(keyword)) return null;
  return keyword;
}

/**
 * The Rank Math focus keyword, per generation method:
 * - keyword: the keyword the user typed;
 * - url: the AI-resolved keyword stored on completion — never the URL or
 *   pasted-text placeholder it replaces;
 * - pins: wordpress_generations.keyword is a synthesized "Pin title + Pin
 *   title" label, never used; the source Pinterest generation's keyword is.
 * No reliable value → null (the field is left empty, never invented).
 */
export function resolveFocusKeyword(
  generation: GenerationSeoFields,
  pins: PinsSeoSource | null = null
): ResolvedFocusKeyword {
  if (generation.source_type === 'pins') {
    const keyword = asReliableKeyword(pins?.sourceKeyword);
    // A source keyword identical to the pin-title label is that label.
    if (!keyword || tagKey(keyword) === tagKey(generation.keyword ?? '')) return { keyword: null, source: null };
    return { keyword, source: 'pinterest_generation.keyword' };
  }

  if (generation.source_type === 'url') {
    if (generation.status !== 'completed') return { keyword: null, source: null };
    const keyword = asReliableKeyword(generation.keyword);
    if (!keyword || keyword === URL_METHOD_PASTED_PLACEHOLDER) return { keyword: null, source: null };
    return { keyword, source: 'wordpress_generation.keyword' };
  }

  const keyword = asReliableKeyword(generation.keyword);
  return keyword ? { keyword, source: 'wordpress_generation.keyword' } : { keyword: null, source: null };
}

// Dedupe key only — the tag keeps its original casing and accents, so the
// article's language is preserved as written.
function tagKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function splitKeywords(value: string | null | undefined): string[] {
  return (value ?? '').split(',');
}

/**
 * Builds the WordPress tag names from data already stored — no AI call, no
 * padding (0, 1 or 2 tags is a valid result). Sources, in order:
 *   1. the generation's seo_keywords,
 *   2. the selected Pins' keywords (Pins method),
 *   3. the resolved primary keyword (resolveFocusKeyword — so never the
 *      pin-title label or a placeholder).
 * The article itself stores no tags. An empty source is simply skipped.
 * Duplicates (case/space/hyphen-insensitive), empty and over-long values are
 * dropped; capped at MAX_WORDPRESS_TAGS.
 */
export function buildWordPressTags(generation: GenerationSeoFields, pins: PinsSeoSource | null = null): string[] {
  const candidates = [
    ...splitKeywords(generation.seo_keywords),
    ...(pins?.pinKeywords ?? []).flatMap(splitKeywords),
    resolveFocusKeyword(generation, pins).keyword,
  ];
  // Never a tag, even if it was also typed into a keyword field.
  const pinTitleLabel = generation.source_type === 'pins' ? tagKey(generation.keyword ?? '') : null;
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const raw of candidates) {
    const tag = asReliableKeyword(raw);
    if (!tag || tag.length > MAX_WORDPRESS_TAG_LENGTH || tag === URL_METHOD_PASTED_PLACEHOLDER) continue;
    const key = tagKey(tag);
    if (seen.has(key) || key === pinTitleLabel) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === MAX_WORDPRESS_TAGS) break;
  }

  return tags;
}
