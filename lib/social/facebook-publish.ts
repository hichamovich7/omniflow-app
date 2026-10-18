import { normalizeForMatch } from '@/lib/wordpress/article-context';
import type { MetaGraphClient } from '@/lib/social/meta/graph-client';
import { logMetaError, MetaApiError } from '@/lib/social/meta/errors';
import type { PublicationStore } from '@/lib/queries/social-publications';
import {
  composeFacebookFirstComment,
  composeFacebookPostMessage,
  facebookPartsFromRow,
  type SocialContentGeneration,
} from '@/lib/social/social-content';
import { isLockStale, type SocialConnection, type SocialPublication } from '@/lib/social/facebook-publication';

/**
 * Facebook Page publication (TASK-068) — always started by an explicit user
 * click, never automatic, never scheduled.
 *
 * Order, each step saved before the next one:
 * 1. Row `publishing` (unique per content + Page: a second publication is
 *    impossible).
 * 2. The Page post (photo with the article image, else text). Its id is
 *    saved immediately (`published`).
 * 3. Only then, when the link goes to the first comment, the comment.
 *    Failure → `partial`: the post stays published; only "Retry comment"
 *    is offered, which never posts again.
 *
 * Duplicates: a write that timed out may have been applied by Facebook.
 * Such a step is marked `unknown`; before any new attempt the Page's recent
 * posts (or the post's comments) are read and matched on the exact text — a
 * match is adopted, never posted again.
 */

export type FacebookGraph = Pick<
  MetaGraphClient,
  'createPhotoPost' | 'createFeedPost' | 'createComment' | 'postPermalink' | 'recentPagePosts' | 'postComments'
>;

export interface PublishDeps {
  graph: FacebookGraph;
  store: PublicationStore;
  now?: () => Date;
}

export type PublishConflictCode = 'already_published' | 'in_progress' | 'comment_not_retryable' | 'post_not_retryable';

export class PublishConflictError extends Error {
  readonly status = 409;
  constructor(
    readonly code: PublishConflictCode,
    message: string
  ) {
    super(message);
    this.name = 'PublishConflictError';
  }
}

export interface PublishOutcome {
  publication: SocialPublication;
  /** The Facebook error of the last step that failed — null when everything succeeded. */
  error: MetaApiError | null;
}

const RECONCILE_WINDOW_MS = 5 * 60 * 1000;

function sameMessage(a: string, b: string): boolean {
  return normalizeForMatch(a) === normalizeForMatch(b);
}

function errorPatch(err: MetaApiError) {
  return { error_code: err.codeLabel, error_message: err.message, fbtrace_id: err.fbtraceId };
}

const noError = { error_code: null, error_message: null, fbtrace_id: null };

/** Finds a post whose creation timed out, by its exact text, among the Page's recent posts. */
async function findExistingPost(graph: FacebookGraph, pageToken: string, publication: SocialPublication, now: Date): Promise<string | null> {
  const since = new Date(publication.locked_at ?? publication.updated_at).getTime() - RECONCILE_WINDOW_MS;
  const posts = await graph.recentPagePosts(pageToken, publication.external_account_id, Math.min(since, now.getTime()) / 1000);
  return posts.find((post) => sameMessage(post.message, publication.post_message))?.id ?? null;
}

async function findExistingComment(graph: FacebookGraph, pageToken: string, publication: SocialPublication): Promise<string | null> {
  if (!publication.external_post_id || !publication.comment_message) return null;
  const comments = await graph.postComments(pageToken, publication.external_post_id);
  return (
    comments.find(
      (comment) => (comment.fromId === null || comment.fromId === publication.external_account_id) && sameMessage(comment.message, publication.comment_message ?? '')
    )?.id ?? null
  );
}

async function runPostStep(publication: SocialPublication, pageToken: string, deps: Required<PublishDeps>): Promise<PublishOutcome> {
  const { graph, store } = deps;
  try {
    const { postId } = publication.post_image_url
      ? await graph.createPhotoPost(pageToken, publication.external_account_id, { imageUrl: publication.post_image_url, caption: publication.post_message })
      : await graph.createFeedPost(pageToken, publication.external_account_id, { message: publication.post_message });
    return adoptPost(publication, postId, pageToken, deps);
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    logMetaError('post', err);
    const updated = await store.update(publication.id, {
      status: err.ambiguous ? 'unknown' : 'failed',
      locked_at: null,
      ...errorPatch(err),
    });
    return { publication: updated ?? publication, error: err };
  }
}

