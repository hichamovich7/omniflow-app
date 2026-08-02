import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText, analyzeImage } from '@/lib/ai/engine';
import { getRoleConfig } from '@/lib/ai/config';
import { generatePinsSchema, openRouterPinsResponseSchema } from '@/lib/validations/pinterest';
import { imageStyleAnalysisSchema } from '@/lib/validations/vision';
import { buildPinterestPinsPrompt, estimateMaxTokens, PROMPT_ID } from '@/lib/prompts';
import { buildVisionStyleAnalysisPrompt } from '@/lib/ai/prompts/vision-style-analysis';
import { buildBrandProfileContext } from '@/lib/brand-profile';
import { buildAnalysisContext } from '@/lib/analyzer/context';
import { buildImageAnalysisContext } from '@/lib/vision/context';
import { findOrCreateBoardIds } from '@/lib/queries/boards';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';

function classifyGenerationError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (message === 'OpenRouter returned empty response') {
    return "The AI model didn't return any content — it likely ran out of response tokens before finishing. Try again, or request fewer pins.";
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

  if (err instanceof SyntaxError) {
    return "The AI returned a response that wasn't valid JSON. Try again.";
  }

  return 'Generation failed. Please try again.';
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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'pinterest/generate', 60, 3600);
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

  const parsed = generatePinsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const {
    projectId,
    keyword,
    language,
    pinsRequested,
    board,
    websiteUrl,
    pinterestUrl,
    analysisId,
    textOverlayMode,
    referenceImageUrl,
  } = parsed.data;

  const { data: project } = await supabase
    .from('projects')
    .select('id, description, niche, user_id')
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

  let analysisContext: string | null = null;

  if (analysisId) {
    const { data: analysis } = await supabase
      .from('content_analyses')
      .select('theme, keywords, audience, tone, category, summary, user_id')
      .eq('id', analysisId)
      .single();

    if (!analysis) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Content analysis not found', code: 'invalid_analysis' } },
        { status: 400 }
      );
    }

    if (analysis.user_id !== user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'You do not have access to this content analysis', code: 'forbidden' } },
        { status: 403 }
      );
    }

    analysisContext = buildAnalysisContext(analysis);
  }

  let referenceStyleGuidance: string | undefined;
  let imageAnalysisJson: string | null = null;

  if (referenceImageUrl) {
    try {
      const { instructions } = buildVisionStyleAnalysisPrompt();
      // gemini-2.5-flash spends a chunk of the budget on internal reasoning
      // tokens before emitting the visible JSON — empirically needs ~1000+ to
      // avoid returning empty content (see docs/DECISIONS.md 2026-08-02).
      const raw = await analyzeImage({ imageUrl: referenceImageUrl, instructions, maxTokens: 1200 });
      const parsedAnalysis = imageStyleAnalysisSchema.safeParse(JSON.parse(raw));

      if (parsedAnalysis.success) {
        referenceStyleGuidance = buildImageAnalysisContext(parsedAnalysis.data);
        imageAnalysisJson = JSON.stringify(parsedAnalysis.data);
      } else {
        console.error('[vision-style-analysis] Response validation failed:', parsedAnalysis.error.issues);
      }
    } catch (err) {
      // Best-effort: the reference image is a style enhancement, not a
      // required input — a VISION provider hiccup must never block the whole
      // generation, it just falls back to no reference style guidance.
      console.error('[vision-style-analysis] analyzeImage failed:', err);
    }
  }

  const model = getRoleConfig('FAST').model;

  const { data: generation, error: genError } = await supabase
    .from('generations')
    .insert({
      project_id: projectId,
      user_id: user.id,
      keyword,
      language,
      pins_requested: pinsRequested,
      website_url: websiteUrl ?? null,
      pinterest_url: pinterestUrl ?? null,
      reference_image_url: referenceImageUrl ?? null,
      model_used: model,
      credits_used: 0,
      status: 'processing',
    })
    .select()
    .single();

  if (genError) {
    console.error('Failed to create generation:', genError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to start generation', code: 'server_error' } },
      { status: 500 }
    );
  }

  try {
    const { system, user: userPrompt } = buildPinterestPinsPrompt({
      keyword,
      language,
      pinsRequested,
      niche: project.niche,
      textOverlayMode,
      brandProfile: buildBrandProfileContext(project.description),
      analysisContext: analysisContext ?? undefined,
      referenceStyleGuidance,
    });

    const content = await generateText({
      role: 'FAST',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: estimateMaxTokens(pinsRequested),
    });

    const json = JSON.parse(content);
    const validated = openRouterPinsResponseSchema.safeParse(json);

    if (!validated.success) {
      console.error(`[${PROMPT_ID}] Response validation failed:`, validated.error.issues);
      const errorMessage = 'AI returned an invalid response format. Try again.';
      await supabase.from('generations').update({ status: 'failed', error_message: errorMessage }).eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: errorMessage, code: 'generation_failed' } },
        { status: 500 }
      );
    }

    const pinsGenerated = validated.data.pins.length;

    if (pinsGenerated < pinsRequested) {
      console.warn(
        `[${PROMPT_ID}] Partial result: requested ${pinsRequested}, received ${pinsGenerated}`
      );
    }

    const boardNames = board
      ? validated.data.pins.map(() => board)
      : validated.data.pins.map((pin) => pin.board);

    const boardIdByName = await findOrCreateBoardIds(supabase, projectId, user.id, boardNames);

    const pinsToInsert = validated.data.pins.map((pin, i) => ({
      generation_id: generation.id,
      language,
      title: pin.title,
      description: pin.description,
      keywords: pin.keywords,
      board: boardNames[i],
      board_id: boardIdByName.get(boardNames[i].trim()) ?? null,
      image_prompt: pin.image_prompt,
      visual_format: pin.visualFormat,
      overlay_text: pin.overlayText ?? null,
      image_analysis: imageAnalysisJson,
    }));

    const { error: pinsError } = await supabase.from('pins').insert(pinsToInsert);

    if (pinsError) {
      console.error('Failed to insert pins:', pinsError);
      const errorMessage = 'Failed to save generated pins. Try again.';
      await supabase.from('generations').update({ status: 'failed', error_message: errorMessage }).eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: errorMessage, code: 'server_error' } },
        { status: 500 }
      );
    }

    await supabase.from('generations').update({ status: 'completed' }).eq('id', generation.id);

    return NextResponse.json<ApiResponse<{ generationId: string; status: string; pinsGenerated: number }>>(
      {
        data: { generationId: generation.id, status: 'completed', pinsGenerated },
        error: null,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Generation failed:', err);
    const errorMessage = classifyGenerationError(err);
    await supabase.from('generations').update({ status: 'failed', error_message: errorMessage }).eq('id', generation.id);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: errorMessage, code: 'generation_failed' } },
      { status: 500 }
    );
  }
}
