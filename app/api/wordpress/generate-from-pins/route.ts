import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateArticleFromPinsSchema } from '@/lib/validations/wordpress';
import { generateArticleFromPins } from '@/lib/wordpress/generate-article';
import { getActivePinImageUrls } from '@/lib/queries/pin-images';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';
import type { Pin } from '@/types/database';
import type { PinSummary } from '@/lib/ai/prompts/wordpress-from-pins-prompt';
import type { SupportedLanguage } from '@/types/pinterest';

const MAX_INTERNAL_IMAGES = 3;
const MAX_KEYWORD_LENGTH = 200;

function classifyGenerationError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

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

  if (message.includes('invalid outline format') || message.includes('invalid article format')) {
    return message;
  }

  if (err instanceof SyntaxError) {
    return "The AI returned a response that wasn't valid JSON. Try again.";
  }

  return 'Article generation failed. Please try again.';
}

interface PinGenerationRef {
  id: string;
  project_id: string;
  user_id: string;
}

interface PinWithGeneration extends Pin {
  // Supabase's embedded-resource shape for a to-one FK can come back as an
  // object or a single-element array depending on FK detection — same
  // ambiguity handled defensively in wordpress-history-table.tsx.
  generations: PinGenerationRef | PinGenerationRef[] | null;
}

function normalizeGeneration(gen: PinGenerationRef | PinGenerationRef[] | null): PinGenerationRef | null {
  if (Array.isArray(gen)) return gen[0] ?? null;
  return gen;
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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'wordpress/generate-from-pins', 20, 3600);
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

  const parsed = generateArticleFromPinsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { pinIds, researchNotes } = parsed.data;

  if (pinIds.length < 3) {
    console.warn(`[wordpress-from-pins] Only ${pinIds.length} pin(s) selected — article may lack source material.`);
  }

  const { data: pinsData } = await supabase
    .from('pins')
    .select('*, generations(id, project_id, user_id)')
    .in('id', pinIds)
    .order('created_at', { ascending: true });

  const pins = (pinsData ?? []) as unknown as PinWithGeneration[];

  if (pins.length !== pinIds.length) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'One or more selected pins were not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  const generationIds = new Set(pins.map((p) => p.generation_id));
  if (generationIds.size > 1) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Selected pins must come from the same generation', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const generationRef = normalizeGeneration(pins[0].generations);
  if (!generationRef || generationRef.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to one or more of these pins', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const projectId = generationRef.project_id;
  const language = pins[0].language as SupportedLanguage;

  const { data: project } = await supabase
    .from('projects')
    .select('description')
    .eq('id', projectId)
    .single();

  const imageUrlByPinId = await getActivePinImageUrls(supabase, pinIds);
  const pinsWithImage = pins.filter((p) => imageUrlByPinId.has(p.id)).slice(0, MAX_INTERNAL_IMAGES);
  const pinsWithoutImage = pins.filter((p) => !pinsWithImage.includes(p));
  const orderedPins = [...pinsWithImage, ...pinsWithoutImage];

  const internalImageUrls = pinsWithImage.map((p) => imageUrlByPinId.get(p.id)!);
  const pinSummaries: PinSummary[] = orderedPins.map((p) => ({
    title: p.title,
    description: p.description,
    keywords: p.keywords,
  }));

  const keyword = pins
    .slice(0, MAX_INTERNAL_IMAGES)
    .map((p) => p.title)
    .join(' + ')
    .slice(0, MAX_KEYWORD_LENGTH);

  const { data: generation, error: genError } = await supabase
    .from('wordpress_generations')
    .insert({
      project_id: projectId,
      user_id: user.id,
      keyword,
      language,
      source_type: 'pins',
      source_pin_ids: pinIds,
      research_notes: researchNotes ?? null,
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
    const result = await generateArticleFromPins({
      supabase,
      userId: user.id,
      generationId: generation.id,
      pins: pinSummaries,
      internalImageUrls,
      language,
      brandProfileDescription: project?.description ?? null,
      researchNotes,
    });

    const { data: article, error: articleError } = await supabase
      .from('wordpress_articles')
      .insert({
        generation_id: generation.id,
        title: result.title,
        slug: result.slug,
        meta_description: result.metaDescription,
        content: result.content,
        word_count: result.wordCount,
        featured_image_prompt: result.featuredImagePrompt,
        featured_image_url: result.featuredImageUrl,
        status: 'completed',
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

    await supabase.from('wordpress_generations').update({ status: 'completed' }).eq('id', generation.id);

    return NextResponse.json<ApiResponse<{ generationId: string; status: string }>>(
      { data: { generationId: generation.id, status: 'completed' }, error: null },
      { status: 201 }
    );
  } catch (err) {
    console.error('WordPress generation from pins failed:', err);
    const errorMessage = classifyGenerationError(err);
    await supabase.from('wordpress_generations').update({ status: 'failed' }).eq('id', generation.id);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: errorMessage, code: 'generation_failed' } },
      { status: 500 }
    );
  }
}
