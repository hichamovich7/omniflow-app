import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { suggestKeywordsSchema, keywordSuggestionsSchema } from '@/lib/validations/wordpress';
import { buildKeywordSuggestionsPrompt } from '@/lib/ai/prompts/wordpress-keyword-suggestions-prompt';
import { generateText } from '@/lib/ai/engine';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';

const SUGGESTIONS_MAX_TOKENS = 500;

// TASK-FIX-036 (SEO Keywords block, "1-Click Blog Post" / Option 1 only). A
// pure suggestion call — no wordpress_generations row is created or read
// here; the result only ever persists if the user submits the generation
// form with it. Not subject to the Trial Usage Cap (see DECISIONS.md
// 2026-09-13 (5)) — a cheap FAST auxiliary call, not a full generation.
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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'wordpress/suggest-keywords', 30, 3600);
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
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

  const parsed = suggestKeywordsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { projectId, keyword, language, targetCountry } = parsed.data;

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
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

  try {
    const { system, user: userPrompt } = buildKeywordSuggestionsPrompt({ keyword, language, targetCountry });

    const raw = await generateText({
      role: 'FAST',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: SUGGESTIONS_MAX_TOKENS,
    });

    const json = JSON.parse(raw);
    const validated = keywordSuggestionsSchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'AI returned an invalid keyword suggestion format. Try again.', code: 'suggestion_failed' } },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ keywords: string[] }>>(
      { data: { keywords: validated.data.keywords }, error: null }
    );
  } catch (err) {
    console.error('WordPress keyword suggestion failed:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Keyword suggestion failed. Try again.', code: 'suggestion_failed' } },
      { status: 500 }
    );
  }
}
