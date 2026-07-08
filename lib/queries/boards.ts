import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pin } from '@/types/database';

export async function getBoardWithPins(supabase: SupabaseClient, boardId: string) {
  const { data: board } = await supabase
    .from('boards')
    .select('*, projects(name)')
    .eq('id', boardId)
    .single();

  if (!board) {
    return { board: null, pins: [] as Pin[] };
  }

  const { data: pins } = await supabase
    .from('pins')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });

  return { board, pins: (pins ?? []) as Pin[] };
}

/**
 * Matches AI-suggested board names against existing boards for the project
 * (case-insensitive), creating any that don't exist yet. This is the
 * auto-linking step that turns free-text `pins.board` into real entities.
 */
export async function findOrCreateBoardIds(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  names: string[]
): Promise<Map<string, string>> {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) return new Map();

  const { data: existingBoards } = await supabase
    .from('boards')
    .select('id, name')
    .eq('project_id', projectId);

  const idByLowerName = new Map<string, string>();
  for (const b of (existingBoards ?? []) as { id: string; name: string }[]) {
    idByLowerName.set(b.name.toLowerCase(), b.id);
  }

  const missing = new Map<string, string>(); // lowercase -> first-seen casing
  for (const name of trimmed) {
    const lower = name.toLowerCase();
    if (!idByLowerName.has(lower) && !missing.has(lower)) {
      missing.set(lower, name);
    }
  }

  if (missing.size > 0) {
    const toInsert = Array.from(missing.values()).map((name) => ({
      project_id: projectId,
      user_id: userId,
      name,
    }));

    const { data: created, error } = await supabase.from('boards').insert(toInsert).select('id, name');

    if (error) {
      console.warn('findOrCreateBoardIds: failed to create boards, leaving affected pins unlinked:', error);
    } else {
      for (const b of (created ?? []) as { id: string; name: string }[]) {
        idByLowerName.set(b.name.toLowerCase(), b.id);
      }
    }
  }

  const result = new Map<string, string>();
  for (const name of trimmed) {
    const id = idByLowerName.get(name.toLowerCase());
    if (id) result.set(name, id);
  }
  return result;
}
