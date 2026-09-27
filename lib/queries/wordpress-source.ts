import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The WordPress article a Pinterest generation was created FROM (TASK-044
 * phase 2, `generations.source_wordpress_generation_id`). Distinct from
 * `wordpress-usage.ts`, which covers the opposite direction (Pins used IN an
 * article) and is left untouched.
 */
export type GenerationWordPressSource =
  | {
      status: 'available';
      /** wordpress_generations.id — the /wordpress/[id] route param. */
      generationId: string;
      title: string;
    }
  | { status: 'unavailable' };

/**
 * For each given Pinterest generation id created from a WordPress article, its
 * source article. Keyword generations (NULL source) are absent from the map.
 * A source id the user no longer owns / can no longer read, or without an
 * article row, maps to `unavailable`.
 *
 * At most three grouped queries whatever the page size (never one per row).
 * Ownership: explicit `user_id` filters on generations and wordpress_generations,
 * on top of RLS via the passed-in session client. Any query error (e.g.
 * migration 040 not applied yet) degrades to an empty map — the history keeps
 * its previous display.
 */
export async function getGenerationsWordPressSource(
  supabase: SupabaseClient,
  userId: string,
  generationIds: string[]
): Promise<Map<string, GenerationWordPressSource>> {
  const result = new Map<string, GenerationWordPressSource>();
  if (generationIds.length === 0) return result;

  const { data: generations, error: generationsError } = await supabase
    .from('generations')
    .select('id, source_wordpress_generation_id')
    .eq('user_id', userId)
    .in('id', generationIds)
    .not('source_wordpress_generation_id', 'is', null);

  if (generationsError) {
    console.error('[wordpress-source] generations query failed:', generationsError);
    return result;
  }

  const linked = ((generations ?? []) as { id: string; source_wordpress_generation_id: string | null }[])
    .filter((g): g is { id: string; source_wordpress_generation_id: string } => !!g.source_wordpress_generation_id);
  if (linked.length === 0) return result;

  const sourceIds = Array.from(new Set(linked.map((g) => g.source_wordpress_generation_id)));

  const { data: owned, error: ownedError } = await supabase
    .from('wordpress_generations')
    .select('id')
    .eq('user_id', userId)
    .in('id', sourceIds);

  if (ownedError) {
    console.error('[wordpress-source] wordpress_generations query failed:', ownedError);
  }

  const ownedIds = ((owned ?? []) as { id: string }[]).map((w) => w.id);
  const titleBySourceId = new Map<string, string>();

  if (ownedIds.length > 0) {
    const { data: articles, error: articlesError } = await supabase
      .from('wordpress_articles')
      .select('generation_id, title')
      .in('generation_id', ownedIds);

    if (articlesError) {
      console.error('[wordpress-source] wordpress_articles query failed:', articlesError);
    }

    for (const article of (articles ?? []) as { generation_id: string; title: string | null }[]) {
      const title = article.title?.trim();
      if (title && !titleBySourceId.has(article.generation_id)) {
        titleBySourceId.set(article.generation_id, title);
      }
    }
  }

  for (const generation of linked) {
    const sourceId = generation.source_wordpress_generation_id;
    const title = titleBySourceId.get(sourceId);
    result.set(
      generation.id,
      title ? { status: 'available', generationId: sourceId, title } : { status: 'unavailable' }
    );
  }

  return result;
}

export const WORDPRESS_SOURCE_LABEL = 'From WordPress';
export const WORDPRESS_SOURCE_UNAVAILABLE_LABEL = 'WordPress article unavailable';

export type WordPressSourceDisplay =
  | { kind: 'link'; href: string; label: string; title: string }
  | { kind: 'unavailable'; label: string };

/** What the history badge shows for a source (pure, so it is testable offline). */
export function describeWordPressSource(source: GenerationWordPressSource): WordPressSourceDisplay {
  if (source.status === 'unavailable') {
    return { kind: 'unavailable', label: WORDPRESS_SOURCE_UNAVAILABLE_LABEL };
  }
  return {
    kind: 'link',
    href: `/wordpress/${encodeURIComponent(source.generationId)}`,
    label: WORDPRESS_SOURCE_LABEL,
    title: source.title,
  };
}
