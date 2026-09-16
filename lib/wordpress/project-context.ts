import type { ContentStreamStatus } from '@/types/content-streams';

/**
 * Minimal wordpress_sites shape needed to render a per-project connection
 * status without a client-side fetch — the blog-post generator page fetches
 * every owned project's site row up front (server-side, already
 * RLS-scoped: user_id = auth.uid()), then findSiteForProject() runs purely
 * client-side on every project change.
 */
export interface ProjectSiteInfo {
  project_id: string;
  site_url: string;
}

/**
 * Minimal content_streams shape needed to show which stream(s) a WordPress
 * category belongs to. Purely informational (TASK-FIX-040) — this
 * lookup never creates or implies a new relation beyond the existing
 * content_streams.wordpress_category_id column (Phase 2a), and it never
 * feeds into article generation.
 */
export interface ProjectContentStreamInfo {
  id: string;
  project_id: string;
  name: string;
  wordpress_category_id: string | null;
  status: ContentStreamStatus;
}

/** The WordPress site connected to a project, or null if none. */
export function findSiteForProject(sites: ProjectSiteInfo[], projectId: string): ProjectSiteInfo | null {
  return sites.find((s) => s.project_id === projectId) ?? null;
}

/**
 * Every content stream in the given project whose wordpress_category_id
 * matches categoryId — never just the first one, per the task brief ("si
 * plusieurs streams correspondent, tous les afficher sans choisir
 * arbitrairement"). An empty categoryId ("Uncategorized") always returns no
 * matches, regardless of project.
 */
export function findContentStreamsForCategory(
  streams: ProjectContentStreamInfo[],
  projectId: string,
  categoryId: string
): ProjectContentStreamInfo[] {
  if (!categoryId) return [];
  return streams.filter((s) => s.project_id === projectId && s.wordpress_category_id === categoryId);
}
