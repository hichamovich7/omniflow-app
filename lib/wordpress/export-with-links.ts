import { exportToHtmlForWordPress, exportToMarkdownForWordPress } from '@/lib/wordpress/export';
import { linkContent, skippedInternalLinks, type InternalLinksReport } from '@/lib/wordpress/internal-links';
import { buildInternalLinkContext, type SendArticleInput } from '@/lib/wordpress/publish-post';
import { findExistingTagId, type WordPressSiteCredentials } from '@/lib/wordpress/rest-client';
import { buildWordPressTags, type PinsSeoSource } from '@/lib/wordpress/tags';
import type { WordPressArticle } from '@/types/wordpress';

/**
 * Copy Markdown / Copy HTML with automatic internal links (TASK-FIX-052).
 * Computed on demand when the user copies — never while rendering
 * /wordpress/[id] — from the stored article, which is never modified.
 * Same selection as the publish path (buildInternalLinkContext +
 * linkContent), except that tags are only looked up, never created.
 */

export type ExportFormat = 'html' | 'markdown';

export interface PrepareExportInput {
  article: Pick<WordPressArticle, 'content' | 'title' | 'slug' | 'wp_post_id'>;
  generation: SendArticleInput['generation'];
  pins: PinsSeoSource | null;
  categoryIds: number[];
  format: ExportFormat;
  includeInternalLinks: boolean;
}

export interface PreparedExport {
  content: string;
  internalLinks: InternalLinksReport;
  /** Published posts that could be linked — 0 on a new blog, a failure or when skipped. */
  availablePosts: number;
}

export function baseExport(article: Pick<WordPressArticle, 'content'>, format: ExportFormat): string {
  return format === 'html' ? exportToHtmlForWordPress(article) : exportToMarkdownForWordPress(article);
}

async function lookupTagIds(site: WordPressSiteCredentials, names: string[]): Promise<number[]> {
  const ids = await Promise.all(names.map((name) => findExistingTagId(site, name)));
  return [...new Set(ids.filter((id): id is number => id !== null))];
}

/**
 * Never throws: without a WordPress site, with the option off or on any
 * WordPress failure, the original export is returned unchanged.
 */
export async function prepareArticleExport(
  site: WordPressSiteCredentials | null,
  input: PrepareExportInput
): Promise<PreparedExport> {
  const content = baseExport(input.article, input.format);
  if (!input.includeInternalLinks || !site) {
    return { content, internalLinks: skippedInternalLinks(), availablePosts: 0 };
  }

  const tagIds = await lookupTagIds(site, buildWordPressTags(input.generation, input.pins));
  const context = buildInternalLinkContext({
    article: input.article,
    generation: input.generation,
    pins: input.pins,
    categoryIds: input.categoryIds,
    tagIds,
  });
  const linked = await linkContent(site, content, context, input.format, '[wordpress export]');
  return { content: linked.content, internalLinks: linked.report, availablePosts: linked.availablePosts };
}
