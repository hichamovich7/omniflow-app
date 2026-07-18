import { marked } from 'marked';
import { truncateAtWordBoundary } from '@/lib/utils/text-truncate';
import type { WordPressArticle } from '@/types/wordpress';

const META_TITLE_MAX_LENGTH = 70;

/**
 * `content` is already the source of truth (Markdown, image markers already
 * resolved to real URLs at generation time) — this is a passthrough, kept as
 * a named export so callers don't reach into the article shape directly.
 */
export function exportToMarkdown(article: Pick<WordPressArticle, 'content'>): string {
  return article.content;
}

/**
 * Articles generated before migration 015 have no `meta_title` — fall back
 * to the H1 `title`, truncated to the same strict SEO limit, so every
 * article (old or new) has a usable <title>/SERP-facing string.
 */
export function getMetaTitle(article: Pick<WordPressArticle, 'title' | 'meta_title'>): string {
  return article.meta_title ?? truncateAtWordBoundary(article.title, META_TITLE_MAX_LENGTH);
}

export function exportToHtml(article: Pick<WordPressArticle, 'content'>): string {
  return marked.parse(article.content, { async: false }) as string;
}
