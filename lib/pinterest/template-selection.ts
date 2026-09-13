import sharp from 'sharp';
import { getTemplateSpec, TEMPLATE_REFERENCE_WIDTH } from './banner-templates';
import {
  LOCAL_CONTRAST_TARGET,
  planBannerPlacement,
  type CandidateZoneName,
} from './local-contrast';
import { layoutBannerText, type BannerTextLayout } from './text-layout';
import { ANGLE_TEMPLATE_MAP } from './strategy';
import type { AccentColorResult } from './color-extraction';
import {
  V2_BANNER_TEMPLATES,
  type BannerTemplate,
} from '@/lib/validations/pinterest';
import type { PinterestAngle } from '@/types/pinterest';

const QUALITY_GUARDRAIL = 12;
const FALLBACK_TEMPLATE: BannerTemplate = 'clean-band';

export interface TemplateSelectionHistoryItem {
  angle: PinterestAngle;
  template: BannerTemplate;
  position: CandidateZoneName;
}

export interface AutoTemplateSelectionInput {
  imageBuffer: Buffer;
  text: string;
  angle: PinterestAngle;
  accentColor: AccentColorResult['accentColor'];
  allowedTemplates: readonly BannerTemplate[];
}

export interface TemplateCandidateScore {
  template: BannerTemplate;
  position: CandidateZoneName;
  compatible: boolean;
  valid: boolean;
  qualityScore: number;
  repetitionPenalty: number;
  finalScore: number;
  fitScore: number;
  textDensity: number;
  contrastScore: number;
  visualComplexity: number;
  overlayApplied: boolean;
  invalidReason: 'text-fit' | 'contrast' | null;
}

