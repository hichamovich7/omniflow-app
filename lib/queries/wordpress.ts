import type { SupabaseClient } from '@supabase/supabase-js';
import type { WordPressArticle, WordPressArticleImage, WordPressGeneration } from '@/types/wordpress';
import type { ArticleQualityReport } from '@/lib/wordpress/quality-check';
import { parseQualityReport } from '@/lib/wordpress/quality-report';
import type { PinsSeoSource } from '@/lib/wordpress/tags';

export async function getWordPressArticleByGenerationId(supabase: SupabaseClient, generationId: string) {
  const { data: generation } = await supabase
    .from('wordpress_generations')
    .select('*')
    .eq('id', generationId)
    .single();

  if (!generation) {
    return {
      generation: null as WordPressGeneration | null,
      article: null as WordPressArticle | null,
      images: [] as WordPressArticleImage[],
      qualityReport: null as ArticleQualityReport | null,
    };
  }

  // Validated here so every reader gets a typed report or null, never raw jsonb.
  const qualityReport = parseQualityReport((generation as WordPressGeneration).quality_report);

  const { data: article } = await supabase
    .from('wordpress_articles')
    .select('*')
    .eq('generation_id', generationId)
    .single();

  if (!article) {
    return { generation: generation as WordPressGeneration, article: null, images: [] as WordPressArticleImage[], qualityReport };
  }

  const { data: images } = await supabase
    .from('wordpress_article_images')
    .select('*')
    .eq('article_id', article.id)
    .order('position', { ascending: true });

  return {
    generation: generation as WordPressGeneration,
    article: article as WordPressArticle,
    images: (images ?? []) as WordPressArticleImage[],
    qualityReport,
  };
}

interface PinSeoRow {
  id: string;
  keywords: string | null;
  generation_id: string;
  // Embedded to-one resource: object or single-element array depending on
  // FK detection — same ambiguity handled in the generate-from-pins route.
  generations: { keyword: string | null } | { keyword: string | null }[] | null;
}

/**
 * SEO data for publishing a Pins-method article (TASK-FIX-050): each selected
 * Pin's keywords, and the keyword of the Pinterest generation they come from
 * (pins.generation_id → generations.keyword). The generate-from-pins route
 * only accepts Pins from one generation; if they somehow span several with
 * different keywords, there is no single common keyword → null.
 */
export async function getPinsSeoSource(supabase: SupabaseClient, pinIds: string[]): Promise<PinsSeoSource> {
  if (pinIds.length === 0) return { sourceKeyword: null, pinKeywords: [] };

  const { data } = await supabase
    .from('pins')
    .select('id, keywords, generation_id, generations(keyword)')
    .in('id', pinIds);

  const rows = (data ?? []) as unknown as PinSeoRow[];
  // Keep the order the user selected the Pins in.
  const order = new Map(pinIds.map((id, i) => [id, i]));
  const sorted = [...rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const sourceKeywords = new Set<string>();
  for (const row of sorted) {
    const generation = Array.isArray(row.generations) ? row.generations[0] : row.generations;
    const keyword = generation?.keyword?.trim();
    if (keyword) sourceKeywords.add(keyword);
  }

  return {
    sourceKeyword: sourceKeywords.size === 1 ? [...sourceKeywords][0] : null,
    pinKeywords: sorted.map((row) => row.keywords ?? '').filter((k) => k.trim() !== ''),
  };
}
