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
