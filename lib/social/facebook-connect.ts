import { NextResponse } from 'next/server';
import type { FacebookConnectReason } from '@/lib/social/facebook-connect-messages';

export { FACEBOOK_CONNECT_MESSAGES, type FacebookConnectReason } from '@/lib/social/facebook-connect-messages';

/**
 * Where the Facebook Login round trip lands (TASK-068): /facebook with a
 * status the page turns into a message or the Page picker. Only fixed
 * reason codes and the project id are put in the URL — never a token, a
 * code or a message from Meta.
 */
export function facebookConnectRedirect(
  origin: string,
  input: { status: 'select' | 'error'; reason?: FacebookConnectReason; projectId?: string }
): NextResponse {
  const target = new URL('/facebook', origin);
  target.searchParams.set('connect', input.status);
  if (input.reason) target.searchParams.set('reason', input.reason);
  if (input.projectId) target.searchParams.set('projectId', input.projectId);
  return NextResponse.redirect(target);
}
