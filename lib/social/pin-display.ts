import type { PinterestAngle } from '@/types/pinterest';

/**
 * Client-safe display helpers for Pins generated from an article (TASK-044
 * phase 2). No server import here: used by the result cards.
 */

export const ANGLE_LABELS: Record<PinterestAngle, string> = {
  curiosity: 'Curiosity',
  'problem-solution': 'Problem → Solution',
  listicle: 'Listicle',
  discovery: 'Discovery',
  'article-promise': 'Article Promise',
};

export const NO_LINK_NOTICE =
  'No destination URL — add one with "Edit destination URL" on the generation page, or in the CSV.';

export interface PinTextFields {
  title: string;
  description: string;
  keywords: string;
  board: string;
}

/** "Copy full Pin": the text fields only — never a URL. */
export function pinAsText(pin: PinTextFields): string {
  return `Title: ${pin.title}\nDescription: ${pin.description}\nKeywords: ${pin.keywords}\nBoard: ${pin.board}`;
}

/** Pinterest from an existing WordPress post: the picker (no post) or the post's form. */
export function wordpressPostPinterestHref(
  source: { siteId: string; postId?: number | null },
  generationId?: string
): string {
  const params = new URLSearchParams({ siteId: source.siteId });
  if (source.postId) params.set('postId', String(source.postId));
  if (generationId) params.set('generationId', generationId);
  return `/pinterest/from-wordpress?${params.toString()}`;
}

/** Key of the article-grounded Pin metadata in pins.image_analysis (lib/pinterest/article-briefs.ts). */
export const ARTICLE_SOURCE_METADATA_KEY = '_articleSource';

/** The article section a Pin was built from, for display only (null for other Pins). */
export function readPinSourceSection(imageAnalysisJson: string | null): string | null {
  if (!imageAnalysisJson) return null;
  try {
    const value = (JSON.parse(imageAnalysisJson) as Record<string, unknown>)?.[ARTICLE_SOURCE_METADATA_KEY] as
      | { brief?: { sourceSection?: unknown } }
      | undefined;
    const section = value?.brief?.sourceSection;
    return typeof section === 'string' && section.trim() ? section : null;
  } catch {
    return null;
  }
}

export function articlePinterestCreateHref(articleId: string, generationId?: string): string {
  const params = new URLSearchParams({ source: 'wordpress', articleId });
  if (generationId) params.set('generationId', generationId);
  return `/pinterest/create?${params.toString()}`;
}
