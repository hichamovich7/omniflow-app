import type { SupabaseClient } from '@supabase/supabase-js';
import type { WordPressArticle, WordPressArticleImage, WordPressGeneration } from '@/types/wordpress';
import type { ArticleQualityReport } from '@/lib/wordpress/quality-check';
import { parseQualityReport } from '@/lib/wordpress/quality-report';

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
