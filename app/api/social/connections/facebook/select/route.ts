import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { facebookSelectPageSchema } from '@/lib/validations/facebook';
import { saveFacebookPageConnection } from '@/lib/queries/social-connections';
import { logMetaError, MetaApiError } from '@/lib/social/meta/errors';
import { oauthCookieOptions, openPendingConnection, PENDING_CONNECTION_COOKIE } from '@/lib/social/meta/oauth-session';
import { encryptSocialToken } from '@/lib/social/meta/token-crypto';
import { createFacebookGraph, jsonError, META_NOT_CONFIGURED_MESSAGE, socialAdminClient } from '@/lib/social/facebook-server';
import { FACEBOOK_CONNECT_MESSAGES } from '@/lib/social/facebook-connect';
import type { SocialConnection } from '@/lib/social/facebook-publication';
import type { ApiResponse } from '@/types/api';

/**
 * Saves the chosen Facebook Page for a project (TASK-068). The Pages are read
 * again on the server with the pending user token (never trusted from the
 * browser); the Page must be one the person manages with the CREATE_CONTENT
 * task. Only that Page's token is stored, encrypted with
 * SOCIAL_TOKEN_ENCRYPTION_KEY; the user token is discarded with the cookie.
 * One Page per project: a new choice replaces the previous one.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Invalid JSON body');
  }
  const parsed = facebookSelectPageSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);
  const { projectId, pageId } = parsed.data;

  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).maybeSingle();
  if (!project) return jsonError(404, 'not_found', 'Project not found');

  const pending = openPendingConnection((await cookies()).get(PENDING_CONNECTION_COOKIE)?.value, user.id, projectId);
  if (!pending) return jsonError(409, 'selection_expired', FACEBOOK_CONNECT_MESSAGES.expired);

  const graph = createFacebookGraph();
  if (!graph) return jsonError(503, 'meta_not_configured', META_NOT_CONFIGURED_MESSAGE);

  let page;
  try {
    page = (await graph.listPages(pending.userToken)).find((candidate) => candidate.id === pageId);
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    logMetaError('select page', err);
    return jsonError(502, err.kind, err.message, { retryable: err.retryable });
  }
  if (!page) return jsonError(404, 'page_not_found', 'This Facebook Page is not among the Pages your Facebook account manages.');
  if (!page.tasks.includes('CREATE_CONTENT')) {
    return jsonError(403, 'page_not_publishable', 'Your Facebook account cannot create content on this Page. Ask a Page admin for that access.');
  }

  const connection = await saveFacebookPageConnection(socialAdminClient(), {
    userId: user.id,
    projectId,
    pageId: page.id,
    pageName: page.name || `Page ${page.id}`,
    encryptedToken: encryptSocialToken(page.accessToken),
    grantedScopes: pending.grantedScopes,
    now: new Date(),
  });
  if (!connection) return jsonError(500, 'save_failed', 'The Facebook Page could not be saved. Check that migration 046 is applied, then try again.');

  const response = NextResponse.json<ApiResponse<SocialConnection>>({ data: connection, error: null });
  response.cookies.set(PENDING_CONNECTION_COOKIE, '', oauthCookieOptions(0));
  return response;
}
