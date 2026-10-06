import { getMetaTitle } from '@/lib/wordpress/export';
import {
  addInternalLinks,
  skippedInternalLinks,
  type InternalLinkContext,
  type InternalLinksReport,
} from '@/lib/wordpress/internal-links';
import { silentPublishLogger, type PublishLogger } from '@/lib/wordpress/publish-log';
import { findReconcilablePost, type PostIdClaimCheck, type ReconcileResult } from '@/lib/wordpress/publish-reconcile';
import {
  findOrCreateTag,
  isUncertainWordPressError,
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
  /**
   * FAQPage JSON-LD <script> (faq-schema.ts, TASK-FIX-055) appended after
   * the body — never part of the visible text. Omitted = no schema.
   */
  faqSchema?: string | null;
  /**
   * Persists the WP post id as soon as one is known (created, updated or
   * adopted) — before FAQ, Rank Math or any other secondary step (TASK-FIX-058).
   */
  onPostId?: (postId: number, source: 'created' | 'updated' | 'adopted') => Promise<void>;
  /** True when another OmniFlow article already holds this WP post id — such a post is never adopted. */
  isPostIdClaimed?: PostIdClaimCheck;
  /** Structured step/duration logs; silent when omitted. */
  log?: PublishLogger;
}

/** added = kept by WordPress; removed = WordPress filtered it, post re-sent without it. */
export type FaqSchemaStatus = 'added' | 'not_added' | 'removed';

export interface SendArticleResult {
  post: WordPressPostResult;
  tagIds: number[];
  focusKeyword: ResolvedFocusKeyword;
  rankMath: RankMathResult;
  internalLinks: InternalLinksReport;
  faqSchema: FaqSchemaStatus;
  warnings: string[];
}

export const FAQ_SCHEMA_REMOVED_WARNING =
  'The FAQ schema was filtered out by WordPress — the post was sent without it.';
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
 * The WordPress outcome is unknown: a write may have been committed but no
 * usable answer came back, and reconciliation could not settle it. `postId`
 * is the post known so far (null when a create could not be confirmed).
 * Never retried automatically.
 */
export class WordPressPublishUncertainError extends Error {
  postId: number | null;
  step: string;

  constructor(postId: number | null, step: string) {
    super(
      postId
        ? `WordPress did not confirm the save of post ${postId}. Check it on WordPress before retrying.`
        : 'WordPress did not confirm whether the post was created. Check WordPress before retrying.'
    );
    this.name = 'WordPressPublishUncertainError';
    this.postId = postId;
    this.step = step;
  }
}

function errorResult(err: unknown): { http?: number; result: string } {
  if (err instanceof WordPressApiError) return { http: err.status, result: err.kind };
  return { result: 'error' };
}

type PostIdSource = 'created' | 'updated' | 'adopted';

/**
 * Reconcile (adopt a post OmniFlow already created) → create or update the
 * post → persist its WP id at once (onPostId) → FAQ check → Rank Math meta.
 *
 * The post step throws: a WordPressPublishUncertainError when the outcome is
 * unknown, any other error when it really failed. Every id obtained (created,
 * updated or adopted) is handed to onPostId before any secondary step, so a
 * later failure never loses it and a retry updates the same post. Rank Math
 * never throws — its failure only adds a warning.
 */
