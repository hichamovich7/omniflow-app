import { marked } from 'marked';
import { truncateAtWordBoundary } from '@/lib/utils/text-truncate';
import type { WordPressArticle } from '@/types/wordpress';

const META_TITLE_MAX_LENGTH = 70;

/**
 * `content` always starts with "# {title}" (see the article-writing prompt)
 * — the stored source of truth deliberately keeps it, useful for a future
 * destination with no separate "title" field. Every consumer that transmits
 * the title through its own channel instead (WordPress's `title` post field,
 * or a user pasting the title into WordPress's Title field after Copy
 * Markdown/HTML — both flows land on the same site, TASK-FIX-008) would
 * otherwise render it twice, stacked. No-op if `content` doesn't start with
 * an H1.
 */
export function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#[ \t]+[^\r\n]*(\r?\n)+/, '');
}

export function exportToMarkdownForWordPress(article: Pick<WordPressArticle, 'content'>): string {
  return stripLeadingH1(article.content);
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

export function exportToHtmlForWordPress(article: Pick<WordPressArticle, 'content'>): string {
  return marked.parse(stripLeadingH1(article.content), { async: false }) as string;
}
