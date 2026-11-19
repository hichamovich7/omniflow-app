import type { SocialConnection, SocialPublication } from '@/lib/social/facebook-publication';

/**
 * Several Facebook Pages per project (TASK-102, migration 053). Client-safe
 * pure rules — no server import, no token.
 *
 * - The target Page is always an explicit choice of the person; a category
 *   mapping only pre-selects it, and only when the answer is unambiguous.
 * - Once a publication row exists, its Page is frozen on it
 *   (`external_account_id`): Retry, Retry comment, Reschedule and the cron
 *   always use that Page — never another Page of the project.
 * - One draft targets one Page in TASK-102 (several Pages in one action is a
 *   separate task): a draft that is published, scheduled or running on one
 *   Page cannot be sent to another one.
 */

/** "WordPress category → Facebook Page" of a project (facebook_page_category_mappings). */
export interface FacebookPageCategoryMapping {
  id: string;
  project_id: string;
  wordpress_category_id: string;
  external_account_id: string;
}

export type FacebookPageSuggestionReason =
  /** No Page connected to the project. */
  | 'no_pages'
  /** The project has a single Page: it is pre-selected. */
  | 'only_page'
  /** The article's category is mapped to one connected Page: it is pre-selected. */
  | 'category'
  /** The article's categories point to several connected Pages: the person must choose. */
  | 'ambiguous'
  /** Several Pages and no usable mapping: the person must choose. */
  | 'none';

export interface FacebookPageSuggestion {
  connectionId: string | null;
  reason: FacebookPageSuggestionReason;
}

/**
 * The Page to pre-select for a draft. Never a silent choice between several
 * Pages: without exactly one mapped (and connected) Page, nothing is
 * pre-selected. A mapping to a Page that is not connected any more is ignored.
 */
export function suggestFacebookPage(input: {
  connections: Pick<SocialConnection, 'id' | 'external_account_id'>[];
  mappings: Pick<FacebookPageCategoryMapping, 'wordpress_category_id' | 'external_account_id'>[];
  categoryIds: string[];
}): FacebookPageSuggestion {
  const { connections } = input;
  if (connections.length === 0) return { connectionId: null, reason: 'no_pages' };
  if (connections.length === 1) return { connectionId: connections[0].id, reason: 'only_page' };

  const categories = new Set(input.categoryIds);
  const pageIds = new Set(input.mappings.filter((m) => categories.has(m.wordpress_category_id)).map((m) => m.external_account_id));
  const candidates = connections.filter((connection) => pageIds.has(connection.external_account_id));
  if (candidates.length === 1) return { connectionId: candidates[0].id, reason: 'category' };
  if (candidates.length > 1) return { connectionId: null, reason: 'ambiguous' };
  return { connectionId: null, reason: 'none' };
}

export const FACEBOOK_PAGE_SUGGESTION_MESSAGES: Record<FacebookPageSuggestionReason, string | null> = {
  no_pages: null,
  only_page: null,
  category: 'Suggested from the article category. You can choose another Page.',
  ambiguous: 'This article’s categories are linked to several Pages. Choose the Page for this post.',
  none: 'Choose the Page for this post.',
};

/** A publication row that "holds" its Page: something is (or may be) on it, or is waiting to go there. */
export function publicationHoldsPage(publication: Pick<SocialPublication, 'status' | 'external_post_id'>): boolean {
  if (publication.external_post_id) return true;
  return publication.status !== 'cancelled' && publication.status !== 'failed';
}

/**
 * The publication of this draft on ANOTHER Page that blocks sending it to
 * `pageId`, or null. A cancelled schedule or a failure that left no post
 * does not block (nothing is on Facebook); everything else does.
 */
export function otherPagePublication<T extends Pick<SocialPublication, 'status' | 'external_post_id' | 'external_account_id'>>(
  publications: T[],
  pageId: string
): T | null {
  return publications.find((row) => row.external_account_id !== pageId && publicationHoldsPage(row)) ?? null;
}

/** Error code of the publish / schedule refusal when the draft already holds another Page (TASK-102). */
export const OTHER_PAGE_PUBLICATION_CODE = 'other_page_publication';

export function otherPageConflictMessage(publication: Pick<SocialPublication, 'external_account_name' | 'status'>): string {
  const where = `the Page "${publication.external_account_name}"`;
  const what = publication.status === 'scheduled' ? `already scheduled on ${where}` : `already published or being published on ${where}`;
  return `This post is ${what}. One post targets one Page: to publish this article on another Page, use "Create new post with this image" in "Post image".`;
}

/**
 * The publication shown for a draft: the row that holds a Page (at most one,
 * see otherPagePublication), else the most recently updated one.
 */
export function currentPublication<T extends Pick<SocialPublication, 'status' | 'external_post_id' | 'updated_at'>>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
  return sorted.find(publicationHoldsPage) ?? sorted[0];
}

/**
 * The connection a publication may use: its own connection, or — after a
 * disconnect + reconnect, when connection_id was set to NULL — the
 * connection of the SAME Page in the SAME project. Never another Page, never
 * another project or user. `relinked` = the row's connection_id must be
 * updated to the returned connection.
 */
export async function resolvePublicationConnection(
  publication: Pick<SocialPublication, 'user_id' | 'project_id' | 'connection_id' | 'external_account_id'>,
  loaders: {
    byId(connectionId: string): Promise<SocialConnection | null>;
    byProjectPage(projectId: string, pageId: string): Promise<SocialConnection | null>;
  }
): Promise<{ connection: SocialConnection | null; relinked: boolean }> {
  const own = publication.connection_id ? await loaders.byId(publication.connection_id) : null;
  const ok = (connection: SocialConnection | null): connection is SocialConnection =>
    Boolean(
      connection &&
        connection.user_id === publication.user_id &&
        connection.project_id === publication.project_id &&
        connection.platform === 'facebook' &&
        connection.external_account_id === publication.external_account_id
    );
  if (own) return { connection: ok(own) ? own : null, relinked: false };
  const same = await loaders.byProjectPage(publication.project_id, publication.external_account_id);
  return ok(same) ? { connection: same, relinked: true } : { connection: null, relinked: false };
}

/** The connection of a publication's own Page among the project's connections (UI). */
export function connectionForPage<T extends Pick<SocialConnection, 'external_account_id'>>(connections: T[], pageId: string | null | undefined): T | null {
  if (!pageId) return null;
  return connections.find((connection) => connection.external_account_id === pageId) ?? null;
}
