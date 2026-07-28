import type { SupabaseClient } from '@supabase/supabase-js';
import type { WordPressSite, WordPressSitePublic } from '@/types/wordpress';

const PUBLIC_COLUMNS = 'id, project_id, user_id, site_url, wp_username, created_at';

export async function getWordPressSiteByProjectId(
  supabase: SupabaseClient,
  projectId: string
): Promise<WordPressSitePublic | null> {
  const { data } = await supabase
    .from('wordpress_sites')
    .select(PUBLIC_COLUMNS)
    .eq('project_id', projectId)
    .single();

  return (data as WordPressSitePublic | null) ?? null;
}

/**
 * Selects the encrypted credential column too — only for the two server-side
 * routes that must decrypt it to call the WordPress REST API (publish,
 * category mapping). Pure data access, not an ownership check, so this is
 * safe to centralize per this project's conventions.
 */
export async function getWordPressSiteWithSecretByProjectId(
  supabase: SupabaseClient,
  projectId: string
): Promise<WordPressSite | null> {
  const { data } = await supabase
    .from('wordpress_sites')
    .select('*')
    .eq('project_id', projectId)
    .single();

  return (data as WordPressSite | null) ?? null;
}
