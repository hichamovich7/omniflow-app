/**
 * Facebook publications and Page connections (TASK-068, migration 046).
 * Client-safe: types, labels and pure state rules only — no token, no
 * server import. The access token never appears in these types: it is only
 * read on the server (lib/queries/social-connections.ts).
 */

export const SOCIAL_CONNECTION_STATUSES = ['active', 'expired', 'revoked', 'error'] as const;
export type SocialConnectionStatus = (typeof SOCIAL_CONNECTION_STATUSES)[number];

/** A connected Facebook Page as the app may see it — the token column is never selected. */
export interface SocialConnection {
  id: string;
  user_id: string;
  project_id: string;
  platform: 'facebook';
  account_type: 'facebook_page';
  external_account_id: string;
  external_account_name: string;
  token_expires_at: string | null;
  granted_scopes: string[];
  status: SocialConnectionStatus;
  last_verified_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export const SOCIAL_CONNECTION_STATUS_LABELS: Record<SocialConnectionStatus, string> = {
  active: 'Connected',
  expired: 'Connection expired',
  revoked: 'Access removed',
  error: 'Connection error',
};

export const PUBLICATION_STATUSES = ['publishing', 'published', 'partial', 'failed', 'unknown'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const COMMENT_STATUSES = ['not_requested', 'pending', 'published', 'failed', 'unknown'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export interface SocialPublication {
  id: string;
  user_id: string;
  project_id: string;
  social_content_generation_id: string | null;
  connection_id: string | null;
  platform: 'facebook';
  external_account_id: string;
  external_account_name: string;
  status: PublicationStatus;
  post_message: string;
  post_image_url: string | null;
  external_post_id: string | null;
  external_post_url: string | null;
  published_at: string | null;
  comment_requested: boolean;
  comment_message: string | null;
  comment_status: CommentStatus;
  external_comment_id: string | null;
  comment_published_at: string | null;
  error_code: string | null;
  error_message: string | null;
  fbtrace_id: string | null;
  attempt_count: number;
  comment_attempt_count: number;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A step older than the routes' maxDuration (60 s) + margin is a killed request. */
export const PUBLICATION_STALE_LOCK_MS = 90_000;

export function isLockStale(lockedAt: string | null, now: Date = new Date()): boolean {
  if (!lockedAt) return true;
  const time = new Date(lockedAt).getTime();
  return Number.isNaN(time) || now.getTime() - time > PUBLICATION_STALE_LOCK_MS;
}

export type FacebookDisplayStatus =
  | 'not_published'
  | 'publishing'
  | 'published'
  | 'comment_published'
  | 'partial'
  | 'failed'
  | 'unknown';

export const FACEBOOK_DISPLAY_STATUS_LABELS: Record<FacebookDisplayStatus, string> = {
  not_published: 'Not published',
  publishing: 'Publishing…',
  published: 'Published',
  comment_published: 'Published + comment',
  partial: 'Partially published',
  failed: 'Publication failed',
  unknown: 'Result being checked',
};

export function facebookDisplayStatus(publication: Pick<SocialPublication, 'status' | 'comment_status'> | null): FacebookDisplayStatus {
  if (!publication) return 'not_published';
  if (publication.status === 'published') return publication.comment_status === 'published' ? 'comment_published' : 'published';
  return publication.status;
}

export interface PublicationActions {
  /** First publication, or a new attempt after a failure that left no post. */
  canPublish: boolean;
  /** New attempt of the post step (failed, unknown, or a killed request) — checks Facebook first. */
  canRetry: boolean;
  /** Only the first comment — the post is already on the Page and is never posted again. */
  canRetryComment: boolean;
  /** The content can still be edited (nothing was, or may have been, posted). */
  canEdit: boolean;
}

export function publicationActions(publication: SocialPublication | null, now: Date = new Date()): PublicationActions {
  if (!publication) return { canPublish: true, canRetry: false, canRetryComment: false, canEdit: true };
  const stale = isLockStale(publication.locked_at, now);
  const hasPost = Boolean(publication.external_post_id);
  const postStepOpen =
    !hasPost && (publication.status === 'failed' || publication.status === 'unknown' || (publication.status === 'publishing' && stale));
  const commentOpen =
    hasPost &&
    publication.comment_requested &&
    (publication.comment_status === 'failed' ||
      publication.comment_status === 'unknown' ||
      (publication.comment_status === 'pending' && stale));
  return {
    canPublish: false,
    canRetry: postStepOpen,
    canRetryComment: commentOpen,
    // After a failure that left no post the text may still change; an
    // unknown result must keep its exact text (it is matched on Facebook).
    canEdit: !hasPost && publication.status === 'failed',
  };
}

// Page picker (GET /api/social/connections/facebook/pages) — names and ids only, never a token.
export interface FacebookPageOption {
  id: string;
  name: string;
  /** The person can create content on the Page (task CREATE_CONTENT). */
  canPublish: boolean;
}

export interface FacebookPagesResponse {
  pages: FacebookPageOption[];
  /** False when the first-comment permission was not granted (posts still work, comments do not). */
  canComment: boolean;
}
