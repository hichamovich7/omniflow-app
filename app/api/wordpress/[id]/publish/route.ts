import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publishArticleSchema } from '@/lib/validations/wordpress-publish';
import { getWordPressArticleByGenerationId } from '@/lib/queries/wordpress';
import { getWordPressSiteWithSecretByProjectId } from '@/lib/queries/wordpress-sites';
import { exportToHtmlForWordPress, getMetaTitle } from '@/lib/wordpress/export';
import { decryptSecret } from '@/lib/wordpress/crypto';
import {
  uploadMedia,
  upsertPost,
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
export const maxDuration = 60;

function isAuthError(err: unknown): boolean {
  return err instanceof WordPressApiError && (err.status === 401 || err.status === 403);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  async function fail(message: string) {
    await supabase
      .from('wordpress_articles')
      .update({ publish_status: 'failed', publish_error: message })
      .eq('id', article!.id);

    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: 'publish_failed' } },
      { status: 502 }
    );
  }

  // Featured image has no URL-fallback on the WP side — featured_media must
  // be a media library attachment id, so a failed upload aborts the publish.
  let featuredMediaId: number | undefined;
  if (article.featured_image_url) {
    try {
      const uploaded = await uploadMedia(credentials, article.featured_image_url, `${article.slug}-featured.png`);
      featuredMediaId = uploaded.id;
    } catch (err) {
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
  for (const image of images) {
    if (!image.url) continue;
    try {
      const uploaded = await uploadMedia(credentials, image.url, `${article.slug}-${image.position}.png`);
      content = content.split(image.url).join(uploaded.sourceUrl);
    } catch (err) {
      console.error(`[wordpress publish] Failed to upload internal image for article ${article.id}:`, err);
    }
  }

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

  let postResult;
  try {
    postResult = await upsertPost(credentials, article.wp_post_id, {
      title: getMetaTitle(article),
      content: exportToHtmlForWordPress({ content }),
      status: wpStatus,
      date,
      categoryIds,
      featuredMediaId,
    });
  } catch (err) {
    if (err instanceof WordPressApiError && err.status === 404 && article.wp_post_id) {
      // The previously-published post no longer exists on WordPress —
      // fall back to creating a fresh one.
      try {
        postResult = await upsertPost(credentials, null, {
          title: getMetaTitle(article),
          content: exportToHtmlForWordPress({ content }),
          status: wpStatus,
          date,
          categoryIds,
          featuredMediaId,
        });
      } catch (retryErr) {
        const message = isAuthError(retryErr)
          ? 'WordPress rejected the connection credentials — reconnect in Project settings.'
          : retryErr instanceof Error
            ? retryErr.message
            : 'Failed to publish the post to WordPress.';
        return fail(message);
      }
    } else {
      const message = isAuthError(err)
        ? 'WordPress rejected the connection credentials — reconnect in Project settings.'
        : err instanceof Error
          ? err.message
          : 'Failed to publish the post to WordPress.';
      return fail(message);
    }
  }

  const publishStatus = mode === 'draft' ? 'draft' : mode === 'now' ? 'published' : 'scheduled';
  const publishedAt = mode === 'now' ? new Date().toISOString() : null;

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
    })
    .eq('id', article.id);

  if (dbError) {
    console.error('[wordpress publish] Failed to persist publish result:', dbError);
  }

  return NextResponse.json<
    ApiResponse<{ wpPostId: number; publishStatus: string; publishedAt: string | null; viewUrl: string }>
  >({
    data: {
      wpPostId: postResult.id,
      publishStatus,
      publishedAt,
      viewUrl: postResult.link,
    },
    error: null,
  });
}
