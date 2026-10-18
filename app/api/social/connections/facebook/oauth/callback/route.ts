import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getMetaConfig, hasSocialTokenKey, META_REQUIRED_POST_SCOPES, oauthRedirectUri } from '@/lib/social/meta/config';
import { MetaGraphClient } from '@/lib/social/meta/graph-client';
import { logMetaError, MetaApiError } from '@/lib/social/meta/errors';
import {
  OAUTH_STATE_COOKIE,
  oauthCookieOptions,
  openOAuthState,
  PENDING_CONNECTION_COOKIE,
  sealPendingConnection,
  statesMatch,
} from '@/lib/social/meta/oauth-session';
import { facebookConnectRedirect, type FacebookConnectReason } from '@/lib/social/facebook-connect';

/**
 * Facebook Login callback (TASK-068). Checks the anti-CSRF state against the
 * encrypted cookie (same user, not expired), exchanges the code for a
 * long-lived user token on the server, checks the granted permissions and
 * keeps the token only in an encrypted httpOnly cookie for the Page picker
 * (10 minutes). Nothing is stored in the database here; no token is ever put
 * in a URL or a log.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const statePayload = user ? openOAuthState(cookieStore.get(OAUTH_STATE_COOKIE)?.value, user.id) : null;
  const projectId = statePayload?.projectId;

  const fail = (reason: FacebookConnectReason) => {
    const response = facebookConnectRedirect(url.origin, { status: 'error', reason, projectId });
    response.cookies.set(OAUTH_STATE_COOKIE, '', oauthCookieOptions(0));
    return response;
  };

  if (!user || !statePayload || !statesMatch(statePayload.state, url.searchParams.get('state'))) return fail('state_mismatch');
  if (url.searchParams.get('error')) return fail('denied');
  const code = url.searchParams.get('code');
  if (!code || code.length > 2048) return fail('oauth_failed');

  const config = getMetaConfig();
  if (!config || !hasSocialTokenKey()) return fail('not_configured');
  const graph = new MetaGraphClient(config);

  let userToken: string;
  let granted: string[];
  try {
    const short = await graph.exchangeCode(code, oauthRedirectUri(url.origin));
    userToken = (await graph.exchangeLongLived(short.accessToken)).accessToken;
    granted = await graph.grantedPermissions(userToken);
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    logMetaError('oauth', err);
    return fail('oauth_failed');
  }
  if (!META_REQUIRED_POST_SCOPES.every((scope) => granted.includes(scope))) return fail('missing_permissions');

  const response = facebookConnectRedirect(url.origin, { status: 'select', projectId: statePayload.projectId });
  response.cookies.set(OAUTH_STATE_COOKIE, '', oauthCookieOptions(0));
  response.cookies.set(
    PENDING_CONNECTION_COOKIE,
    sealPendingConnection({ userId: user.id, projectId: statePayload.projectId, userToken, grantedScopes: granted }),
    oauthCookieOptions()
  );
  return response;
}
