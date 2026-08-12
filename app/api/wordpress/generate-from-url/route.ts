import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateArticleFromUrlSchema } from '@/lib/validations/wordpress';
import { generateArticleFromUrl } from '@/lib/wordpress/generate-article-from-url';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';

// Same budget as /api/wordpress/generate and /api/wordpress/generate-from-pins
// (outline + full-article generation, up to ARTICLE_GENERATION_TIMEOUT_MS =
// 120s, plus image generation) — see docs/DEPLOYMENT.md.
export const maxDuration = 180;

const MAX_KEYWORD_LENGTH = 200;

/**
 * Cheap, synchronous placeholder for wordpress_generations.keyword (NOT
 * NULL) — set before any scrape/AI call so a 'processing' row can be
 * inserted immediately, same insert-first-then-generate sequencing as
 * Option 1/4. Replaced with the AI-derived resolvedKeyword (from the
 * scraped title or the source summary's theme) once generation succeeds.
 */
function deriveInitialKeyword(sourceType: 'link' | 'pasted', sourceUrl?: string, pastedContent?: string): string {
  if (sourceType === 'link') {
    return (sourceUrl ?? '').slice(0, MAX_KEYWORD_LENGTH);
  }
  const firstLine = (pastedContent ?? '').split(/\r?\n/)[0]?.trim() ?? '';
  return (firstLine || 'Pasted content').slice(0, MAX_KEYWORD_LENGTH);
}

function classifyGenerationError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  // Firecrawl (scrape step) errors — same classification as /api/research.
  if (message === 'Firecrawl returned no content for that URL') {
    return "This page didn't return any readable content — it may require login, block automated access, or render slowly. Try a different URL, or paste the text directly instead.";
  }
  if (message === 'Firecrawl does not support this site') {
    return "This site isn't supported by our research provider. Try a different URL, or paste the text directly instead.";
  }
  const firecrawlHttpMatch = message.match(/^Firecrawl error: (\d+)$/);
  if (firecrawlHttpMatch) {
    const status = Number(firecrawlHttpMatch[1]);
    if (status === 401 || status === 403) {
      return 'That source blocked automated access. Try a different URL, or paste the text directly instead.';
    }
    if (status === 408) {
      return 'The request timed out while loading that page. Try again.';
    }
    if (status === 429) {
      return 'Rate limit reached. Try again in a moment.';
    }
    if (status >= 500) {
      return 'The content service is temporarily unavailable. Try again shortly.';
    }
    return `Request failed (HTTP ${status}). Try again.`;
  }

  // AI generation errors — same classification as /api/wordpress/generate.
  if (message === 'OpenRouter returned empty response') {
    return "The AI model didn't return any content — it likely ran out of response tokens before finishing. Try again.";
  }
  if (message.startsWith('OpenRouter stream error')) {
    return 'The AI provider connection was interrupted mid-response. Please try again.';
  }
  const httpMatch = message.match(/^OpenRouter error: (\d+)$/);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    if (status === 401 || status === 403) {
      return 'AI provider rejected the request (authentication error). Please contact support.';
    }
    if (status === 429) {
      return 'AI provider rate limit reached. Try again in a moment.';
    }
    if (status >= 500) {
      return 'AI provider is temporarily unavailable. Try again shortly.';
    }
    return `AI provider request failed (HTTP ${status}). Try again.`;
  }

  if (
    message.includes('invalid outline format') ||
    message.includes('invalid article format') ||
    message.includes('invalid source summary format')
  ) {
    return message;
  }

  if (err instanceof SyntaxError) {
    return "The AI returned a response that wasn't valid JSON. Try again.";
  }

  return 'Article generation failed. Please try again.';
}

export async function POST(request: Request) {
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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'wordpress/generate-from-url', 20, 3600);
  if (!rateLimit.allowed) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Rate limit exceeded. Try again later.', code: 'rate_limited' } },
      { status: 429 }
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

  const parsed = generateArticleFromUrlSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { projectId, language, categoryId, sourceType, sourceUrl, pastedContent } = parsed.data;

  const { data: project } = await supabase
    .from('projects')
    .select('id, description, user_id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'invalid_project' } },
      { status: 400 }
    );
  }

  if (project.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this project', code: 'forbidden' } },
      { status: 403 }
    );
  }

  if (categoryId) {
    const { data: category } = await supabase
      .from('wordpress_categories')
      .select('id, project_id')
      .eq('id', categoryId)
      .single();

    if (!category || category.project_id !== projectId) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Category does not belong to this project', code: 'invalid_category' } },
        { status: 400 }
      );
    }
  }

  const keyword = deriveInitialKeyword(sourceType, sourceUrl, pastedContent);

  const { data: generation, error: genError } = await supabase
    .from('wordpress_generations')
    .insert({
      project_id: projectId,
      user_id: user.id,
      keyword,
      language,
      source_type: 'url',
      source_url: sourceType === 'link' ? sourceUrl : null,
      status: 'processing',
    })
    .select()
    .single();

  if (genError) {
    console.error('Failed to create wordpress generation:', genError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to start generation', code: 'server_error' } },
      { status: 500 }
    );
  }

  try {
    const result = await generateArticleFromUrl({
      supabase,
      userId: user.id,
      generationId: generation.id,
      sourceUrl: sourceType === 'link' ? sourceUrl : undefined,
      pastedContent: sourceType === 'pasted' ? pastedContent : undefined,
      language,
      brandProfileDescription: project.description,
    });

    const { data: article, error: articleError } = await supabase
      .from('wordpress_articles')
      .insert({
        generation_id: generation.id,
        title: result.title,
        meta_title: result.metaTitle,
        slug: result.slug,
        meta_description: result.metaDescription,
        content: result.content,
        word_count: result.wordCount,
        featured_image_prompt: result.featuredImagePrompt,
        featured_image_url: result.featuredImageUrl,
        status: 'completed',
        category_id: categoryId ?? null,
      })
      .select()
      .single();

    if (articleError) {
      console.error('Failed to insert wordpress article:', articleError);
      const errorMessage = 'Failed to save the generated article. Try again.';
      await supabase.from('wordpress_generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: errorMessage, code: 'server_error' } },
        { status: 500 }
      );
    }

    if (result.internalImages.length > 0) {
      const imagesToInsert = result.internalImages.map((img) => ({
        article_id: article.id,
        placement_marker: img.placementMarker,
        prompt: img.prompt,
        alt_text: img.altText,
        url: img.url,
        position: img.position,
      }));

      const { error: imagesError } = await supabase.from('wordpress_article_images').insert(imagesToInsert);
      if (imagesError) {
        console.error('Failed to insert wordpress article images:', imagesError);
      }
    }

    // Replace the placeholder keyword (raw URL / first line of pasted text)
    // with the one actually used to target the outline/article prompts —
    // keeps the stored record consistent with what was really generated.
    await supabase
      .from('wordpress_generations')
      .update({ status: 'completed', keyword: result.resolvedKeyword })
      .eq('id', generation.id);

    return NextResponse.json<ApiResponse<{ generationId: string; status: string }>>(
      { data: { generationId: generation.id, status: 'completed' }, error: null },
      { status: 201 }
    );
  } catch (err) {
    console.error('WordPress generation from URL failed:', err);
    const errorMessage = classifyGenerationError(err);
    await supabase.from('wordpress_generations').update({ status: 'failed' }).eq('id', generation.id);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: errorMessage, code: 'generation_failed' } },
      { status: 500 }
    );
  }
}
