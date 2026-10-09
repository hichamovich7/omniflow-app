import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publishArticleSchema } from '@/lib/validations/wordpress-publish';
import { getPinsSeoSource, getWordPressArticleByGenerationId, isWordPressPostIdClaimed } from '@/lib/queries/wordpress';
import { getWordPressSiteWithSecretByProjectId } from '@/lib/queries/wordpress-sites';
import { exportToHtmlForWordPress } from '@/lib/wordpress/export';
import { decryptSecret } from '@/lib/wordpress/crypto';
import { decideFaqSchema } from '@/lib/wordpress/faq-schema';
import {
  sendArticleToWordPress,
  WordPressPublishUncertainError,
  type FaqSchemaStatus,
  type SendArticleResult,
} from '@/lib/wordpress/publish-post';
import { acquirePublishLock, publishLockRelease } from '@/lib/wordpress/publish-lock';
import { createPublishBudget } from '@/lib/wordpress/publish-budget';
import { planInternalMedia, type PublishMediaPlan } from '@/lib/wordpress/publish-media';
import { createPublishLogger } from '@/lib/wordpress/publish-log';
import type { InternalLinksReport } from '@/lib/wordpress/internal-links';
import { buildFeaturedImageAltText, resolveInternalImageAltText } from '@/lib/wordpress/image-alt-text';
import { resolveFocusKeyword } from '@/lib/wordpress/tags';
import {
  toWordPressLocalDateString,
  WordPressApiError,
  type WordPressSiteCredentials,
} from '@/lib/wordpress/rest-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

// Media uploads, tags, internal links, the post write and Rank Math — no AI
// generation involved, so a lower ceiling than wordpress/generate's 180s.
// The publish budget (lib/wordpress/publish-budget.ts) is derived from it so
// the post is always written and answered before the platform limit.
// Must equal PUBLISH_MAX_DURATION_SECONDS (lib/wordpress/publish-lock.ts).
export const maxDuration = 60;

