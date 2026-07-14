import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeRequestSchema, openRouterAnalysisResponseSchema } from '@/lib/validations/analyzer';
import { analyzeContent } from '@/lib/analyzer/engine';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';

const ANALYSIS_ERROR_MESSAGE = 'Content analysis failed. Try again.';

interface AnalysisResponseData {
  analysisId: string;
  theme: string;
  keywords: string;
  audience: string;
  tone: string;
  category: string;
  summary: string;
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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'analyze', 60, 3600);
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

  const parsed = analyzeRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { researchResultId } = parsed.data;

  const { data: researchResult } = await supabase
    .from('research_results')
    .select('id, project_id, title, content, status, user_id')
    .eq('id', researchResultId)
    .single();

  if (!researchResult || researchResult.status !== 'completed') {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Research result not found', code: 'invalid_research_result' } },
      { status: 400 }
    );
  }

  if (researchResult.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this research result', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const { data: existing } = await supabase
    .from('content_analyses')
    .select('id, theme, keywords, audience, tone, category, summary')
    .eq('research_result_id', researchResultId)
    .single();

  if (existing) {
    return NextResponse.json<ApiResponse<AnalysisResponseData>>({
      data: {
        analysisId: existing.id,
        theme: existing.theme,
        keywords: existing.keywords,
        audience: existing.audience,
        tone: existing.tone,
        category: existing.category,
        summary: existing.summary,
      },
      error: null,
    });
  }

  try {
    const analysis = await analyzeContent({ title: researchResult.title, content: researchResult.content });
    const validated = openRouterAnalysisResponseSchema.safeParse(analysis);

    if (!validated.success) {
      console.error('[content-analysis-v1] Response validation failed:', validated.error.issues);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'AI returned an invalid response format. Try again.', code: 'analysis_failed' } },
        { status: 500 }
      );
    }

    const { data: inserted, error: dbError } = await supabase
      .from('content_analyses')
      .insert({
        research_result_id: researchResultId,
        project_id: researchResult.project_id,
        user_id: user.id,
        theme: validated.data.theme,
        keywords: validated.data.keywords,
        audience: validated.data.audience,
        tone: validated.data.tone,
        category: validated.data.category,
        summary: validated.data.summary,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Failed to save content analysis:', dbError);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Failed to save content analysis', code: 'server_error' } },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<AnalysisResponseData>>(
      {
        data: {
          analysisId: inserted.id,
          theme: inserted.theme,
          keywords: inserted.keywords,
          audience: inserted.audience,
          tone: inserted.tone,
          category: inserted.category,
          summary: inserted.summary,
        },
        error: null,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Content analysis failed:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: ANALYSIS_ERROR_MESSAGE, code: 'analysis_failed' } },
      { status: 500 }
    );
  }
}
