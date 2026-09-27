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

export const NO_LINK_NOTICE = 'No link added automatically — add your destination URL manually in the CSV.';

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

export function articlePinterestCreateHref(articleId: string, generationId?: string): string {
  const params = new URLSearchParams({ source: 'wordpress', articleId });
  if (generationId) params.set('generationId', generationId);
  return `/pinterest/create?${params.toString()}`;
}
