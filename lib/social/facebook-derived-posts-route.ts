import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/engine';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { getSocialContentGeneration } from '@/lib/queries/social-content';
import { supabaseVariantStore } from '@/lib/queries/facebook-image-variants';
import { findDraftByRequestId, insertDerivedDraft, listArticleFacebookPosts, supabaseDraftRequestStore } from '@/lib/queries/facebook-article-posts';
import { facebookDerivedPostSchema } from '@/lib/validations/facebook';
import { FACEBOOK_POST_PROMPT_ID, FacebookPostError, generateFacebookPost, loadFacebookPostSource } from '@/lib/social/facebook-post';
import { createFacebookPostFromImage, DerivedPostError, DRAFT_REQUEST_STALE_MS, type DerivedPostResult } from '@/lib/social/facebook-derived-posts';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { WordPressReadError } from '@/lib/wordpress/post-reader';
import { jsonError } from '@/lib/social/facebook-server';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * POST /api/social/generations/[id]/derived-posts — "Create new post with
 * this image" (TASK-101 extension / TASK-103). The caller's own session
 * (RLS + user_id filters). Writes one new draft; the original draft, its
 * publication and its variants are only read. No image call, no Meta call,
 * no social_publications write.
 */
export async function handleCreateDerivedPost(request: Request, id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');
  if (!isValidUuid(id)) return jsonError(400, 'invalid_id', 'Invalid content ID');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Invalid JSON body');
  }
  const parsed = facebookDerivedPostSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);

  const parent = await getSocialContentGeneration(supabase, user.id, id);
  const variants = supabaseVariantStore(supabase, user.id);
  const requests = supabaseDraftRequestStore(supabase, user.id, DRAFT_REQUEST_STALE_MS);

  try {
    const result = await createFacebookPostFromImage(
      { parent, userId: user.id, variantId: parsed.data.variantId, requestId: parsed.data.requestId },
      {
        findByRequestId: (requestId) => findDraftByRequestId(supabase, user.id, requestId),
        getVariant: (variantId) => variants.getVariant(variantId),
        // Atomic reservation of the request id before the quota and the AI call (migration 052).
        reserveRequest: (requestId, parentId, variantId) => requests.reserve(requestId, parentId, variantId),
        completeRequest: (requestId, generationId) => requests.complete(requestId, generationId),
        failRequest: (requestId) => requests.fail(requestId),
        // Same limits as "Generate Facebook post": 1 unit per request.
        checkQuota: () => checkRateLimit(user.id, user.email ?? '', 'social/facebook-post', 30, 3600, { enforceTrialLimit: true }),
        loadSource: (sourceRequest) => loadFacebookPostSource(supabase, user.id, sourceRequest),
        articlePostTexts: async () => {
          if (!parent) return [];
          const posts = await listArticleFacebookPosts(supabase, user.id, parent, 10);
          return [parent, ...posts.filter((post) => post.id !== parent.id)].map((post) => post.content_markdown);
        },
        writePost: (source, options) => generateFacebookPost(source, generateText, options),
        insertDraft: (row) => insertDerivedDraft(supabase, row),
      }
    );
    return NextResponse.json<ApiResponse<DerivedPostResult>>({ data: result, error: null });
  } catch (err) {
    if (err instanceof DerivedPostError) {
      if (err.code === 'quota' && err.limit) return rateLimitErrorResponse(err.limit);
      return jsonError(err.status, err.code, err.message);
    }
    if (err instanceof SocialGenerationError || err instanceof WordPressReadError || err instanceof FacebookPostError) {
      return jsonError(err.status, err.code, err.message);
    }
    console.error(`[${FACEBOOK_POST_PROMPT_ID}] derived post failed:`, err instanceof Error ? err.name : 'unknown error');
    return jsonError(500, 'generation_failed', 'The new post could not be written. Please try again.');
  }
}