function isAuthError(err: unknown): boolean {
  return err instanceof WordPressApiError && (err.status === 401 || err.status === 403);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const attemptId = randomUUID();
  const requestStartedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Unauthorized', code: 'unauthorized' } },
      { status: 401 }
    );
  }

  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid article ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
      { status: 400 }
    );
  }

  const parsed = publishArticleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { generation, article, images } = await getWordPressArticleByGenerationId(supabase, id);

  if (!generation || !article) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Article not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (generation.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this article', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const log = createPublishLogger({ attemptId, generationId: id, articleId: article.id });

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'wordpress/publish', 15, 3600);
  if (!rateLimit.allowed) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Rate limit exceeded. Try again later.', code: 'rate_limited' } },
      { status: 429 }
    );
  }

  const site = await getWordPressSiteWithSecretByProjectId(supabase, generation.project_id);

  if (!site) {
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: { message: 'This project has no active WordPress connection', code: 'no_connection' },
      },
      { status: 400 }
    );
  }

  const credentials: WordPressSiteCredentials = {
    siteUrl: site.site_url,
    username: site.wp_username,
    password: decryptSecret(site.encrypted_application_password),
  };

  // Pins method: tags and focus keyword come from the selected Pins and their
  // Pinterest generation, not from the synthesized pin-title label.
  const pins =
    generation.source_type === 'pins' ? await getPinsSeoSource(supabase, generation.source_pin_ids ?? []) : null;
  log.step('supabase_load', { ms: Date.now() - requestStartedAt, wpPostId: article.wp_post_id });

  // One publish at a time per article (migration 042). Without the column the
  // publish still runs — reconciliation keeps lost answers from duplicating.
  const started = Date.now();
  const lock = await acquirePublishLock(supabase, article.id);
  if (lock.status === 'busy') {
    log.warn('publish_lock', { ms: Date.now() - started, result: 'busy' });
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: {
          message: 'Another publish of this article is already in progress. Wait for it to finish, then refresh the page.',
          code: 'publish_in_progress',
        },
      },
      { status: 409 }
    );
  }
  if (lock.status === 'unavailable') {
    // Logged, never blocking: the publish goes on without the lock.
    log.warn('publish_lock', {
      ms: Date.now() - started,
      result: lock.reason === 'missing_column' ? 'unavailable_migration_042_not_applied' : 'unavailable_error',
    });
  } else {
    log.step('publish_lock', { ms: Date.now() - started, result: 'acquired' });
  }
  const lockRelease = publishLockRelease(lock);
  // True once a terminal write has released the lock; checked in `finally`.
  let lockReleased = lock.status !== 'acquired';

  // The WP post id as soon as it is known — never dropped by a later failure.
  let knownPostId: number | null = article.wp_post_id;

  async function persistPostId(postId: number) {
    knownPostId = postId;
    const { error } = await supabase.from('wordpress_articles').update({ wp_post_id: postId }).eq('id', article!.id);
    if (error) throw error;
  }

  /**
   * The one terminal write of the article (final status + lock release).
   * Never throws: a database error is logged and never replaces the
   * publish outcome being returned.
   */
  async function saveTerminal(values: {
    publish_status: string;
    publish_error: string | null;
    wp_post_id: number | null;
    published_at?: string | null;
    scheduled_at?: string | null;
  }): Promise<boolean> {
    const t = Date.now();
    try {
      const { error } = await supabase
        .from('wordpress_articles')
        .update({ ...values, ...lockRelease })
        .eq('id', article!.id);
      if (error) throw error;
      lockReleased = true;
      log.step('save_final', { ms: Date.now() - t, wpPostId: values.wp_post_id, result: 'saved' });
      return true;
    } catch (err) {
      console.error(`[wordpress publish] attempt=${attemptId} Failed to persist publish result:`, err);
      log.warn('save_final', { ms: Date.now() - t, wpPostId: values.wp_post_id, result: 'failed' });
      return false;
    }
  }

  // Only when the post was neither created nor updated.
  async function fail(message: string) {
    await saveTerminal({ publish_status: 'failed', publish_error: message, wp_post_id: knownPostId });
    log.warn('publish_end', { ms: Date.now() - requestStartedAt, wpPostId: knownPostId, result: 'failed' });

    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: 'publish_failed' } },
      { status: 502 }
    );
  }

  // WordPress may or may not have saved the post: never shown as a failure,
  // never retried automatically — the user checks WordPress first.
  async function uncertain(err: WordPressPublishUncertainError) {
    if (err.postId) knownPostId = err.postId;
    await saveTerminal({ publish_status: 'uncertain', publish_error: err.message, wp_post_id: knownPostId });
    log.warn('publish_end', { ms: Date.now() - requestStartedAt, wpPostId: knownPostId, result: `uncertain_${err.step}` });

    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: err.message, code: 'publish_uncertain' } },
      { status: 504 }
    );
  }

  // Global time budget from maxDuration (TASK-FIX-059): optional steps are
  // skipped with a warning before they can eat the post's slot.
  const budget = createPublishBudget({ startedAt: requestStartedAt, maxDurationMs: maxDuration * 1000 });

  try {
    // Alt text of every uploaded image (alt_text on /wp/v2/media) — from the
    // article's own H1 and primary keyword, or the image's stored alt text;
    // never an AI call, never written back to the article.
    const altSource = { title: article.title, keyword: resolveFocusKeyword(generation, pins).keyword };

    // Media are uploaded during the preparation phase (publish-media.ts), in
    // parallel, never blocking: a featured image that fails or runs out of
    // time leaves the post without a new featured image (warning); an
    // internal image keeps its public Supabase Storage URL.
    const featuredAltText = buildFeaturedImageAltText(altSource);
    const internalMedia = planInternalMedia(
      article.content,
      images.map((image) => ({
        url: image.url,
        filename: `${article.slug}-${image.position}.png`,
        altText: resolveInternalImageAltText(image.alt_text, altSource),
      }))
    );
    const media: PublishMediaPlan = {
      featured: article.featured_image_url
        ? { url: article.featured_image_url, filename: `${article.slug}-featured.png`, altText: featuredAltText }
        : null,
      internal: internalMedia.internal,
    };
    const content = internalMedia.content;

    let categoryIds: number[] | undefined;
    if (article.category_id) {
      const { data: category } = await supabase
        .from('wordpress_categories')
        .select('wp_category_id')
        .eq('id', article.category_id)
        .single();

      if (category?.wp_category_id) {
        categoryIds = [category.wp_category_id];
      }
      // Unmapped category: omitted from the payload, WordPress defaults to
      // "Uncategorized" — non-fatal.
    }

    const { mode, scheduledDate, scheduledTime } = parsed.data;
    const wpStatus = mode === 'draft' ? 'draft' : mode === 'now' ? 'publish' : 'future';
    let date: string | undefined;
    let scheduledAt: Date | null = null;

    if (mode === 'schedule' && scheduledDate && scheduledTime) {
      const [year, month, day] = scheduledDate.split('-').map(Number);
      const [hours, minutes] = scheduledTime.split(':').map(Number);
      scheduledAt = new Date(year, month - 1, day, hours, minutes);
      date = toWordPressLocalDateString(scheduledAt);
    }

    // One FAQPage JSON-LD at most, from the saved FAQ only (TASK-FIX-055).
    const html = exportToHtmlForWordPress({ content });
    const faqDecision = decideFaqSchema({ article, includeFaq: generation.include_faq, html });
    if (faqDecision.status === 'skipped' && faqDecision.reason === 'not_visible') {
      console.warn(`[wordpress publish] step=faq_schema article=${article.id} result=skipped reason=not_visible`);
    }

    let sent: SendArticleResult;
    try {
      sent = await sendArticleToWordPress(credentials, {
        article,
        generation,
        pins,
        html,
        faqSchema: faqDecision.status === 'add' ? faqDecision.script : null,
        status: wpStatus,
        date,
        categoryIds,
        media,
        budget,
        insertInternalLinks: true,
        onPostId: persistPostId,
        isPostIdClaimed: (postId) =>
          isWordPressPostIdClaimed(supabase, { projectId: generation.project_id, postId, excludeArticleId: article.id }),
        log,
      });
    } catch (err) {
      if (err instanceof WordPressPublishUncertainError) return uncertain(err);
      const message = isAuthError(err)
        ? 'WordPress rejected the connection credentials — reconnect in Project settings.'
        : err instanceof Error
          ? err.message
          : 'Failed to publish the post to WordPress.';
      return fail(message);
    }
    const postResult = sent.post;

    // The post was created or updated: the status is the requested one, even
    // when secondary steps were skipped (they only add warnings).
    const publishStatus = mode === 'draft' ? 'draft' : mode === 'now' ? 'published' : 'scheduled';
    const publishedAt = mode === 'now' ? new Date().toISOString() : null;
    knownPostId = postResult.id;

    await saveTerminal({
      wp_post_id: postResult.id,
      publish_status: publishStatus,
      published_at: publishedAt,
      // Cleared on any non-schedule publish — a later "Publish Now"/"Save as
      // Draft" on a previously-scheduled article should stop claiming a
      // scheduled date that no longer applies.
      scheduled_at: mode === 'schedule' && scheduledAt ? scheduledAt.toISOString() : null,
      publish_error: null,
    });
    log.step('publish_end', {
      ms: Date.now() - requestStartedAt,
      wpPostId: postResult.id,
      count: sent.warnings.length,
      result: publishStatus,
    });

    return NextResponse.json<
      ApiResponse<{
        wpPostId: number;
        publishStatus: string;
        publishedAt: string | null;
        viewUrl: string;
        rankMath: 'saved' | 'not_detected' | 'failed';
        internalLinks: InternalLinksReport;
        faqSchema: FaqSchemaStatus;
        warnings: string[];
      }>
    >({
      data: {
        wpPostId: postResult.id,
        publishStatus,
        publishedAt,
        viewUrl: postResult.link,
        rankMath: sent.rankMath.status,
        internalLinks: sent.internalLinks,
        faqSchema: sent.faqSchema,
        warnings: sent.warnings,
      },
      error: null,
    });
  } catch (err) {
    // Unexpected error: the lock is released and the known post id kept.
    console.error(`[wordpress publish] attempt=${attemptId} Unexpected publish error:`, err);
    return fail('Unexpected error while publishing to WordPress.');
  } finally {
    // Last resort when the terminal write failed: free the lock alone
    // (publish_started_at = null makes the row takeable at once and shows
    // "unconfirmed"). Logged, never replaces the response already built.
    if (!lockReleased) {
      try {
        const { error } = await supabase.from('wordpress_articles').update({ publish_started_at: null }).eq('id', article.id);
        if (error) throw error;
        log.step('lock_release', { result: 'released_after_failed_save' });
      } catch {
        log.warn('lock_release', { result: 'failed' });
      }
    }
  }
}