/** Saves the post id (before anything else), then runs the comment step when requested. */
async function adoptPost(publication: SocialPublication, postId: string, pageToken: string, deps: Required<PublishDeps>): Promise<PublishOutcome> {
  const { graph, store, now } = deps;
  const url = await graph.postPermalink(pageToken, postId);
  const saved = await store.update(publication.id, {
    status: 'published',
    external_post_id: postId,
    external_post_url: url,
    published_at: now().toISOString(),
    locked_at: publication.comment_requested ? now().toISOString() : null,
    ...noError,
  });
  const current = saved ?? { ...publication, status: 'published' as const, external_post_id: postId, external_post_url: url };
  if (!current.comment_requested) return { publication: current, error: null };
  return runCommentStep(current, pageToken, deps);
}

async function runCommentStep(publication: SocialPublication, pageToken: string, deps: Required<PublishDeps>): Promise<PublishOutcome> {
  const { graph, store, now } = deps;
  if (!publication.external_post_id || !publication.comment_message) {
    return { publication, error: null };
  }
  try {
    const { commentId } = await graph.createComment(pageToken, publication.external_post_id, publication.comment_message);
    const updated = await store.update(publication.id, {
      status: 'published',
      comment_status: 'published',
      external_comment_id: commentId,
      comment_published_at: now().toISOString(),
      comment_attempt_count: publication.comment_attempt_count + 1,
      locked_at: null,
      ...noError,
    });
    return { publication: updated ?? publication, error: null };
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    logMetaError('comment', err);
    const updated = await store.update(publication.id, {
      status: 'partial',
      comment_status: err.ambiguous ? 'unknown' : 'failed',
      comment_attempt_count: publication.comment_attempt_count + 1,
      locked_at: null,
      ...errorPatch(err),
    });
    return { publication: updated ?? publication, error: err };
  }
}

export interface PublishInput {
  generation: Pick<
    SocialContentGeneration,
    'id' | 'user_id' | 'project_id' | 'content_markdown' | 'call_to_action' | 'first_comment_text' | 'link_placement' | 'cta_url' | 'image_url'
  >;
  connection: Pick<SocialConnection, 'id' | 'external_account_id' | 'external_account_name'>;
  pageToken: string;
}

/**
 * "Publish to Facebook" — first publication, or a new attempt when the
 * previous one left no post. Never publishes a content twice on a Page.
 */
export async function publishFacebookContent(input: PublishInput, depsIn: PublishDeps): Promise<PublishOutcome> {
  const deps: Required<PublishDeps> = { now: () => new Date(), ...depsIn };
  const { store, now } = deps;
  const parts = facebookPartsFromRow(input.generation);
  const message = composeFacebookPostMessage(parts);
  const comment = composeFacebookFirstComment(parts);
  const content = {
    post_message: message,
    post_image_url: input.generation.image_url,
    comment_requested: comment !== null,
    comment_message: comment,
    comment_status: comment !== null ? ('pending' as const) : ('not_requested' as const),
    connection_id: input.connection.id,
    external_account_name: input.connection.external_account_name,
  };

  const existing = await store.findForGeneration(input.generation.id, input.connection.external_account_id);
  if (!existing) {
    const { row, conflict } = await store.insert({
      user_id: input.generation.user_id,
      project_id: input.generation.project_id,
      social_content_generation_id: input.generation.id,
      platform: 'facebook',
      external_account_id: input.connection.external_account_id,
      status: 'publishing',
      external_post_id: null,
      external_post_url: null,
      published_at: null,
      external_comment_id: null,
      comment_published_at: null,
      ...noError,
      attempt_count: 1,
      comment_attempt_count: 0,
      locked_at: now().toISOString(),
      ...content,
    });
    if (!row) {
      throw new PublishConflictError(
        conflict ? 'in_progress' : 'post_not_retryable',
        conflict ? 'This content is already being published on this Page.' : 'The publication could not be started. Try again.'
      );
    }
    return runPostStep(row, input.pageToken, deps);
  }

  if (existing.external_post_id) {
    throw new PublishConflictError(
      'already_published',
      existing.status === 'partial'
        ? 'This post is already on the Page. Use "Retry comment" to publish the first comment.'
        : 'This content is already published on this Page.'
    );
  }
  return retryFacebookPost(existing, input.pageToken, depsIn, existing.status === 'failed' ? content : null);
}

