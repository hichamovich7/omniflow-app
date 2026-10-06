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
import { createPublishLogger } from '@/lib/wordpress/publish-log';
import type { InternalLinksReport } from '@/lib/wordpress/internal-links';
import { buildFeaturedImageAltText, resolveInternalImageAltText } from '@/lib/wordpress/image-alt-text';
import { resolveFocusKeyword } from '@/lib/wordpress/tags';
import {
  uploadMedia,
  toWordPressLocalDateString,
  WordPressApiError,
  type WordPressSiteCredentials,
} from '@/lib/wordpress/rest-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

// Up to 1 featured image + several internal image uploads plus the post
// create/update call — several sequential external requests, but no AI
// generation involved, so a lower ceiling than wordpress/generate's 180s.
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
  let started = Date.now();
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

  // The WP post id as soon as it is known — never dropped by a later failure.
  let knownPostId: number | null = article.wp_post_id;

  async function persistPostId(postId: number) {
    knownPostId = postId;
    const { error } = await supabase.from('wordpress_articles').update({ wp_post_id: postId }).eq('id', article!.id);
    if (error) throw error;
  }

  async function fail(message: string) {
    await supabase
      .from('wordpress_articles')
      .update({ publish_status: 'failed', publish_error: message, wp_post_id: knownPostId, ...lockRelease })
      .eq('id', article!.id);
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
    await supabase
      .from('wordpress_articles')
      .update({ publish_status: 'uncertain', publish_error: err.message, wp_post_id: knownPostId, ...lockRelease })
      .eq('id', article!.id);
    log.warn('publish_end', { ms: Date.now() - requestStartedAt, wpPostId: knownPostId, result: `uncertain_${err.step}` });

    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: err.message, code: 'publish_uncertain' } },
      { status: 504 }
    );
  }

  try {
    // Alt text of every uploaded image (alt_text on /wp/v2/media) — from the
    // article's own H1 and primary keyword, or the image's stored alt text;
    // never an AI call, never written back to the article.
    const altSource = { title: article.title, keyword: resolveFocusKeyword(generation, pins).keyword };
    const altWarnings: string[] = [];

    // Featured image has no URL-fallback on the WP side — featured_media must
    // be a media library attachment id, so a failed upload aborts the publish.
    let featuredMediaId: number | undefined;
    if (article.featured_image_url) {
      started = Date.now();
      try {
        const altText = buildFeaturedImageAltText(altSource);
        const uploaded = await uploadMedia(credentials, article.featured_image_url, `${article.slug}-featured.png`, altText);
        featuredMediaId = uploaded.id;
        if (altText && !uploaded.altText) altWarnings.push('WordPress did not save the featured image alt text — add it in the Media Library.');
        log.step('media_featured', { ms: Date.now() - started, result: 'uploaded' });
      } catch (err) {
        log.warn('media_featured', {
          ms: Date.now() - started,
          result: 'failed',
          ...(err instanceof WordPressApiError && err.status !== undefined ? { http: err.status } : {}),
        });
        const message = isAuthError(err)
          ? 'WordPress rejected the connection credentials — reconnect in Project settings.'
          : err instanceof Error
            ? `Failed to upload the featured image: ${err.message}`
            : 'Failed to upload the featured image.';
        return fail(message);
      }
    }

    // Internal images: on individual upload failure, keep the original
    // (already public) Supabase Storage URL in the content rather than
    // aborting the whole publish over one non-critical image.
    let content = article.content;
    started = Date.now();
    let uploadedCount = 0;
    for (const image of images) {
      if (!image.url) continue;
      try {
        const uploaded = await uploadMedia(
          credentials,
          image.url,
          `${article.slug}-${image.position}.png`,
          resolveInternalImageAltText(image.alt_text, altSource)
        );
        content = content.split(image.url).join(uploaded.sourceUrl);
        uploadedCount++;
      } catch (err) {
        console.error(`[wordpress publish] attempt=${attemptId} Failed to upload internal image for article ${article.id}:`, err);
      }
    }
    log.step('media_internal', { ms: Date.now() - started, count: uploadedCount });

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
        featuredMediaId,
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

    const publishStatus = mode === 'draft' ? 'draft' : mode === 'now' ? 'published' : 'scheduled';
    const publishedAt = mode === 'now' ? new Date().toISOString() : null;

    started = Date.now();
    const { error: dbError } = await supabase
      .from('wordpress_articles')
      .update({
        wp_post_id: postResult.id,
        publish_status: publishStatus,
        published_at: publishedAt,
        // Cleared on any non-schedule publish — a later "Publish Now"/"Save as
        // Draft" on a previously-scheduled article should stop claiming a
        // scheduled date that no longer applies.
        scheduled_at: mode === 'schedule' && scheduledAt ? scheduledAt.toISOString() : null,
        publish_error: null,
        ...lockRelease,
      })
      .eq('id', article.id);

    if (dbError) {
      console.error(`[wordpress publish] attempt=${attemptId} Failed to persist publish result:`, dbError);
    }
    log.step('save_final', { ms: Date.now() - started, wpPostId: postResult.id, result: dbError ? 'failed' : 'saved' });
    log.step('publish_end', { ms: Date.now() - requestStartedAt, wpPostId: postResult.id, result: publishStatus });

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
        warnings: [...sent.warnings, ...altWarnings],
      },
      error: null,
    });
  } catch (err) {
    // Unexpected error: the lock is released and the known post id kept.
    console.error(`[wordpress publish] attempt=${attemptId} Unexpected publish error:`, err);
    return fail('Unexpected error while publishing to WordPress.');
  }
}
