import { isValidUuid } from '@/lib/utils/uuid';

/**
 * Client-safe helpers of "Rewrite article" (no server import). The new
 * version opens with `?rewrittenFrom=<previous generation id>` so its page
 * can link back to the version it was rewritten from — the link is not
 * stored (no migration): both versions simply live in the history.
 */
export const REWRITTEN_FROM_PARAM = 'rewrittenFrom';

export function rewrittenArticleHref(newGenerationId: string, previousGenerationId: string): string {
  return `/wordpress/${newGenerationId}?${REWRITTEN_FROM_PARAM}=${encodeURIComponent(previousGenerationId)}`;
}

/** The previous version id from the query string — only a valid UUID other than the page's own id. */
export function readRewrittenFrom(value: string | string[] | undefined, currentId: string): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && isValidUuid(candidate) && candidate !== currentId ? candidate : null;
}

/** Only completed articles can be rewritten. */
export function canRewriteArticle(
  generation: { status: string },
  article: { status: string; content: string } | null
): boolean {
  return generation.status === 'completed' && !!article && article.status === 'completed' && article.content.trim() !== '';
}
