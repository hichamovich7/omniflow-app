import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createResearchSchema } from '@/lib/validations/research';
import { runResearch } from '@/lib/research/engine';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';

const RESEARCH_ERROR_MESSAGE = "Couldn't retrieve content from that source. Check the URL and try again.";

function classifyResearchError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (message === 'Firecrawl returned no content for that URL') {
    return "This page didn't return any readable content — it may require login, block automated access, or render slowly. Try a different URL.";
  }

  if (message === 'Firecrawl returned no search results for that keyword') {
    return 'No web results found for that keyword. Try a different or broader keyword.';
  }

  if (message === 'Firecrawl does not support this site') {
    return "This site isn't supported by our research provider. Try a different URL, or use Keyword research instead.";
  }

  const httpMatch = message.match(/^Firecrawl error: (\d+)$/);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    if (status === 401 || status === 403) {
      return 'That source blocked automated access. Try a different URL.';
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

  return RESEARCH_ERROR_MESSAGE;
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

  const rateLimit = await checkRateLimit(user.id, 'research', 60, 3600);
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

  const parsed = createResearchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { projectId, sourceType, input } = parsed.data;

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
    const result = await runResearch({ sourceType, input });

    const { data: researchResult, error: dbError } = await supabase
      .from('research_results')
      .insert({
        project_id: projectId,
        user_id: user.id,
        source_type: sourceType,
        input,
        title: result.title,
        content: result.content,
        source_url: result.sourceUrl,
        status: 'completed',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Failed to save research result:', dbError);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Failed to save research result', code: 'server_error' } },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ researchId: string; title: string | null; content: string; sourceUrl: string | null }>>(
      {
        data: {
          researchId: researchResult.id,
          title: result.title,
          content: result.content,
          sourceUrl: result.sourceUrl,
        },
        error: null,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Research failed:', err);
    const errorMessage = classifyResearchError(err);

    await supabase.from('research_results').insert({
      project_id: projectId,
      user_id: user.id,
      source_type: sourceType,
      input,
      content: '',
      status: 'failed',
      error_message: errorMessage,
    });

    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: errorMessage, code: 'research_failed' } },
      { status: 500 }
    );
  }
}
