import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callOpenRouter } from '@/lib/openrouter/client';
import { generatePinsSchema, openRouterPinsResponseSchema } from '@/lib/validations/pinterest';
import { buildPinterestPinsPrompt, estimateMaxTokens, PROMPT_ID } from '@/lib/prompts';
import type { ApiResponse } from '@/types/api';

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
    .select('id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'invalid_project' } },
      { status: 400 }
    );
  }

  const model = process.env.OPENROUTER_TEXT_MODEL ?? 'google/gemini-2.5-flash';

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
    });

    const content = await callOpenRouter({
      model,
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
      await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'AI returned invalid response', code: 'generation_failed' } },
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
      await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Failed to save generated pins', code: 'server_error' } },
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
    await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Generation failed', code: 'generation_failed' } },
      { status: 500 }
    );
  }
}
