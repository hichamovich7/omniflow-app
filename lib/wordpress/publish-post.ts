import { getMetaTitle } from '@/lib/wordpress/export';
import {
  addInternalLinks,
  skippedInternalLinks,
  type InternalLinkContext,
  type InternalLinksReport,
} from '@/lib/wordpress/internal-links';
import { mapWithConcurrency, withDeadline, type PublishBudget } from '@/lib/wordpress/publish-budget';
import { silentPublishLogger, type PublishLogger } from '@/lib/wordpress/publish-log';
import {
  applyMediaReplacements,
  uploadPublishMedia,
  type PublishMediaPlan,
  type PublishMediaResult,
} from '@/lib/wordpress/publish-media';
import { findReconcilablePost, type PostIdClaimCheck, type ReconcileResult } from '@/lib/wordpress/publish-reconcile';
import {
  findOrCreateTag,
  isUncertainWordPressError,
  upsertPost,
  WORDPRESS_TIMEOUTS_MS,
  WordPressApiError,
  type CreatePostInput,
  type TimeoutLimiter,
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
  /** An already-uploaded featured image — ignored when `media` plans one. */
  featuredMediaId?: number;
  /**
   * Images to upload during the preparation phase (TASK-FIX-059): the
   * featured image and the internal images, whose URLs in `html` are
   * placeholder tokens (publish-media.ts). Omitted = no upload.
   */
  media?: PublishMediaPlan | null;
  /**
   * Global time budget (publish-budget.ts). Omitted = only the fixed
   * per-request timeouts apply (no global ceiling).
   */
  budget?: PublishBudget | null;
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

// Time-budget warnings (TASK-FIX-059): the post was sent, a secondary step was not.
export const TAGS_TIME_LIMIT_WARNING = 'Some tags were skipped because the time limit was reached.';
export const INTERNAL_LINKS_TIME_LIMIT_WARNING = 'Internal links were skipped because the time limit was reached.';
export const RANK_MATH_TIME_LIMIT_WARNING =
  'Rank Math metadata was skipped because the time limit was reached — publish again to save it.';
export const FAQ_SCHEMA_TIME_LIMIT_WARNING =
  'WordPress filtered the FAQ schema and there was no time left to re-send the post without it — publish again to fix it.';

export const TAG_CONCURRENCY = 3;

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

/** Tag ids in tag order, TAG_CONCURRENCY at a time; `skipped` = not tried for lack of time. Never throws. */
async function resolveTagIds(
  site: WordPressSiteCredentials,
  names: string[],
  limit?: TimeoutLimiter
): Promise<{ ids: number[]; skipped: number }> {
  let skipped = 0;
  const settled = await mapWithConcurrency(names, TAG_CONCURRENCY, async (name) => {
    if (limit && limit(WORDPRESS_TIMEOUTS_MS.tag) <= 0) {
      skipped++;
      return null;
    }
    return findOrCreateTag(site, name, limit);
  });
  const ids: number[] = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled' && outcome.value !== null && !ids.includes(outcome.value)) ids.push(outcome.value);
  }
  return { ids, skipped };
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
 * Preparation → post → secondary steps, inside the publish budget (TASK-FIX-059):
 *
 *   1. Preparation, in parallel and bounded by `prepareDeadline`: media
 *      uploads ∥ tags → internal links ∥ reconciliation (adopt a post
 *      OmniFlow already created). A step out of time is skipped with a
 *      warning — never a failure.
 *   2. Create or update the post (bounded by `postDeadline`), persist its WP
 *      id at once (onPostId).
 *   3. FAQ check / re-send and Rank Math, only with time left before
 *      `finishDeadline`; otherwise skipped with a warning.
 *
 * The post step throws: a WordPressPublishUncertainError when the outcome is
 * unknown, any other error when it really failed (including a post write
 * never sent for lack of time). Every id obtained (created, updated or
 * adopted) is handed to onPostId before any secondary step, so a later
 * failure never loses it and a retry updates the same post. Rank Math never
 * throws — its failure only adds a warning.
 */
export async function sendArticleToWordPress(
  site: WordPressSiteCredentials,
  input: SendArticleInput
): Promise<SendArticleResult> {
  const log = input.log ?? silentPublishLogger;
  const isClaimed: PostIdClaimCheck = input.isPostIdClaimed ?? (async () => false);
  const pins = input.pins ?? null;
  const budget = input.budget ?? null;
  const prepareLimit = budget?.limiter(budget.prepareDeadline);
  const postLookupLimit = budget?.limiter(budget.postDeadline);
  const postLimit = budget?.limiter(budget.postDeadline, budget.minWriteMs);
  const finishLookupLimit = budget?.limiter(budget.finishDeadline);
  const finishWriteLimit = budget?.limiter(budget.finishDeadline, budget.minWriteMs);

  const tagNames = buildWordPressTags(input.generation, pins);
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

  async function reconcile(
    step: string,
    claimCheck: PostIdClaimCheck = isClaimed,
    limit?: TimeoutLimiter
  ): Promise<ReconcileResult> {
    const t = Date.now();
    const found = await findReconcilablePost(site, input.article, claimCheck, limit);
    log.step(step, {
      ms: Date.now() - t,
      result: found.outcome,
      ...(found.outcome === 'found' ? { wpPostId: found.post.id, count: found.matches } : {}),
      ...(found.outcome === 'unknown' && found.http !== undefined ? { http: found.http } : {}),
    });
    return found;
  }

  // ------------------------------------------------ 1. preparation (parallel)

  // Tags then internal links (links score candidates by tag). Never throws.
  async function prepareTagsAndLinks(): Promise<{
    tagIds: number[];
    tagsSkipped: number;
    html: string;
    internalLinks: InternalLinksReport;
  }> {
    let started = Date.now();
    const tags = await resolveTagIds(site, tagNames, prepareLimit);
    log.step('tags', { ms: Date.now() - started, count: tags.ids.length, ...(tags.skipped ? { result: 'time_limit' } : {}) });

    // Never blocking: on any failure or lack of time the HTML is sent unchanged.
    if (!input.insertInternalLinks) {
      return { tagIds: tags.ids, tagsSkipped: tags.skipped, html: input.html, internalLinks: skippedInternalLinks() };
    }
    started = Date.now();
    const link = () =>
      addInternalLinks(
        site,
        input.html,
        buildInternalLinkContext({ ...input, pins, categoryIds: input.categoryIds ?? [], tagIds: tags.ids })
      );
    // Not started at all without time left; otherwise not awaited past the
    // preparation deadline (read-only GETs, safe to abandon).
    const linked = !budget
      ? { timedOut: false as const, value: await link() }
      : budget.remaining(budget.prepareDeadline) < budget.minCallMs
        ? { timedOut: true as const }
        : await withDeadline(link(), budget.prepareDeadline, budget.now);
    if (linked.timedOut) {
      log.warn('internal_links', { ms: Date.now() - started, result: 'time_limit' });
      return {
        tagIds: tags.ids,
        tagsSkipped: tags.skipped,
        html: input.html,
        internalLinks: { ...skippedInternalLinks(), warnings: [INTERNAL_LINKS_TIME_LIMIT_WARNING] },
      };
    }
    const internalLinks = linked.value.report;
    log.step('internal_links', { ms: Date.now() - started, result: internalLinks.status, count: internalLinks.insertedCount });
    return { tagIds: tags.ids, tagsSkipped: tags.skipped, html: linked.value.html, internalLinks };
  }

  const [prepared, media, foundBefore] = await Promise.all([
    prepareTagsAndLinks(),
    input.media ? uploadPublishMedia(site, input.media, { limit: prepareLimit, log }) : Promise.resolve<PublishMediaResult | null>(null),
    // A post an earlier attempt created but never recorded is adopted, never duplicated.
    input.article.wp_post_id ? Promise.resolve(null) : reconcile('reconcile_before_create', isClaimed, prepareLimit),
  ]);

  let knownPostId = input.article.wp_post_id;
  if (foundBefore?.outcome === 'found') {
    knownPostId = foundBefore.post.id;
    await remember(knownPostId, 'adopted');
  }

  const tagIds = prepared.tagIds;
  const internalLinks = prepared.internalLinks;
  const html = input.media ? applyMediaReplacements(prepared.html, input.media.internal, media?.replacements ?? new Map()) : prepared.html;
  const featuredMediaId = input.media ? media?.featuredMediaId : input.featuredMediaId;
  const sendInput: SendArticleInput = { ...input, featuredMediaId };

  // ------------------------------------------------------------------ 2. post

  // Appended after internal linking, so the link tokenizer never sees it.
  const faqSchema = input.faqSchema?.trim() || null;
  const postInput = buildPostInput({ ...sendInput, html: faqSchema ? `${html.trimEnd()}
${faqSchema}
` : html }, tagIds);

  /** Update an existing post. 'missing' = 404, the post no longer exists. */
  async function updatePost(
    postId: number,
    payload: CreatePostInput,
    step: string,
    limit: TimeoutLimiter | undefined
  ): Promise<WordPressPostResult | 'missing'> {
    const t = Date.now();
    try {
      const post = await upsertPost(site, postId, payload, limit);
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
      const post = await upsertPost(site, null, postInput, postLimit);
      log.step('post_create', { ms: Date.now() - t, wpPostId: post.id, result: 'created' });
      return { post, source: 'created' };
    } catch (err) {
      log.warn('post_create', { ms: Date.now() - t, ...errorResult(err) });
      // A timeout, a lost connection, an unreadable 2xx or a 5xx can all come
      // after WordPress committed the post. A write never sent (no time) cannot.
      const uncertain = isUncertainWordPressError(err);
      const serverError = err instanceof WordPressApiError && (err.status ?? 0) >= 500;
      if (!uncertain && !serverError) throw err;
      const found = await reconcile('reconcile_after_create', isClaimed, finishLookupLimit);
      if (found.outcome === 'found') return { post: found.post, source: 'adopted' };
      // A 5xx with the post confirmed absent is a real failure. After a
      // timeout the request may still be running on WordPress: unknown.
      if (found.outcome === 'none' && !uncertain) throw err;
      throw new WordPressPublishUncertainError(null, 'post_create');
    }
  }

  let post: WordPressPostResult | null = null;
  if (knownPostId) {
    const updated = await updatePost(knownPostId, postInput, 'post_update', postLimit);
    if (updated !== 'missing') {
      post = updated;
    } else {
      // The previously-sent post no longer exists on WordPress — adopt another
      // exact match if there is one, else fall back to creating a fresh post.
      const missingId = knownPostId;
      const found = await reconcile(
        'reconcile_after_missing',
        async (id) => id === missingId || (await isClaimed(id)),
        postLookupLimit
      );
      if (found.outcome === 'found') {
        await remember(found.post.id, 'adopted');
        const retried = await updatePost(found.post.id, postInput, 'post_update', postLimit);
        if (retried !== 'missing') post = retried;
      }
    }
  }
  if (!post) {
    const created = await createPost();
    await remember(created.post.id, created.source);
    if (created.source === 'adopted') {
      // Adopted after a lost answer: re-sent so the post holds exactly this
      // attempt's content and status. No time left to re-send: the post is
      // known (id saved) but its final state is not — uncertain, a retry
      // updates the same post.
      if (finishWriteLimit && finishWriteLimit(WORDPRESS_TIMEOUTS_MS.postWrite) <= 0) {
        throw new WordPressPublishUncertainError(created.post.id, 'post_update');
      }
      const updated = await updatePost(created.post.id, postInput, 'post_update', finishWriteLimit);
      if (updated === 'missing') throw new WordPressPublishUncertainError(null, 'post_update');
      post = updated;
    } else {
      post = created.post;
    }
  }
  await remember(post.id, 'updated');

  // ------------------------------------------------------- 3. secondary steps

  // A user without unfiltered_html gets <script> stripped by kses, which
  // would leave the JSON as visible text: unless the saved content still
  // holds the exact script, the same post is re-sent without it.
  let faqSchemaStatus: FaqSchemaStatus = 'not_added';
  let faqOutOfTime = false;
  if (faqSchema) {
    if (post.contentRaw?.includes(faqSchema)) {
      faqSchemaStatus = 'added';
    } else if (finishWriteLimit && finishWriteLimit(WORDPRESS_TIMEOUTS_MS.postWrite) <= 0) {
      // The post and its id are saved; a retry re-sends it (update, never a new post).
      faqOutOfTime = true;
      log.warn('faq_resend', { wpPostId: post.id, result: 'time_limit' });
    } else {
      console.warn(
        `[wordpress publish] step=faq_schema article=${input.article.id} post=${post.id} ` +
          `result=${post.contentRaw === undefined ? 'unverifiable' : 'filtered'} — re-sending without schema`
      );
      const resent = await updatePost(post.id, buildPostInput({ ...sendInput, html }, tagIds), 'faq_resend', finishWriteLimit);
      // Deleted between two calls: the id is kept, the outcome is unknown.
      if (resent === 'missing') throw new WordPressPublishUncertainError(post.id, 'faq_resend');
      post = resent;
      faqSchemaStatus = 'removed';
    }
  }

  const started = Date.now();
  const savingRankMath = (postId: number) =>
    saveRankMathMeta(site, postId, {
      title: getMetaTitle(input.article),
      description: input.article.meta_description,
      focusKeyword: focusKeyword.keyword,
    });
  let rankMath: RankMathResult;
  let rankMathOutOfTime = false;
  if (budget) {
    // Rank Math's own calls are not cancellable; it never throws and
    // updateMeta is idempotent, so an unfinished call is simply not awaited.
    const outcome =
      budget.remaining(budget.finishDeadline) < budget.minCallMs
        ? { timedOut: true as const }
        : await withDeadline(savingRankMath(post.id), budget.finishDeadline, budget.now);
    rankMathOutOfTime = outcome.timedOut;
    rankMath = outcome.timedOut ? { status: 'failed', message: 'Time limit reached before Rank Math finished.' } : outcome.value;
  } else {
    rankMath = await savingRankMath(post.id);
  }
  log.step('rank_math', {
    ms: Date.now() - started,
    wpPostId: post.id,
    result: rankMathOutOfTime ? 'time_limit' : rankMath.status,
    ...(rankMath.status === 'failed' && rankMath.httpStatus !== undefined ? { http: rankMath.httpStatus } : {}),
  });

  const warnings: string[] = [];
  if (tagNames.length === 0) warnings.push(NO_TAGS_WARNING);
  else if (prepared.tagsSkipped > 0) warnings.push(TAGS_TIME_LIMIT_WARNING);
  else if (tagIds.length === 0) warnings.push(TAGS_NOT_CREATED_WARNING);
  if (!focusKeyword.keyword && rankMath.status !== 'not_detected') warnings.push(NO_FOCUS_KEYWORD_WARNING);
  if (rankMath.status === 'not_detected') {
    warnings.push(RANK_MATH_NOT_DETECTED_WARNING);
  } else if (rankMathOutOfTime) {
    warnings.push(RANK_MATH_TIME_LIMIT_WARNING);
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
  if (faqOutOfTime) warnings.push(FAQ_SCHEMA_TIME_LIMIT_WARNING);
  if (media) warnings.push(...media.warnings);

  return { post, tagIds, focusKeyword, rankMath, internalLinks, faqSchema: faqSchemaStatus, warnings };
}