export interface AutoTemplateSelection {
  template: BannerTemplate;
  position: CandidateZoneName;
  fallbackReason: 'compatibility' | 'text-fit' | 'contrast' | null;
  candidates: TemplateCandidateScore[];
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function calculateFit(layout: BannerTextLayout, template: BannerTemplate) {
  const typography = getTemplateSpec(template, 'headline').textArea.typography.headline;
  const scaledMaxFontSize = Math.max(
    layout.minFontSize,
    Math.round(typography.maxFontSize * (layout.bannerWidth / TEMPLATE_REFERENCE_WIDTH))
  );
  const fontRange = Math.max(1, scaledMaxFontSize - layout.minFontSize);
  const fitScore = clamp((layout.fontSize - layout.minFontSize) / fontRange);
  const lineDensity = layout.lines.length / layout.maxLines;
  const areaDensity =
    (layout.textBounds.width * layout.textBounds.height) /
    Math.max(1, layout.innerTextArea.width * layout.innerTextArea.height);
  const textDensity = clamp(lineDensity * 0.6 + areaDensity * 0.4);

  return { fitScore, textDensity };
}

function countHistory(
  history: readonly TemplateSelectionHistoryItem[],
  predicate: (item: TemplateSelectionHistoryItem) => boolean
): number {
  return history.reduce((count, item) => count + (predicate(item) ? 1 : 0), 0);
}

function repetitionPenalty(
  angle: PinterestAngle,
  template: BannerTemplate,
  position: CandidateZoneName,
  history: readonly TemplateSelectionHistoryItem[]
): number {
  const templateUses = countHistory(history, (item) => item.template === template);
  const angleTemplateUses = countHistory(
    history,
    (item) => item.angle === angle && item.template === template
  );
  const exactCombinationUses = countHistory(
    history,
    (item) =>
      item.angle === angle && item.template === template && item.position === position
  );
  const previous = history.at(-1);
  const consecutivePenalty = previous?.template === template ? 4 : 0;

  return (
    Math.min(templateUses, 3) * 5 +
    angleTemplateUses * 8 +
    exactCombinationUses * 16 +
    consecutivePenalty
  );
}

async function scoreTemplate(
  input: AutoTemplateSelectionInput,
  template: BannerTemplate,
  width: number,
  history: readonly TemplateSelectionHistoryItem[],
  compatible: boolean
): Promise<TemplateCandidateScore[]> {
  const base = {
    template,
    compatible,
    qualityScore: Number.NEGATIVE_INFINITY,
    repetitionPenalty: 0,
    finalScore: Number.NEGATIVE_INFINITY,
    fitScore: 0,
    textDensity: 1,
    contrastScore: 0,
    visualComplexity: 1,
    overlayApplied: false,
  };

  let layout: BannerTextLayout;
  try {
    layout = await layoutBannerText(input.text, template, 'headline', width);
  } catch {
    return [{
      ...base,
      position: 'top',
      valid: false,
      invalidReason: 'text-fit',
    }];
  }
  if (layout.template !== template || layout.fallbackReason) {
    return [{
      ...base,
      position: 'top',
      valid: false,
      invalidReason: 'text-fit',
    }];
  }

  const { fitScore, textDensity } = calculateFit(layout, template);
  const plan = await planBannerPlacement(input.imageBuffer, layout, {
    role: 'headline',
    accentColor: input.accentColor,
  });

  return plan.candidates.map((zone): TemplateCandidateScore => {
    const valid =
      zone.safeAreaScore > 0 &&
      Number.isFinite(zone.finalScore) &&
      zone.postOverlayContrastRatio >= LOCAL_CONTRAST_TARGET;
    if (!valid) {
      return {
        ...base,
        position: zone.position,
        valid: false,
        invalidReason: 'contrast',
        visualComplexity: zone.visualComplexity,
        overlayApplied: zone.overlayApplied,
      };
    }

    const contrastScore = clamp(
      (zone.postOverlayContrastRatio - LOCAL_CONTRAST_TARGET) / 2.5
    );
    const calmScore = 1 - zone.visualComplexity;
    const qualityScore =
      (compatible ? 30 : 8) +
      fitScore * 25 +
      (1 - textDensity) * 10 +
      contrastScore * 15 +
      calmScore * 15 +
      (zone.overlayApplied ? 0 : 5);
    const penalty = repetitionPenalty(input.angle, template, zone.position, history);

    return {
      template,
      position: zone.position,
      compatible,
      valid: true,
      qualityScore,
      repetitionPenalty: penalty,
      finalScore: qualityScore - penalty,
      fitScore,
      textDensity,
      contrastScore,
      visualComplexity: zone.visualComplexity,
      overlayApplied: zone.overlayApplied,
      invalidReason: null,
    };
  });
}

function selectBestCandidate(candidates: TemplateCandidateScore[]): TemplateCandidateScore | null {
  const valid = candidates.filter((candidate) => candidate.valid);
  if (valid.length === 0) return null;

  const bestQuality = Math.max(...valid.map((candidate) => candidate.qualityScore));
  return valid
    .filter((candidate) => candidate.qualityScore >= bestQuality - QUALITY_GUARDRAIL)
    .sort(
      (left, right) =>
        right.finalScore - left.finalScore ||
        right.qualityScore - left.qualityScore ||
        left.template.localeCompare(right.template) ||
        left.position.localeCompare(right.position)
    )[0];
}

async function scoreTemplates(
  input: AutoTemplateSelectionInput,
  templates: readonly BannerTemplate[],
  width: number,
  history: readonly TemplateSelectionHistoryItem[],
  compatible: boolean
): Promise<TemplateCandidateScore[]> {
  return (
    await Promise.all(
      templates.map((template) =>
        scoreTemplate(input, template, width, history, compatible)
      )
    )
  ).flat();
}

export async function selectHeadlineTemplate(
  input: AutoTemplateSelectionInput,
  history: readonly TemplateSelectionHistoryItem[] = []
): Promise<AutoTemplateSelection> {
  const metadata = await sharp(input.imageBuffer).metadata();
  if (!metadata.width) throw new Error('Cannot select a template for an image without width');

  const mappedTemplates = ANGLE_TEMPLATE_MAP[input.angle].filter((template) =>
    input.allowedTemplates.includes(template)
  );
  const mappedScores = await scoreTemplates(
    input,
    mappedTemplates,
    metadata.width,
    history,
    true
  );
  const mappedSelection = selectBestCandidate(mappedScores);
  if (mappedSelection) {
    return {
      template: mappedSelection.template,
      position: mappedSelection.position,
      fallbackReason: null,
      candidates: mappedScores,
    };
  }

  const nicheFallbacks = V2_BANNER_TEMPLATES.filter(
    (template) =>
      input.allowedTemplates.includes(template) && !mappedTemplates.includes(template)
  );
  const safeFallbacks: BannerTemplate[] = input.allowedTemplates.includes(FALLBACK_TEMPLATE)
    ? [FALLBACK_TEMPLATE]
    : nicheFallbacks;
  const fallbackScores = await scoreTemplates(
    input,
    safeFallbacks,
    metadata.width,
    history,
    false
  );
  const fallbackSelection = selectBestCandidate(fallbackScores);
  if (!fallbackSelection) {
    throw new Error(`No readable headline template is available for angle "${input.angle}"`);
  }

  const mappedHadTextFit = mappedScores.some(
    (candidate) => candidate.invalidReason !== 'text-fit'
  );
  return {
    template: fallbackSelection.template,
    position: fallbackSelection.position,
    fallbackReason:
      mappedTemplates.length === 0
        ? 'compatibility'
        : mappedHadTextFit
          ? 'contrast'
          : 'text-fit',
    candidates: [...mappedScores, ...fallbackScores],
  };
}

export async function selectHeadlineTemplateBatch(
  inputs: readonly AutoTemplateSelectionInput[]
): Promise<AutoTemplateSelection[]> {
  const selections: AutoTemplateSelection[] = [];
  const history: TemplateSelectionHistoryItem[] = [];

  for (const input of inputs) {
    const selection = await selectHeadlineTemplate(input, history);
    selections.push(selection);
    history.push({
      angle: input.angle,
      template: selection.template,
      position: selection.position,
    });
  }

  return selections;
}
