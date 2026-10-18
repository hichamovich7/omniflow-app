import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  deleteSocialContentGeneration,
  getSocialContentGeneration,
  updateFacebookContent,
  type SocialContentListItem,
} from '@/lib/queries/social-content';
import { listPublicationsForGenerations } from '@/lib/queries/social-publications';
import { facebookPostUpdateSchema } from '@/lib/validations/facebook';
import { allowedLinkPlacements } from '@/lib/social/social-content';
import { publicationActions } from '@/lib/social/facebook-publication';
import { facebookTextToHtml } from '@/lib/social/facebook-post';
import { countWords } from '@/lib/social/medium-summary';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * Deletes one saved social content item (Medium / Facebook history, TASK-063,
 * TASK-068). Only the caller's own row (user_id filter + RLS); its source
 * article, WordPress post or Pins are never touched, and a post already on
 * Facebook stays there (its publication record is kept). The UI asks for
 * confirmation first.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      { data: null, error: { message: 'Invalid content ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const outcome = await deleteSocialContentGeneration(supabase, user.id, id);
  if (outcome === 'not_found') {
    // Same answer for "does not exist" and "belongs to someone else".
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Content not found', code: 'not_found' } },
      { status: 404 }
    );
  }
  if (outcome === 'error') {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'The content could not be deleted. Please try again.', code: 'delete_failed' } },
      { status: 500 }
    );
  }
  return NextResponse.json<ApiResponse<{ id: string }>>({ data: { id }, error: null });
}

/**
 * Edits a saved Facebook post before publication (TASK-068): post text,
 * call to action, first-comment lead-in and link placement. No field may
 * contain a URL (the only link is the validated permalink, added by
 * OmniFlow); a link placement needs that permalink. Refused once the post is
 * on Facebook, or while its result is being checked.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      { data: null, error: { message: 'Invalid content ID', code: 'invalid_id' } },
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
  const parsed = facebookPostUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const item = await getSocialContentGeneration(supabase, user.id, id);
  if (!item || item.platform !== 'facebook') {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Content not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  const input = parsed.data;
  if (!allowedLinkPlacements(item.cta_url).includes(input.linkPlacement)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'This article has no public link: only "No link" is possible.', code: 'link_unavailable' } },
      { status: 422 }
    );
  }

  const publication = (await listPublicationsForGenerations(supabase, user.id, [id]))[id] ?? null;
  if (!publicationActions(publication).canEdit) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'This post is published (or being published) on Facebook and can no longer be edited.', code: 'already_published' } },
      { status: 409 }
    );
  }

  const updated = await updateFacebookContent(supabase, user.id, id, {
    content_markdown: input.post,
    content_html: facebookTextToHtml(input.post),
    word_count: countWords(input.post),
    call_to_action: input.callToAction || null,
    first_comment_text: input.firstCommentText || null,
    link_placement: input.linkPlacement,
  });
  if (!updated) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'The changes could not be saved. Please try again.', code: 'update_failed' } },
      { status: 500 }
    );
  }
  return NextResponse.json<ApiResponse<SocialContentListItem>>({ data: updated, error: null });
}
