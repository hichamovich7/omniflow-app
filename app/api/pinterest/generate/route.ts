import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/engine';
import { getRoleConfig } from '@/lib/ai/config';
import { generatePinsSchema, openRouterPinsResponseSchema } from '@/lib/validations/pinterest';
import { buildPinterestPinsPrompt, estimateMaxTokens, PROMPT_ID } from '@/lib/prompts';
import { buildBrandProfileContext } from '@/lib/brand-profile';
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

  const body = await request.json();
  const parsed = generatePinsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { projectId, keyword, language, pinsRequested } = parsed.data;

  const { data: project } = await supabase
    .from('projects')
    .select('id, description')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'invalid_project' } },
      { status: 400 }
    );
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
      brandProfile: buildBrandProfileContext(project.description),
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

    const pinsToInsert = validated.data.pins.map((pin) => ({
      generation_id: generation.id,
      language,
      title: pin.title,
      description: pin.description,
      keywords: pin.keywords,
      board: pin.board,
      image_prompt: pin.image_prompt,
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
