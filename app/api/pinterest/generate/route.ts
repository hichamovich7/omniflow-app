import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText, analyzeImage } from '@/lib/ai/engine';
import { getRoleConfig } from '@/lib/ai/config';
import { generatePinsSchema, BANNER_TEMPLATES } from '@/lib/validations/pinterest';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import { getNicheVisualConvention, DEFAULT_NICHE_CONVENTION } from '@/lib/ai/niche-visual-conventions';
import { imageStyleAnalysisSchema } from '@/lib/validations/vision';
import { buildPinterestPinsPrompt, estimateMaxTokens, PROMPT_ID } from '@/lib/prompts';
import { buildVisionStyleAnalysisPrompt } from '@/lib/ai/prompts/vision-style-analysis';
import { buildBrandProfileContext } from '@/lib/brand-profile';
import { buildAnalysisContext } from '@/lib/analyzer/context';
import { buildImageAnalysisContext } from '@/lib/vision/context';
import {
  attachPinterestStrategyMetadata,
  selectHeadlineTemplateForAngle,
  validatePinterestStrategyBatch,
} from '@/lib/pinterest/strategy';
import {
  PIN_PLAN_FAILURE_MESSAGE,
  PinterestPlanError,
  parsePinterestGenerationPlan,
} from '@/lib/pinterest/generation-plan';
import type { PinterestGenerationPlan } from '@/lib/pinterest/generation-plan';
import { findOrCreateBoardIds } from '@/lib/queries/boards';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';
import {
  attachAiIntegratedMetadata,
  resolveEffectiveLanguage,
  resolveAiIntegratedText,
  resolvePinAngle,
} from '@/lib/pinterest/ai-integrated';

