import type { SupabaseClient } from '@supabase/supabase-js';
import { findProjectPageConnection } from '@/lib/queries/social-connections';
import type { FacebookPageCategoryMapping } from '@/lib/social/facebook-pages';

/**
 * facebook_page_category_mappings (TASK-102, migration 053) — the caller's
 * own session: RLS plus a user_id filter on every query. A mapping is only a
 * suggestion for the Page selector; nothing that publishes reads it.
 */

const MAPPING_COLUMNS = 'id, project_id, wordpress_category_id, external_account_id';
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

export async function listFacebookPageCategoryMappings(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<{ mappings: FacebookPageCategoryMapping[]; unavailable: boolean }> {
  const { data, error } = await supabase
    .from('facebook_page_category_mappings')
    .select(MAPPING_COLUMNS)
    .eq('user_id', userId)
    .eq('project_id', projectId);
  if (error) return { mappings: [], unavailable: MISSING_TABLE_CODES.has((error as { code?: string }).code ?? '') };
  return { mappings: (data ?? []) as FacebookPageCategoryMapping[], unavailable: false };
}

export type SetMappingResult =
  | { ok: true; mapping: FacebookPageCategoryMapping | null }
  | { ok: false; status: number; code: 'not_found' | 'category_not_found' | 'page_not_connected' | 'migration_required' | 'save_failed'; message: string };

/**
 * Sets (pageId) or clears (pageId = null) the suggested Page of one category.
 * The project, the category (same project) and the connected Page (same
 * project) must all be the caller's own — checked here, and again by RLS.
 */
export async function setFacebookPageCategoryMapping(
  supabase: SupabaseClient,
  userId: string,
  input: { projectId: string; categoryId: string; pageId: string | null }
): Promise<SetMappingResult> {
  const { data: project } = await supabase.from('projects').select('id').eq('id', input.projectId).eq('user_id', userId).maybeSingle();
  if (!project) return { ok: false, status: 404, code: 'not_found', message: 'Project not found' };

  const { data: category } = await supabase
    .from('wordpress_categories')
    .select('id')
    .eq('id', input.categoryId)
    .eq('project_id', input.projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!category) return { ok: false, status: 404, code: 'category_not_found', message: 'This category does not belong to the project.' };

  const table = () => supabase.from('facebook_page_category_mappings');
  const failed = (error: { code?: string } | null): SetMappingResult => {
    const code = error?.code ?? '';
    if (MISSING_TABLE_CODES.has(code)) {
      return { ok: false, status: 503, code: 'migration_required', message: 'Category suggestions are not available yet (database migration 053 not applied).' };
    }
    console.error(`[facebook] page category mapping save failed: ${code || 'unknown'}`);
    return { ok: false, status: 500, code: 'save_failed', message: 'The suggested Page could not be saved. Please try again.' };
  };

  if (input.pageId === null) {
    const { error } = await table().delete().eq('user_id', userId).eq('project_id', input.projectId).eq('wordpress_category_id', input.categoryId);
    return error ? failed(error as { code?: string }) : { ok: true, mapping: null };
  }

  const connection = await findProjectPageConnection(supabase, userId, input.projectId, input.pageId);
  if (!connection) return { ok: false, status: 409, code: 'page_not_connected', message: 'This Facebook Page is not connected to the project.' };

  const { data, error } = await table()
    .upsert(
      { user_id: userId, project_id: input.projectId, wordpress_category_id: input.categoryId, external_account_id: input.pageId },
      { onConflict: 'project_id,wordpress_category_id' }
    )
    .select(MAPPING_COLUMNS)
    .single();
  if (error || !data) return failed(error as { code?: string } | null);
  return { ok: true, mapping: data as FacebookPageCategoryMapping };
}

/**
 * The OmniFlow categories of a Facebook draft, read-only: the category of its
 * OmniFlow article, and the category of the Content Stream saved with it
 * (the stream of the article's category at generation time — TASK-068).
 * An existing WordPress post without a Content Stream has no stored
 * category: no suggestion, the person chooses.
 */
export async function facebookDraftCategoryIds(
  supabase: SupabaseClient,
  userId: string,
  draft: { source_wordpress_generation_id: string | null; content_stream_id?: string | null }
): Promise<string[]> {
  const ids = new Set<string>();
  try {
    if (draft.source_wordpress_generation_id) {
      const { data } = await supabase
        .from('wordpress_articles')
        .select('category_id')
        .eq('generation_id', draft.source_wordpress_generation_id)
        .maybeSingle();
      const id = (data as { category_id: string | null } | null)?.category_id;
      if (id) ids.add(id);
    }
    if (draft.content_stream_id) {
      const { data } = await supabase
        .from('content_streams')
        .select('wordpress_category_id')
        .eq('id', draft.content_stream_id)
        .eq('user_id', userId)
        .maybeSingle();
      const id = (data as { wordpress_category_id: string | null } | null)?.wordpress_category_id;
      if (id) ids.add(id);
    }
  } catch {
    return [...ids];
  }
  return [...ids];
}
