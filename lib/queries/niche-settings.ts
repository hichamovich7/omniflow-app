import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeNicheSettings, parseNicheSettings, type NicheSettings } from '@/lib/niche/settings';

// projects.niche_settings (migration 041). Everything here works before the
// migration is applied: reads fall back to defaults (null), and only a save
// reports `migration_required`. Generations only ever read.

export const NICHE_SETTINGS_MIGRATION_MESSAGE =
  'Niche settings cannot be saved yet: migration 041 (projects.niche_settings) has not been applied in Supabase. Generations keep using the recommended values.';

interface DbError {
  code?: string;
  message?: string;
}

/** Postgres "undefined column" (42703) or PostgREST's schema-cache miss (PGRST204). */
export function isMissingNicheSettingsColumn(error: DbError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /niche_settings/i.test(error.message ?? '');
}

export interface ReadNicheSettingsResult {
  settings: NicheSettings | null;
  /** false when the column does not exist yet (migration 041 not applied). */
  available: boolean;
}

/** Best-effort, read-only: never throws, never blocks a generation. */
export async function readProjectNicheSettings(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<ReadNicheSettingsResult> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('niche_settings')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { settings: null, available: !isMissingNicheSettingsColumn(error) };
    return { settings: parseNicheSettings((data as { niche_settings?: unknown } | null)?.niche_settings), available: true };
  } catch {
    return { settings: null, available: true };
  }
}

/** Convenience for generation paths: the parsed settings or null. */
export async function getProjectNicheSettings(supabase: SupabaseClient, userId: string, projectId: string): Promise<NicheSettings | null> {
  return (await readProjectNicheSettings(supabase, userId, projectId)).settings;
}

export type SaveNicheSettingsResult =
  | { ok: true; settings: NicheSettings | null }
  | { ok: false; code: 'migration_required' | 'not_found' | 'server_error'; message: string };

/**
 * Writes only `projects.niche_settings` of one owned project. `null` (or
 * settings that normalize to nothing) resets the project to the defaults.
 */
export async function saveProjectNicheSettings(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  settings: NicheSettings | null
): Promise<SaveNicheSettingsResult> {
  const normalized = normalizeNicheSettings(settings);
  const { data, error } = await supabase
    .from('projects')
    .update({ niche_settings: normalized })
    .eq('id', projectId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) {
    return isMissingNicheSettingsColumn(error)
      ? { ok: false, code: 'migration_required', message: NICHE_SETTINGS_MIGRATION_MESSAGE }
      : { ok: false, code: 'server_error', message: 'Failed to save niche settings' };
  }
  if (!data) return { ok: false, code: 'not_found', message: 'Project not found' };
  return { ok: true, settings: normalized };
}
