import type { SocialContentGeneration } from '@/lib/social/social-content';

/**
 * Article → drafts → publications (TASK-101 extension / TASK-103).
 * Client-safe. Several Facebook drafts can come from the same article; each
 * has its own text, image and publication (at most one per Page, migration
 * 046). The article is identified by the source columns the drafts share.
 */

type ArticleSourceColumns = Pick<
  SocialContentGeneration,
  'id' | 'source_wordpress_generation_id' | 'source_wordpress_site_id' | 'source_wordpress_article_id' | 'source_pinterest_generation_id'
>;

/** Stable key of a draft's article — the WordPress source first (also kept by Pinterest-made drafts). */
export function facebookArticleKey(row: ArticleSourceColumns): string {
  if (row.source_wordpress_generation_id) return `article:${row.source_wordpress_generation_id}`;
  if (row.source_wordpress_site_id && row.source_wordpress_article_id) return `post:${row.source_wordpress_site_id}:${row.source_wordpress_article_id}`;
  if (row.source_pinterest_generation_id) return `pinterest:${row.source_pinterest_generation_id}`;
  return `draft:${row.id}`;
}

export interface ArticleGroup<T> {
  key: string;
  title: string;
  items: T[];
}

/** Groups rows by article, keeping the order of first appearance (the list is newest first). */
export function groupByArticle<T extends ArticleSourceColumns & Pick<SocialContentGeneration, 'title' | 'source_title'>>(rows: T[]): ArticleGroup<T>[] {
  const groups = new Map<string, ArticleGroup<T>>();
  for (const row of rows) {
    const key = facebookArticleKey(row);
    const group = groups.get(key) ?? { key, title: row.source_title || row.title, items: [] };
    group.items.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export const VISUAL_ANGLE_LABELS: Record<NonNullable<SocialContentGeneration['visual_angle']>, string> = {
  wordpress: 'Article image',
  hero: 'Hero shot',
  lifestyle: 'Lifestyle scene',
  detail: 'Close-up detail',
};

/** What creating a post from an image costs — shown before confirmation. */
export const DERIVED_POST_COST_TEXT =
  'This writes 1 new post from the article: 1 text generation (up to 2 AI text calls if the first answer fails a check), counted as 1 generation of your hourly and trial limits. No image is generated — the image is reused.';