// Defense in depth (TASK-FIX-024), same mechanism as the allowTextOverlay
// clamp in lib/prompts/pinterest-pins.ts: the prompt only asks the AI to pick
// among the niche's eligible templates, but nothing guarantees it complied —
// so the persisted value is clamped here regardless of what the model returned.
function clampBannerTemplate(
  chosen: BannerTemplate | undefined,
  allowed: BannerTemplate[]
): BannerTemplate {
  if (chosen && allowed.includes(chosen)) return chosen;
  return allowed[0];
}

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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'pinterest/generate', 60, 3600, {
    enforceTrialLimit: true,
  });
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
    language: requestedLanguage,
    pinsRequested,
    board,
    websiteUrl,
    pinterestUrl,
    analysisId,
    generationMode,
  } = parsed.data;
  // The schema already rejects a reference for the other modes; this is a
  // second guard so the Vision step below can only ever run for Legacy
  // Composite (TASK-013 behavior, unchanged).
  const referenceImageUrl = generationMode === 'legacy-composite'
    ? parsed.data.referenceImageUrl
    : undefined;
  const textOverlayMode = generationMode === 'legacy-composite'
    ? parsed.data.textOverlayMode
    : 'never';
  const aiIntegrated = generationMode === 'ai-integrated'
    ? parsed.data.aiIntegrated
    : undefined;

  const { data: project } = await supabase
    .from('projects')
    .select('id, description, niche, user_id, default_language')
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

  const language = resolveEffectiveLanguage(
    generationMode,
    requestedLanguage,
    project.default_language
  );

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
      generationMode,
      aiIntegrated,
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
      maxTokens: estimateMaxTokens(pinsRequested, {
        integratedText: generationMode === 'ai-integrated',
      }),
    });

    // The plan must be complete and valid before anything else happens: no
    // board is created, no pin is written and no image is ever requested for a
    // response that cannot be trusted (it is never repaired or completed).
    let plan: PinterestGenerationPlan;
    try {
      plan = parsePinterestGenerationPlan(content);
    } catch (planError) {
      if (!(planError instanceof PinterestPlanError)) throw planError;
      // Bounded diagnostics only — never the full raw response.
      console.error(`[${PROMPT_ID}] Pin plan rejected:`, planError.diagnostics());
      await supabase
        .from('generations')
        .update({ status: 'failed', error_message: PIN_PLAN_FAILURE_MESSAGE })
        .eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: PIN_PLAN_FAILURE_MESSAGE, code: 'invalid_pin_plan' } },
        { status: 422 }
      );
    }

    const resolvedPins = plan.pins.map((pin) => ({
      ...pin,
      angle: aiIntegrated
        ? resolvePinAngle(aiIntegrated.strategy, aiIntegrated.manualAngle, pin.angle)
        : pin.angle,
    }));

    const strategyIssues = validatePinterestStrategyBatch(
      resolvedPins,
      pinsRequested,
      [keyword, analysisContext].filter(Boolean).join('\n'),
      {
        enforceBalancedAngles:
          !aiIntegrated || aiIntegrated.strategy === 'balanced',
      }
    );
    if (strategyIssues.length > 0) {
      console.error(`[${PROMPT_ID}] Strategy validation failed:`, strategyIssues);
      const errorMessage = 'AI returned Pinterest content that failed strategy safeguards. Try again.';
      await supabase
        .from('generations')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', generation.id);
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: errorMessage, code: 'generation_failed' } },
        { status: 500 }
      );
    }

    const pinsGenerated = resolvedPins.length;

    if (pinsGenerated < pinsRequested) {
      console.warn(
        `[${PROMPT_ID}] Partial result: requested ${pinsRequested}, received ${pinsGenerated}`
      );
    }

    const boardNames = board
      ? resolvedPins.map(() => board)
      : resolvedPins.map((pin) => pin.board);

    const boardIdByName = await findOrCreateBoardIds(supabase, projectId, user.id, boardNames);

    const allowedBannerTemplates =
      getNicheVisualConvention(project.niche)?.allowedBannerTemplates ??
      DEFAULT_NICHE_CONVENTION.allowedBannerTemplates ??
      [...BANNER_TEMPLATES];

    const angleOccurrences = new Map<string, number>();

    const pinsToInsert = resolvedPins.map((pin, i) => {
      const angleOccurrence = angleOccurrences.get(pin.angle) ?? 0;
      angleOccurrences.set(pin.angle, angleOccurrence + 1);

      const legacyVisualFormat = pin.visualFormat;
      const visualFormat = generationMode === 'ai-integrated'
        ? 'ai-integrated'
        : generationMode === 'photo-only'
          ? 'photo-only'
          : legacyVisualFormat;
      const strategyMetadata = attachPinterestStrategyMetadata(imageAnalysisJson, pin.angle);
      const persistedAnalysis = aiIntegrated
        ? attachAiIntegratedMetadata(strategyMetadata, {
            language,
            settings: aiIntegrated,
            text: resolveAiIntegratedText(aiIntegrated, pin.integratedText),
          })
        : strategyMetadata;

      return {
        generation_id: generation.id,
        language,
        title: pin.title,
        description: pin.description,
        keywords: pin.keywords,
        board: boardNames[i],
        board_id: boardIdByName.get(boardNames[i].trim()) ?? null,
        image_prompt: pin.image_prompt,
        visual_format: visualFormat,
        overlay_text: generationMode === 'legacy-composite' ? pin.overlayText ?? null : null,
        // Angle stays transient in Phase 4: it selects an existing persisted
        // template value without requiring a new pins column or migration.
        title_banner_template:
          generationMode === 'legacy-composite' && legacyVisualFormat === 'text-overlay'
            ? selectHeadlineTemplateForAngle(
                pin.angle,
                angleOccurrence,
                allowedBannerTemplates
              )
            : null,
        cta_banner_template:
          generationMode === 'legacy-composite'
            ? clampBannerTemplate(pin.ctaBannerTemplate, allowedBannerTemplates)
            : null,
        // Reuse the existing JSON text column so image rendering can recover
        // the structured angle without a schema migration. Reference-style
        // fields remain unchanged at the top level for compatibility.
        image_analysis: persistedAnalysis,
      };
    });

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
