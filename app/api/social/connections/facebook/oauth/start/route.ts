import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { facebookProjectQuerySchema } from '@/lib/validations/facebook';
import { getMetaConfig, hasSocialTokenKey, META_BUSINESS_SCOPE, META_PAGE_SCOPES, oauthRedirectUri } from '@/lib/social/meta/config';
import { buildOAuthDialogUrl } from '@/lib/social/meta/graph-client';
import { newOAuthState, OAUTH_STATE_COOKIE, oauthCookieOptions, sealOAuthState } from '@/lib/social/meta/oauth-session';
import { facebookConnectRedirect } from '@/lib/social/facebook-connect';

/**
 * Starts "Connect a Facebook Page" for one project (TASK-068): checks the
 * project, sets the encrypted anti-CSRF state cookie and redirects to the
 * Facebook Login dialog with the minimal Page permissions
 * (business_management only when the person asks for it after Meta listed no
 * Page). No token is involved yet.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', url.origin));

  const parsed = facebookProjectQuerySchema.safeParse({ projectId: url.searchParams.get('projectId') });
  if (!parsed.success) return facebookConnectRedirect(url.origin, { status: 'error', reason: 'invalid_project' });
  const { projectId } = parsed.data;

  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).maybeSingle();
  if (!project) return facebookConnectRedirect(url.origin, { status: 'error', reason: 'invalid_project' });

  const config = getMetaConfig();
  if (!config || !hasSocialTokenKey()) return facebookConnectRedirect(url.origin, { status: 'error', reason: 'not_configured', projectId });

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'social/facebook-connect', 20, 3600);
  if (!rateLimit.allowed) return facebookConnectRedirect(url.origin, { status: 'error', reason: 'rate_limited', projectId });

  const business = url.searchParams.get('business') === '1';
  const state = newOAuthState();
  const dialog = buildOAuthDialogUrl(config, {
    redirectUri: oauthRedirectUri(url.origin),
    state,
    scopes: business ? [...META_PAGE_SCOPES, META_BUSINESS_SCOPE] : META_PAGE_SCOPES,
  });
  const response = NextResponse.redirect(dialog);
  response.cookies.set(OAUTH_STATE_COOKIE, sealOAuthState({ userId: user.id, projectId, state, business }), oauthCookieOptions());
  return response;
}
