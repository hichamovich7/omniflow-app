import { marked } from 'marked';
import type { WordPressArticle } from '@/types/wordpress';

/**
 * `content` is already the source of truth (Markdown, image markers already
 * resolved to real URLs at generation time) — this is a passthrough, kept as
 * a named export so callers don't reach into the article shape directly.
 */
export function exportToMarkdown(article: Pick<WordPressArticle, 'content'>): string {
  return article.content;
}

export function exportToHtml(article: Pick<WordPressArticle, 'content'>): string {
  return marked.parse(article.content, { async: false }) as string;
}
