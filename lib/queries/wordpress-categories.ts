import type { SupabaseClient } from '@supabase/supabase-js';
import type { WordPressCategory } from '@/types/wordpress';

export async function listWordPressCategories(
  supabase: SupabaseClient,
  projectId: string
): Promise<WordPressCategory[]> {
  const { data } = await supabase
    .from('wordpress_categories')
    .select('*')
    .eq('project_id', projectId)
    .order('name');

  return (data ?? []) as WordPressCategory[];
}

/**
 * Turns a user-entered category name into a URL-friendly slug. No uniqueness
 * guarantee here — the (project_id, name) unique index is the source of
 * truth for duplicate rejection; slugs may repeat across projects.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