/**
 * "Retry" of the post step. A failed attempt (Facebook refused it) is sent
 * again, with the current text when `content` is given. An unknown result or
 * a killed request is first looked up on the Page: found → adopted, not
 * posted again.
 */
export async function retryFacebookPost(
  publication: SocialPublication,
  pageToken: string,
  depsIn: PublishDeps,
  content: Partial<SocialPublication> | null = null
): Promise<PublishOutcome> {
  const deps: Required<PublishDeps> = { now: () => new Date(), ...depsIn };
  const { graph, store, now } = deps;
  const current = now();

  if (publication.external_post_id) {
    throw new PublishConflictError('already_published', 'This content is already published on this Page.');
  }
  if (publication.status === 'publishing' && !isLockStale(publication.locked_at, current)) {
    throw new PublishConflictError('in_progress', 'This content is already being published on this Page.');
  }
  if (publication.status === 'published' || publication.status === 'partial') {
    throw new PublishConflictError('post_not_retryable', 'This post cannot be sent again.');
  }

  const ambiguous = publication.status === 'unknown' || publication.status === 'publishing';
  // An unknown result keeps its exact text: it is what is matched on the Page.
  const claimed = await store.claimPost(publication.id, current, {
    attempt_count: publication.attempt_count + 1,
    ...(ambiguous || !content ? {} : content),
  });
  if (!claimed) throw new PublishConflictError('in_progress', 'This content is already being published on this Page.');

  if (ambiguous) {
    try {
      const found = await findExistingPost(graph, pageToken, publication, current);
      if (found) return adoptPost(claimed, found, pageToken, deps);
    } catch (err) {
      if (!(err instanceof MetaApiError)) throw err;
      logMetaError('post lookup', err);
      // Cannot check the Page: stay unknown rather than risk a duplicate.
      const updated = await store.update(claimed.id, { status: 'unknown', locked_at: null, ...errorPatch(err) });
      return { publication: updated ?? claimed, error: err };
    }
  }
  return runPostStep(claimed, pageToken, deps);
}

/** "Retry comment" — the first comment only; the post is never published again. */
export async function retryFacebookComment(publication: SocialPublication, pageToken: string, depsIn: PublishDeps): Promise<PublishOutcome> {
  const deps: Required<PublishDeps> = { now: () => new Date(), ...depsIn };
  const { graph, store, now } = deps;
  if (!publication.external_post_id || !publication.comment_requested || publication.comment_status === 'published') {
    throw new PublishConflictError('comment_not_retryable', 'There is no first comment to retry for this post.');
  }
  const current = now();
  const claimed = await store.claimComment(publication.id, current);
  if (!claimed) throw new PublishConflictError('in_progress', 'The first comment is already being published.');

  if (publication.comment_status === 'unknown' || publication.comment_status === 'pending') {
    try {
      const found = await findExistingComment(graph, pageToken, publication);
      if (found) {
        const updated = await store.update(claimed.id, {
          status: 'published',
          comment_status: 'published',
          external_comment_id: found,
          comment_published_at: current.toISOString(),
          locked_at: null,
          ...noError,
        });
        return { publication: updated ?? claimed, error: null };
      }
    } catch (err) {
      if (!(err instanceof MetaApiError)) throw err;
      logMetaError('comment lookup', err);
      const updated = await store.update(claimed.id, { status: 'partial', comment_status: 'unknown', locked_at: null, ...errorPatch(err) });
      return { publication: updated ?? claimed, error: err };
    }
  }
  return runCommentStep(claimed, pageToken, deps);
}
