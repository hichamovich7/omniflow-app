import type { SupabaseClient } from '@supabase/supabase-js';
import { listBoardOccupants } from '@/lib/queries/content-streams';

// Content Stream names used as sub-niche context for generation prompts
// (lib/niche/resolve.ts). Read-only and best-effort: a failed lookup returns
// [] and the generation simply runs with the project niche alone. Archived
// streams no longer frame anything (same rule as findBoardOccupant).

/** Streams linked to a WordPress category (content_streams.wordpress_category_id). */
export async function listContentStreamNamesForCategory(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  categoryId: string | null | undefined
): Promise<string[]> {
  if (!categoryId) return [];
  try {
    const { data, error } = await supabase
      .from('content_streams')
      .select('name, status')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('wordpress_category_id', categoryId)
      .neq('status', 'archived')
      .order('created_at', { ascending: true });
    if (error) return [];
    return ((data ?? []) as { name: string }[]).map((row) => row.name).filter(Boolean);
  } catch {
    return [];
  }
}

/** Streams linked to the project's real board with this name (content_stream_boards). */
export async function listContentStreamNamesForBoard(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  boardName: string | null | undefined
): Promise<string[]> {
  const name = boardName?.trim();
  if (!name) return [];
  try {
    const { data, error } = await supabase
      .from('boards')
      .select('id')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('name', name);
    if (error || !data || data.length === 0) return [];
    const occupants = await listBoardOccupants(supabase, (data as { id: string }[]).map((board) => board.id));
    return occupants.filter((o) => o.status !== 'archived' && o.content_stream_name).map((o) => o.content_stream_name);
  } catch {
    return [];
  }
}
