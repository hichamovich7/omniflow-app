/** Facebook Login outcome codes shown on /facebook (TASK-068) — client-safe, fixed texts only. */

export const FACEBOOK_CONNECT_REASONS = [
  'invalid_project',
  'not_configured',
  'rate_limited',
  'denied',
  'state_mismatch',
  'oauth_failed',
  'missing_permissions',
  'expired',
] as const;
export type FacebookConnectReason = (typeof FACEBOOK_CONNECT_REASONS)[number];

export const FACEBOOK_CONNECT_MESSAGES: Record<FacebookConnectReason, string> = {
  invalid_project: 'This project could not be found.',
  not_configured: 'Facebook publishing is not configured on this server yet (Meta app credentials or token encryption key missing).',
  rate_limited: 'Too many connection attempts. Wait a little, then try again.',
  denied: 'The Facebook connection was cancelled. Nothing was connected.',
  state_mismatch: 'The Facebook connection could not be verified (it expired or was started in another tab). Try again.',
  oauth_failed: 'Facebook did not complete the connection. Try again.',
  missing_permissions:
    'Facebook did not grant the permissions needed to list and post on your Pages. Connect again and keep every requested permission.',
  expired: 'The Page selection expired. Connect the Facebook Page again.',
};

export function isFacebookConnectReason(value: string | undefined): value is FacebookConnectReason {
  return (FACEBOOK_CONNECT_REASONS as readonly string[]).includes(value ?? '');
}
