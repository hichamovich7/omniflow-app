import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWordPressArticleByGenerationId } from '@/lib/queries/wordpress';
import { getWordPressSiteByProjectId } from '@/lib/queries/wordpress-sites';
import { listContentStreamNamesForCategory } from '@/lib/queries/niche-context';
import { getProjectNicheSettings } from '@/lib/queries/niche-settings';
import { resolveNicheContext } from '@/lib/niche/resolve';
import { rewriteArticleSchema } from '@/lib/validations/wordpress-rewrite';
import {
  RewriteArticleError,
  applyImageUrlMap,
  buildRewriteArticleRow,
  buildRewriteGenerationRow,
  buildRewriteImageRows,
  copyArticleImages,
  prepareRewriteSource,
  rewriteArticleContent,
} from '@/lib/wordpress/rewrite-article';
import { saveQualityReport } from '@/lib/wordpress/quality-report';
import { saveArticleFaq } from '@/lib/wordpress/faq-data';
import type { ArticleQualityReport } from '@/lib/wordpress/quality-check';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

// One article-sized text call (up to ARTICLE_GENERATION_TIMEOUT_MS = 120s)
// plus storage copies — no outline call, no image generation.
export const maxDuration = 180;

export interface RewriteArticleResponse {
  generationId: string;
  previousGenerationId: string;
  status: 'completed';
  quality: ArticleQualityReport;
  warnings: string[];
}

function classifyRewriteError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'OpenRouter returned empty response') {
    return "The AI model didn't return any content. Try again.";
  }
  if (message.startsWith('OpenRouter stream error')) {
    return 'The AI provider connection was interrupted mid-response. Please try again.';
  }
  const httpMatch = message.match(/^OpenRouter error: (\d+)$/);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    if (status === 429) return 'AI provider rate limit reached. Try again in a moment.';
    if (status >= 500) return 'AI provider is temporarily unavailable. Try again shortly.';
    return `AI provider request failed (HTTP ${status}). Try again.`;
  }
  return 'Article rewrite failed. Your current version is unchanged. Please try again.';
}

/**
 * "Rewrite article" — creates a NEW version (new wordpress_generations +
 * wordpress_articles rows) from an owned, completed article. The previous
 * version is only read, never modified, and stays in the history. Nothing is
 * sent to WordPress. See lib/wordpress/rewrite-article.ts.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Unauthorized', code: 'unauthorized' } },
      { status: 401 }
    );
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid article ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
      { status: 400 }
    );
  }

  const parsed = rewriteArticleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { generation, article, images } = await getWordPressArticleByGenerationId(supabase, id);
  if (!generation) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Article not found', code: 'not_found' } },
      { status: 404 }
    );
  }
  if (generation.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this article', code: 'forbidden' } },
      { status: 403 }
    );
  }
  if (generation.status !== 'completed' || !article || article.status !== 'completed' || !article.content.trim()) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Only a completed article can be rewritten', code: 'article_not_ready' } },
      { status: 409 }
    );
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, description, niche, user_id')
    .eq('id', generation.project_id)
    .single();
  if (!project || project.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this project', code: 'forbidden' } },
      { status: 403 }
    );
  }

  // Same budget family as the other WordPress generators (AI text call).
  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'wordpress/rewrite', 20, 3600, {
    enforceTrialLimit: true,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  const source = prepareRewriteSource(article, generation.include_faq);

  const { data: newGeneration, error: genError } = await supabase
    .from('wordpress_generations')
    .insert(buildRewriteGenerationRow(generation))
    .select()
    .single();
  if (genError || !newGeneration) {
    console.error('[wordpress-rewrite] Failed to create generation:', genError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to start the rewrite', code: 'server_error' } },
      { status: 500 }
    );
  }

  const markFailed = () =>
    supabase.from('wordpress_generations').update({ status: 'failed' }).eq('id', newGeneration.id);

  try {
    const siteUrl = (await getWordPressSiteByProjectId(supabase, generation.project_id))?.site_url ?? null;
    const niche = resolveNicheContext({
      niche: project.niche,
      contentStreams: await listContentStreamNamesForCategory(supabase, user.id, generation.project_id, article.category_id),
      settings: await getProjectNicheSettings(supabase, user.id, generation.project_id),
    });

    const rewrite = await rewriteArticleContent(
      { generation, article, brandProfileDescription: project.description, niche, siteUrl },
      source
    );

    // Images are copied only once the text is valid — a failed rewrite
    // leaves no file behind.
    const { urlMap, warnings } = await copyArticleImages(supabase, {
      userId: user.id,
      fromGenerationId: generation.id,
      toGenerationId: newGeneration.id,
      urls: [
        ...source.images.map((image) => image.url),
        ...images.map((image) => image.url).filter((url): url is string => !!url),
        ...(article.featured_image_url ? [article.featured_image_url] : []),
      ],
    });
    const content = applyImageUrlMap(rewrite.content, urlMap);

    const { data: newArticle, error: articleError } = await supabase
      .from('wordpress_articles')
      .insert(buildRewriteArticleRow(article, newGeneration.id, { content, wordCount: rewrite.wordCount }, urlMap))
      .select()
      .single();
    if (articleError || !newArticle) {
      console.error('[wordpress-rewrite] Failed to insert article:', articleError);
      await markFailed();
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Failed to save the rewritten article. Your current version is unchanged.', code: 'server_error' } },
        { status: 500 }
      );
    }

    if (images.length > 0) {
      const { error: imagesError } = await supabase
        .from('wordpress_article_images')
        .insert(buildRewriteImageRows(images, newArticle.id, urlMap));
      if (imagesError) console.error('[wordpress-rewrite] Failed to insert article images:', imagesError);
    }

    await supabase.from('wordpress_generations').update({ status: 'completed' }).eq('id', newGeneration.id);
    await saveQualityReport(supabase, newGeneration.id, rewrite.quality, 'wordpress-rewrite');
    await saveArticleFaq(supabase, newArticle.id, rewrite.faq, 'wordpress-rewrite');

    return NextResponse.json<ApiResponse<RewriteArticleResponse>>(
      {
        data: {
          generationId: newGeneration.id,
          previousGenerationId: generation.id,
          status: 'completed',
          quality: rewrite.quality,
          warnings,
        },
        error: null,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[wordpress-rewrite] Rewrite failed:', err);
    await markFailed();
    if (err instanceof RewriteArticleError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: err.status }
      );
    }
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: classifyRewriteError(err), code: 'generation_failed' } },
      { status: 500 }
    );
  }
}