export async function sendArticleToWordPress(
  site: WordPressSiteCredentials,
  input: SendArticleInput
): Promise<SendArticleResult> {
  const log = input.log ?? silentPublishLogger;
  const isClaimed: PostIdClaimCheck = input.isPostIdClaimed ?? (async () => false);
  const pins = input.pins ?? null;

  let started = Date.now();
  const tagNames = buildWordPressTags(input.generation, pins);
  const tagIds = await resolveTagIds(site, tagNames);
  log.step('tags', { ms: Date.now() - started, count: tagIds.length });
  const focusKeyword = resolveFocusKeyword(input.generation, pins);

  let persistedId = input.article.wp_post_id;
  async function remember(postId: number, source: PostIdSource) {
    if (postId === persistedId) return;
    const t = Date.now();
    try {
      await input.onPostId?.(postId, source);
      persistedId = postId;
      log.step('save_post_id', { ms: Date.now() - t, wpPostId: postId, result: source });
    } catch {
      log.warn('save_post_id', { ms: Date.now() - t, wpPostId: postId, result: 'failed' });
    }
  }

  async function reconcile(step: string, claimCheck: PostIdClaimCheck = isClaimed): Promise<ReconcileResult> {
    const t = Date.now();
    const found = await findReconcilablePost(site, input.article, claimCheck);
    log.step(step, {
      ms: Date.now() - t,
      result: found.outcome,
      ...(found.outcome === 'found' ? { wpPostId: found.post.id, count: found.matches } : {}),
      ...(found.outcome === 'unknown' && found.http !== undefined ? { http: found.http } : {}),
    });
    return found;
  }

  // A post an earlier attempt created but never recorded is adopted, never duplicated.
  let knownPostId = input.article.wp_post_id;
  if (!knownPostId) {
    const found = await reconcile('reconcile_before_create');
    if (found.outcome === 'found') {
      knownPostId = found.post.id;
      await remember(knownPostId, 'adopted');
    }
  }
  const article = { ...input.article, wp_post_id: knownPostId };

  // Never blocking: on any failure the HTML is sent unchanged.
  let html = input.html;
  let internalLinks = skippedInternalLinks();
  if (input.insertInternalLinks) {
    started = Date.now();
    const linked = await addInternalLinks(
      site,
      input.html,
      buildInternalLinkContext({ ...input, article, pins, categoryIds: input.categoryIds ?? [], tagIds })
    );
    html = linked.html;
    internalLinks = linked.report;
    log.step('internal_links', { ms: Date.now() - started, result: internalLinks.status, count: internalLinks.insertedCount });
  }

  // Appended after internal linking, so the link tokenizer never sees it.
  const faqSchema = input.faqSchema?.trim() || null;
  const postInput = buildPostInput({ ...input, html: faqSchema ? `${html.trimEnd()}
${faqSchema}
` : html }, tagIds);

  /** Update an existing post. 'missing' = 404, the post no longer exists. */
  async function updatePost(postId: number, payload: CreatePostInput, step: string): Promise<WordPressPostResult | 'missing'> {
    const t = Date.now();
    try {
      const post = await upsertPost(site, postId, payload);
      log.step(step, { ms: Date.now() - t, wpPostId: post.id, result: 'updated' });
      return post;
    } catch (err) {
      log.warn(step, { ms: Date.now() - t, wpPostId: postId, ...errorResult(err) });
      if (err instanceof WordPressApiError && err.status === 404) return 'missing';
      if (isUncertainWordPressError(err)) throw new WordPressPublishUncertainError(postId, step);
      throw err;
    }
  }

  /** Create a post; on an ambiguous failure, reconcile before concluding. */
  async function createPost(): Promise<{ post: WordPressPostResult; source: 'created' | 'adopted' }> {
    const t = Date.now();
    try {
      const post = await upsertPost(site, null, postInput);
      log.step('post_create', { ms: Date.now() - t, wpPostId: post.id, result: 'created' });
      return { post, source: 'created' };
    } catch (err) {
      log.warn('post_create', { ms: Date.now() - t, ...errorResult(err) });
      // A timeout, a lost connection, an unreadable 2xx or a 5xx can all come
      // after WordPress committed the post.
      const uncertain = isUncertainWordPressError(err);
      const serverError = err instanceof WordPressApiError && (err.status ?? 0) >= 500;
      if (!uncertain && !serverError) throw err;
      const found = await reconcile('reconcile_after_create');
      if (found.outcome === 'found') return { post: found.post, source: 'adopted' };
      // A 5xx with the post confirmed absent is a real failure. After a
      // timeout the request may still be running on WordPress: unknown.
      if (found.outcome === 'none' && !uncertain) throw err;
      throw new WordPressPublishUncertainError(null, 'post_create');
    }
  }

  let post: WordPressPostResult | null = null;
  if (knownPostId) {
    const updated = await updatePost(knownPostId, postInput, 'post_update');
    if (updated !== 'missing') {
      post = updated;
    } else {
      // The previously-sent post no longer exists on WordPress — adopt another
      // exact match if there is one, else fall back to creating a fresh post.
      const missingId = knownPostId;
      const found = await reconcile('reconcile_after_missing', async (id) => id === missingId || (await isClaimed(id)));
      if (found.outcome === 'found') {
        await remember(found.post.id, 'adopted');
        const retried = await updatePost(found.post.id, postInput, 'post_update');
        if (retried !== 'missing') post = retried;
      }
    }
  }
  if (!post) {
    const created = await createPost();
    await remember(created.post.id, created.source);
    if (created.source === 'adopted') {
      // Adopted after a lost answer: re-sent so the post holds exactly this
      // attempt's content and status.
      const updated = await updatePost(created.post.id, postInput, 'post_update');
      if (updated === 'missing') throw new WordPressPublishUncertainError(null, 'post_update');
      post = updated;
    } else {
      post = created.post;
    }
  }
  await remember(post.id, 'updated');

  // A user without unfiltered_html gets <script> stripped by kses, which
  // would leave the JSON as visible text: unless the saved content still
  // holds the exact script, the same post is re-sent without it.
  let faqSchemaStatus: FaqSchemaStatus = 'not_added';
  if (faqSchema) {
    if (post.contentRaw?.includes(faqSchema)) {
      faqSchemaStatus = 'added';
    } else {
      console.warn(
        `[wordpress publish] step=faq_schema article=${input.article.id} post=${post.id} ` +
          `result=${post.contentRaw === undefined ? 'unverifiable' : 'filtered'} — re-sending without schema`
      );
      const resent = await updatePost(post.id, buildPostInput({ ...input, html }, tagIds), 'faq_resend');
      // Deleted between two calls: the id is kept, the outcome is unknown.
      if (resent === 'missing') throw new WordPressPublishUncertainError(post.id, 'faq_resend');
      post = resent;
      faqSchemaStatus = 'removed';
    }
  }

  started = Date.now();
  const rankMath = await saveRankMathMeta(site, post.id, {
    title: getMetaTitle(input.article),
    description: input.article.meta_description,
    focusKeyword: focusKeyword.keyword,
  });
  log.step('rank_math', {
    ms: Date.now() - started,
    wpPostId: post.id,
    result: rankMath.status,
    ...(rankMath.status === 'failed' && rankMath.httpStatus !== undefined ? { http: rankMath.httpStatus } : {}),
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
  if (faqSchemaStatus === 'removed') warnings.push(FAQ_SCHEMA_REMOVED_WARNING);

  return { post, tagIds, focusKeyword, rankMath, internalLinks, faqSchema: faqSchemaStatus, warnings };
}
