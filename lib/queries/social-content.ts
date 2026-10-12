import type { SupabaseClient } from '@supabase/supabase-js';
import {
  periodStart,
  SOCIAL_CONTENT_PAGE_SIZE,
  type SocialContentFilters,
  type SocialContentGeneration,
  type SocialContentGenerationInsert,
  type SocialContentPlatform,
} from '@/lib/social/social-content';

/**
 * social_content_generations (migration 045, TASK-063). Every query is
 * scoped to the caller (`user_id`) on top of RLS — defense in depth.
 */

/** PostgREST / Postgres codes for a table that does not exist yet (migration 045 not applied). */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

export type SaveSocialContentResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'migration_required' | 'error' };

export async function insertSocialContentGeneration(
  supabase: SupabaseClient,
  row: SocialContentGenerationInsert
): Promise<SaveSocialContentResult> {
  try {
    const { data, error } = await supabase.from('social_content_generations').insert(row).select('id').single();
    if (error || !data) {
      const code = (error as { code?: string } | null)?.code ?? '';
      // Codes only — never the content or the error details.
      console.error(`[social-content] save failed: ${code || 'no row returned'}`);
      return { ok: false, reason: MISSING_TABLE_CODES.has(code) ? 'migration_required' : 'error' };
    }
    return { ok: true, id: (data as { id: string }).id };
  } catch {
    console.error('[social-content] save failed: exception');
    return { ok: false, reason: 'error' };
  }
}

export interface SocialContentListItem extends SocialContentGeneration {
  projects: { name: string } | null;
}

export async function listSocialContentGenerations(
  supabase: SupabaseClient,
  userId: string,
  platform: SocialContentPlatform,
  filters: SocialContentFilters,
  now: Date = new Date()
): Promise<{ items: SocialContentListItem[]; total: number; unavailable: boolean }> {
  let query = supabase
    .from('social_content_generations')
    .select('*, projects(name)', { count: 'exact' })
    .eq('user_id', userId)
    .eq('platform', platform)
    .order('created_at', { ascending: false });

  if (filters.project) query = query.eq('project_id', filters.project);
  if (filters.source) query = query.eq('source_type', filters.source);
  if (filters.status) query = query.eq('status', filters.status);
  const since = periodStart(filters.period, now);
  if (since) query = query.gte('created_at', since);

  const from = (filters.page - 1) * SOCIAL_CONTENT_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + SOCIAL_CONTENT_PAGE_SIZE - 1);
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    return { items: [], total: 0, unavailable: MISSING_TABLE_CODES.has(code) };
  }
  return { items: (data ?? []) as SocialContentListItem[], total: count ?? 0, unavailable: false };
}

export async function getSocialContentGeneration(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<SocialContentListItem | null> {
  const { data } = await supabase
    .from('social_content_generations')
    .select('*, projects(name)')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as SocialContentListItem | null) ?? null;
}

/** Deletes one saved item of the caller. Never touches its source (article, post, Pins). */
export async function deleteSocialContentGeneration(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<'deleted' | 'not_found' | 'error'> {
  const { data, error } = await supabase
    .from('social_content_generations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) return 'error';
  return (data ?? []).length > 0 ? 'deleted' : 'not_found';
}

// ---------------------------------------------------------------------------
// Sources offered on /medium (TASK-064) — read-only selects of the caller's rows

export const MEDIUM_SOURCE_OPTIONS_LIMIT = 50;

export interface MediumArticleOption {
  id: string;
  title: string;
  projectName: string;
  createdAt: string;
  published: boolean;
}

export interface MediumPinterestOption {
  id: string;
  keyword: string;
  projectName: string;
  pins: number;
  createdAt: string;
}

export interface MediumSiteOption {
  id: string;
  siteUrl: string;
  projectName: string;
}

/** Completed OmniFlow articles, newest first. */
export async function listMediumArticleOptions(supabase: SupabaseClient, userId: string): Promise<MediumArticleOption[]> {
  const { data } = await supabase
    .from('wordpress_generations')
    .select('id, keyword, created_at, projects(name), wordpress_articles(title, status, wp_post_id, publish_status)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(MEDIUM_SOURCE_OPTIONS_LIMIT);
  type Row = {
    id: string;
    keyword: string;
    created_at: string;
    projects: { name: string } | null;
    wordpress_articles:
      | { title: string; status: string; wp_post_id: number | null; publish_status: string }
      | Array<{ title: string; status: string; wp_post_id: number | null; publish_status: string }>
      | null;
  };
  return ((data ?? []) as unknown as Row[]).flatMap((row) => {
    const article = Array.isArray(row.wordpress_articles) ? row.wordpress_articles[0] : row.wordpress_articles;
    if (!article || article.status !== 'completed') return [];
    return [
      {
        id: row.id,
        title: article.title || row.keyword,
        projectName: row.projects?.name ?? 'Project',
        createdAt: row.created_at,
        published: Boolean(article.wp_post_id) && article.publish_status === 'published',
      },
    ];
  });
}

/** Completed Pinterest generations made from an article (OmniFlow article or existing WordPress post). */
export async function listMediumPinterestOptions(supabase: SupabaseClient, userId: string): Promise<MediumPinterestOption[]> {
  const { data, error } = await supabase
    .from('generations')
    .select('id, keyword, pins_requested, created_at, projects(name)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .or('source_wordpress_generation_id.not.is.null,source_type.eq.external_wordpress_post')
    .order('created_at', { ascending: false })
    .limit(MEDIUM_SOURCE_OPTIONS_LIMIT);
  if (error) return [];
  type Row = { id: string; keyword: string; pins_requested: number; created_at: string; projects: { name: string } | null };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    keyword: row.keyword,
    projectName: row.projects?.name ?? 'Project',
    pins: row.pins_requested,
    createdAt: row.created_at,
  }));
}

/** Connected WordPress sites — public columns only (never the encrypted password). */
export async function listMediumSiteOptions(supabase: SupabaseClient, userId: string): Promise<MediumSiteOption[]> {
  const { data } = await supabase.from('wordpress_sites').select('id, site_url, projects(name)').eq('user_id', userId);
  type Row = { id: string; site_url: string; projects: { name: string } | null };
  return ((data ?? []) as unknown as Row[]).map((row) => ({ id: row.id, siteUrl: row.site_url, projectName: row.projects?.name ?? 'Project' }));
}
