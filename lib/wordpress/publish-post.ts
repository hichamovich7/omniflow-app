import { getMetaTitle } from '@/lib/wordpress/export';
import {
  addInternalLinks,
  skippedInternalLinks,
  type InternalLinkContext,
  type InternalLinksReport,
} from '@/lib/wordpress/internal-links';
import {
  findOrCreateTag,
  upsertPost,
  WordPressApiError,
  type CreatePostInput,
  type WordPressPostResult,
  type WordPressSiteCredentials,
} from '@/lib/wordpress/rest-client';
import {
  RANK_MATH_FAILED_WARNING,
  RANK_MATH_NOT_DETECTED_WARNING,
  saveRankMathMeta,
  type RankMathResult,
} from '@/lib/wordpress/seo/rank-math';
import {
  buildWordPressTags,
  resolveFocusKeyword,
  type PinsSeoSource,
  type ResolvedFocusKeyword,
} from '@/lib/wordpress/tags';
import type { WordPressArticle, WordPressArticleSize, WordPressGeneration } from '@/types/wordpress';

export interface SendArticleInput {
  article: Pick<WordPressArticle, 'id' | 'title' | 'meta_title' | 'slug' | 'meta_description' | 'wp_post_id'>;
  generation: Pick<WordPressGeneration, 'keyword' | 'source_type' | 'seo_keywords' | 'status'> & {
    article_size?: WordPressArticleSize | null;
  };
  /** Pins method only — the selected Pins' keywords and source keyword. */
  pins?: PinsSeoSource | null;
  /** Final HTML, leading H1 already stripped (the title goes in `title`). */
  html: string;
  status: CreatePostInput['status'];
  date?: string;
  categoryIds?: number[];
  featuredMediaId?: number;
  /**
   * Link a few of the site's published posts from the body before sending
   * (TASK-FIX-051). Off by default; the publish route turns it on.
   */
  insertInternalLinks?: boolean;
}

export interface SendArticleResult {
  post: WordPressPostResult;
  tagIds: number[];
  focusKeyword: ResolvedFocusKeyword;
  rankMath: RankMathResult;
  internalLinks: InternalLinksReport;
  warnings: string[];
}

export const NO_TAGS_WARNING = 'No reliable tags found — the post was sent without tags.';
export const TAGS_NOT_CREATED_WARNING = 'Tags could not be found or created on WordPress — the post was sent without tags.';
export const NO_FOCUS_KEYWORD_WARNING = 'No reliable focus keyword found — the Rank Math focus keyword was left empty.';

export function buildPostInput(
  input: SendArticleInput,
  tagIds: number[]
): CreatePostInput {
  return {
    // The H1. meta_title is the SERP title and goes to Rank Math only.
    title: input.article.title,
    content: input.html,
    excerpt: input.article.meta_description || undefined,
    // OmniFlow's validated slug, sent explicitly so WP never re-derives it
    // from the title.
    slug: input.article.slug || undefined,
    status: input.status,
    date: input.date,
    categoryIds: input.categoryIds,
    tagIds,
    featuredMediaId: input.featuredMediaId,
  };
}

/**
 * The internal-link context of an article — one builder for the publish and
 * the export paths so both select links exactly the same way.
 */
export function buildInternalLinkContext(input: {
  article: Pick<WordPressArticle, 'title' | 'slug' | 'wp_post_id'>;
  generation: SendArticleInput['generation'];
  pins: PinsSeoSource | null;
  categoryIds: number[];
  tagIds: number[];
}): InternalLinkContext {
  return {
    primaryKeyword: resolveFocusKeyword(input.generation, input.pins).keyword,
    seoKeywords: buildWordPressTags(input.generation, input.pins),
    title: input.article.title,
    categoryIds: input.categoryIds,
    tagIds: input.tagIds,
    articleSize: input.generation.article_size ?? null,
    excludePostId: input.article.wp_post_id,
    excludeSlug: input.article.slug || null,
  };
}

async function resolveTagIds(site: WordPressSiteCredentials, names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    const id = await findOrCreateTag(site, name);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Create/update the post → take its WP id → write Rank Math meta. The post
 * step throws (the caller marks the publish failed); the Rank Math step never
 * does — its failure only adds a warning, the post, slug, content and tags
 * stay as sent. Re-running reuses wp_post_id, so no duplicate post.
 */
export async function sendArticleToWordPress(
  site: WordPressSiteCredentials,
  input: SendArticleInput
): Promise<SendArticleResult> {
  const pins = input.pins ?? null;
  const tagNames = buildWordPressTags(input.generation, pins);
  const tagIds = await resolveTagIds(site, tagNames);
  const focusKeyword = resolveFocusKeyword(input.generation, pins);

  // Never blocking: on any failure the HTML is sent unchanged.
  let html = input.html;
  let internalLinks = skippedInternalLinks();
  if (input.insertInternalLinks) {
    const linked = await addInternalLinks(
      site,
      input.html,
      buildInternalLinkContext({ ...input, pins, categoryIds: input.categoryIds ?? [], tagIds })
    );
    html = linked.html;
    internalLinks = linked.report;
  }

  const postInput = buildPostInput({ ...input, html }, tagIds);

  let post: WordPressPostResult;
  try {
    post = await upsertPost(site, input.article.wp_post_id, postInput);
  } catch (err) {
    if (err instanceof WordPressApiError && err.status === 404 && input.article.wp_post_id) {
      // The previously-published post no longer exists on WordPress —
      // fall back to creating a fresh one.
      post = await upsertPost(site, null, postInput);
    } else {
      throw err;
    }
  }

  const rankMath = await saveRankMathMeta(site, post.id, {
    title: getMetaTitle(input.article),
    description: input.article.meta_description,
    focusKeyword: focusKeyword.keyword,
  });

  const warnings: string[] = [];
  if (tagNames.length === 0) warnings.push(NO_TAGS_WARNING);
  else if (tagIds.length === 0) warnings.push(TAGS_NOT_CREATED_WARNING);
  if (!focusKeyword.keyword && rankMath.status !== 'not_detected') warnings.push(NO_FOCUS_KEYWORD_WARNING);
  if (rankMath.status === 'not_detected') {
    warnings.push(RANK_MATH_NOT_DETECTED_WARNING);
  } else if (rankMath.status === 'failed') {
    warnings.push(RANK_MATH_FAILED_WARNING);
    // Step, HTTP code and technical message only — no credentials, no content.
    console.warn(
      `[wordpress publish] step=rank_math_update_meta article=${input.article.id} post=${post.id} ` +
        `http=${rankMath.httpStatus ?? 'none'} message=${rankMath.message}`
    );
  }

  warnings.push(...internalLinks.warnings);

  return { post, tagIds, focusKeyword, rankMath, internalLinks, warnings };
}
