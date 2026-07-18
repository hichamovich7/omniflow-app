import type { SupabaseClient } from '@supabase/supabase-js';

export interface WordPressUsageArticle {
  /** wordpress_generations.id — this is the /wordpress/[id] route param, not wordpress_articles.id */
  generationId: string;
  title: string;
  slug: string;
}

export interface GenerationWordPressUsage {
  usedPinCount: number;
  totalPinCount: number;
  articles: WordPressUsageArticle[];
}

/**
 * For each given pin id, the distinct WordPress articles (Option 4 —
 * "Selected Pins" source) that were generated from it. Two grouped queries
 * total, never one per pin: wordpress_generations.source_pin_ids only exists
 * on Option 4 rows, so matching generations are found first via array overlap,
 * then their articles are fetched in a single follow-up `in()` query.
 * Ownership is enforced by RLS on both tables via the passed-in session client.
 */
export async function getPinsWordPressUsage(
  supabase: SupabaseClient,
  pinIds: string[]
): Promise<Map<string, WordPressUsageArticle[]>> {
  if (pinIds.length === 0) return new Map();

  const { data: generations, error: generationsError } = await supabase
    .from('wordpress_generations')
    .select('id, source_pin_ids')
    .overlaps('source_pin_ids', pinIds);

  if (generationsError) {
    console.error('[wordpress-usage] getPinsWordPressUsage generations query failed:', generationsError);
  }

  const matchedGenerations = (generations ?? []) as { id: string; source_pin_ids: string[] | null }[];
  if (matchedGenerations.length === 0) return new Map();

  const generationIds = matchedGenerations.map((g) => g.id);

  const { data: articles, error: articlesError } = await supabase
    .from('wordpress_articles')
    .select('generation_id, title, slug')
    .in('generation_id', generationIds);

  if (articlesError) {
    console.error('[wordpress-usage] getPinsWordPressUsage articles query failed:', articlesError);
  }

  const articleByGenerationId = new Map<string, WordPressUsageArticle>(
    ((articles ?? []) as { generation_id: string; title: string; slug: string }[]).map((a) => [
      a.generation_id,
      { generationId: a.generation_id, title: a.title, slug: a.slug },
    ])
  );

  const pinIdSet = new Set(pinIds);
  const usage = new Map<string, WordPressUsageArticle[]>();

  for (const generation of matchedGenerations) {
    const article = articleByGenerationId.get(generation.id);
    // Generation matched but has no article row yet (mid-flight or failed insert) — nothing to link to.
    if (!article) continue;

    for (const pinId of generation.source_pin_ids ?? []) {
      if (!pinIdSet.has(pinId)) continue;
      const list = usage.get(pinId) ?? [];
      list.push(article);
      usage.set(pinId, list);
    }
  }

  return usage;
}

/**
 * For each given Pinterest generation id: how many of its pins are used in at
 * least one WordPress article (out of its total pin count), and the distinct
 * articles concerned. Built on top of getPinsWordPressUsage — same shared
 * infrastructure, no duplicated overlap/join logic.
 */
export async function getGenerationsWordPressUsage(
  supabase: SupabaseClient,
  generationIds: string[]
): Promise<Map<string, GenerationWordPressUsage>> {
  const result = new Map<string, GenerationWordPressUsage>();
  if (generationIds.length === 0) return result;

  const { data: pins, error: pinsError } = await supabase
    .from('pins')
    .select('id, generation_id')
    .in('generation_id', generationIds);

  if (pinsError) {
    console.error('[wordpress-usage] getGenerationsWordPressUsage pins query failed:', pinsError);
  }

  const allPins = (pins ?? []) as { id: string; generation_id: string }[];
  if (allPins.length === 0) return result;

  const pinUsage = await getPinsWordPressUsage(supabase, allPins.map((p) => p.id));

  for (const generationId of generationIds) {
    result.set(generationId, { usedPinCount: 0, totalPinCount: 0, articles: [] });
  }

  for (const pin of allPins) {
    const entry = result.get(pin.generation_id);
    if (!entry) continue;
    entry.totalPinCount += 1;

    const articlesForPin = pinUsage.get(pin.id);
    if (!articlesForPin || articlesForPin.length === 0) continue;

    entry.usedPinCount += 1;
    for (const article of articlesForPin) {
      if (!entry.articles.some((a) => a.generationId === article.generationId)) {
        entry.articles.push(article);
      }
    }
  }

  return result;
}
