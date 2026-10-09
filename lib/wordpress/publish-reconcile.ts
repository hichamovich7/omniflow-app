import {
  findPostsBySlug,
  WordPressApiError,
  type TimeoutLimiter,
  type WordPressPostMatch,
  type WordPressSiteCredentials,
} from '@/lib/wordpress/rest-client';

/**
 * Publish reconciliation (TASK-FIX-058): before creating a post — and after a
 * create whose answer was lost — look for the post OmniFlow may already have
 * created, so a retry updates it instead of creating a duplicate.
 *
 * A post is adopted only when BOTH its slug and its raw title match the
 * article exactly, and no other OmniFlow article already holds its id. A
 * post with the same slug but another title is never adopted.
 */

export type ReconcileResult =
  | { outcome: 'found'; post: WordPressPostMatch; matches: number }
  | { outcome: 'none' }
  /** The lookup itself failed — nothing can be concluded. */
  | { outcome: 'unknown'; http?: number };

/** True when another OmniFlow article (same project) already uses this WP post id. */
export type PostIdClaimCheck = (postId: number) => Promise<boolean>;

// WordPress stores slugs lowercased and percent-encodes non-ASCII ones; the
// comparison is exact on the decoded value.
function slugKey(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // not percent-encoded
  }
  return decoded.trim().toLowerCase();
}

export function isExactPostMatch(post: Pick<WordPressPostMatch, 'slug' | 'titleRaw'>, slug: string, title: string): boolean {
  if (post.titleRaw === null) return false;
  return slugKey(post.slug) === slugKey(slug) && post.titleRaw.trim() === title.trim();
}

export async function findReconcilablePost(
  site: WordPressSiteCredentials,
  article: { slug: string; title: string },
  isClaimed: PostIdClaimCheck,
  limit?: TimeoutLimiter
): Promise<ReconcileResult> {
  if (!article.slug.trim() || !article.title.trim()) return { outcome: 'none' };

  let posts: WordPressPostMatch[];
  try {
    posts = await findPostsBySlug(site, article.slug, limit);
  } catch (err) {
    return { outcome: 'unknown', http: err instanceof WordPressApiError ? err.status : undefined };
  }

  // Oldest first: if earlier attempts already left duplicates, the original is kept.
  const exact = posts
    .filter((post) => isExactPostMatch(post, article.slug, article.title))
    .sort((a, b) => a.id - b.id);

  for (const post of exact) {
    let claimed: boolean;
    try {
      claimed = await isClaimed(post.id);
    } catch {
      // Cannot verify the id is free — never adopt on a guess.
      claimed = true;
    }
    if (!claimed) return { outcome: 'found', post, matches: exact.length };
  }
  return { outcome: 'none' };
}
