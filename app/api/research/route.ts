import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createResearchSchema } from '@/lib/validations/research';
import { runResearch } from '@/lib/research/engine';
import type { ApiResponse } from '@/types/api';

const RESEARCH_ERROR_MESSAGE = "Couldn't retrieve content from that source. Check the URL and try again.";

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
    .select('id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'invalid_project' } },
      { status: 400 }
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

    await supabase.from('research_results').insert({
      project_id: projectId,
      user_id: user.id,
      source_type: sourceType,
      input,
      content: '',
      status: 'failed',
      error_message: RESEARCH_ERROR_MESSAGE,
    });

    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: RESEARCH_ERROR_MESSAGE, code: 'research_failed' } },
      { status: 500 }
    );
  }
}
