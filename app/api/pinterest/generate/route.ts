import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callOpenRouter } from '@/lib/openrouter/client';
import { generatePinsSchema, openRouterPinsResponseSchema } from '@/lib/validations/pinterest';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import type { ApiResponse } from '@/types/api';

function buildPrompt(keyword: string, language: SupportedLanguage, pinsRequested: number) {
  const langName = LANGUAGE_LABELS[language];

  const system = `You are an expert Pinterest SEO content creator. You generate high-quality, unique Pinterest content optimized for search and engagement. All content must be written in ${langName}. You must respond ONLY with valid JSON. No markdown, no explanations, no extra text.`;

  const user = `Generate ${pinsRequested} unique Pinterest pins for the keyword: "${keyword}"

For each pin, provide:
- title: SEO-optimized Pinterest title (max 100 characters)
- description: SEO-optimized Pinterest description with call to action (max 500 characters)
- keywords: 10 to 15 relevant Pinterest keywords, comma separated, no hashtags
- board: suggested Pinterest board name
- image_prompt: detailed prompt to generate a vertical Pinterest image (2:3 ratio) for this pin

Rules:
- Each pin must be unique. Do not repeat titles or descriptions.
- Titles must be compelling and include the main keyword naturally.
- Descriptions must include a call to action and relevant keywords.
- Keywords must be relevant to the pin topic, no duplicates across pins.
- Board name must be a real Pinterest board category.
- Image prompts must describe a vertical Pinterest-style image with specific colors, composition, and style.
- All content must be in ${langName}.

Respond with this exact JSON structure:
{
  "pins": [
    {
      "title": "...",
      "description": "...",
      "keywords": "keyword1, keyword2, keyword3, ...",
      "board": "...",
      "image_prompt": "..."
    }
  ]
}`;

  return { system, user };
}

function estimateMaxTokens(pinsRequested: number): number {
  const tokensPerPin = 350;
  const overhead = 100;
  return pinsRequested * tokensPerPin + overhead;
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
    const { system, user: userPrompt } = buildPrompt(keyword, language, pinsRequested);

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
      console.error('OpenRouter response validation failed:', validated.error.issues);
      await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'AI returned invalid response', code: 'generation_failed' } },
        { status: 500 }
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

    return NextResponse.json<ApiResponse<{ generationId: string; status: string }>>(
      { data: { generationId: generation.id, status: 'completed' }, error: null },
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
