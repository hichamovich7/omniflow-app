import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { facebookProjectQuerySchema } from '@/lib/validations/facebook';
import { META_COMMENT_SCOPE } from '@/lib/social/meta/config';
import { logMetaError, MetaApiError } from '@/lib/social/meta/errors';
import { openPendingConnection, PENDING_CONNECTION_COOKIE } from '@/lib/social/meta/oauth-session';
import { createFacebookGraph, jsonError, META_NOT_CONFIGURED_MESSAGE } from '@/lib/social/facebook-server';
import { FACEBOOK_CONNECT_MESSAGES } from '@/lib/social/facebook-connect';
import type { FacebookPagesResponse } from '@/lib/social/facebook-publication';
import type { ApiResponse } from '@/types/api';

/**
 * Facebook Pages the person manages, for the picker (TASK-068), read with
 * the pending user token of the encrypted cookie. Returns names, ids and
 * whether posting is allowed — never a token.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');

  const parsed = facebookProjectQuerySchema.safeParse({ projectId: new URL(request.url).searchParams.get('projectId') });
  if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);

  const pending = openPendingConnection((await cookies()).get(PENDING_CONNECTION_COOKIE)?.value, user.id, parsed.data.projectId);
  if (!pending) return jsonError(409, 'selection_expired', FACEBOOK_CONNECT_MESSAGES.expired);

  const graph = createFacebookGraph();
  if (!graph) return jsonError(503, 'meta_not_configured', META_NOT_CONFIGURED_MESSAGE);

  try {
    const pages = await graph.listPages(pending.userToken);
    return NextResponse.json<ApiResponse<FacebookPagesResponse>>({
      data: {
        pages: pages.map((page) => ({ id: page.id, name: page.name, canPublish: page.tasks.includes('CREATE_CONTENT') })),
        canComment: pending.grantedScopes.includes(META_COMMENT_SCOPE),
      },
      error: null,
    });
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    logMetaError('list pages', err);
    return jsonError(502, err.kind, err.message, { retryable: err.retryable });
  }
}
