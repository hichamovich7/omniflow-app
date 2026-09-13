import type { PinImage } from '@/types/database';
import { extractAccentColor } from '@/lib/pinterest/color-extraction';
import type { AccentColorResult } from '@/lib/pinterest/color-extraction';
import { compositeBanner, type BannerPosition } from '@/lib/pinterest/compositing';
import { BANNER_TEMPLATES, type BannerTemplate } from '@/lib/validations/pinterest';
import {
  selectHeadlineTemplate,
  type AutoTemplateSelection,
} from '@/lib/pinterest/template-selection';
import {
  composeHeadlineWithQualityGate,
  type QualityGateCompositionResult,
} from '@/lib/pinterest/quality-gate';
import type { PinterestAngle } from '@/types/pinterest';

export const MANUAL_TEMPLATE_CHOICES = [
  'auto',
  'minimal',
  'editorial',
  'split',
  'magazine',
] as const;

export const MANUAL_POSITION_CHOICES = ['auto', 'top', 'bottom'] as const;

export type ManualTemplateChoice = (typeof MANUAL_TEMPLATE_CHOICES)[number];
export type ManualPositionChoice = (typeof MANUAL_POSITION_CHOICES)[number];

export interface ManualRecompositionInput {
  sourceImageBuffer: Buffer;
  overlayText: string;
  angle: PinterestAngle;
  accentColor?: AccentColorResult | null;
  ctaText: string;
  ctaTemplate?: BannerTemplate | null;
  templateChoice: ManualTemplateChoice;
  positionChoice: ManualPositionChoice;
  allowedTemplates?: BannerTemplate[];
}

export interface ManualRecompositionResult {
  imageBuffer: Buffer;
  template: BannerTemplate;
  position: BannerPosition;
  quality: QualityGateCompositionResult['quality'];
  autoSelection: AutoTemplateSelection;
}

export interface ManualRecompositionDependencies {
  extractAccent: typeof extractAccentColor;
  composeCta: typeof compositeBanner;
  selectTemplate: typeof selectHeadlineTemplate;
  composeHeadline: typeof composeHeadlineWithQualityGate;
}

const DEFAULT_DEPENDENCIES: ManualRecompositionDependencies = {
  extractAccent: extractAccentColor,
  composeCta: compositeBanner,
  selectTemplate: selectHeadlineTemplate,
  composeHeadline: composeHeadlineWithQualityGate,
};

function uniqueTemplates(templates: BannerTemplate[]): BannerTemplate[] {
  return [...new Set(templates)];
}

/**
 * Rebuilds the complete Pin from the stored provider bitmap. This module has no
 * image-provider dependency by design: manual recomposition can never trigger AI.
 */
export async function recomposeExistingPin(
  input: ManualRecompositionInput,
  dependencies: ManualRecompositionDependencies = DEFAULT_DEPENDENCIES
): Promise<ManualRecompositionResult> {
  const allowedTemplates = uniqueTemplates(
    input.allowedTemplates?.length ? input.allowedTemplates : [...BANNER_TEMPLATES]
  );
  const colors = input.accentColor || (await dependencies.extractAccent(input.sourceImageBuffer));
  const imageWithCta = await dependencies.composeCta(
    input.sourceImageBuffer,
    input.ctaText,
    'bottom',
    colors.accentColor,
    colors.textColor,
    input.ctaTemplate || 'clean-band'
  );

  const autoSelection = await dependencies.selectTemplate({
    imageBuffer: imageWithCta,
    angle: input.angle,
    text: input.overlayText,
    accentColor: colors.accentColor,
    allowedTemplates,
  });
  const requestedTemplate =
    input.templateChoice === 'auto' ? autoSelection.template : input.templateChoice;
  const requestedPosition =
    input.positionChoice === 'auto' ? autoSelection.position : input.positionChoice;

  const qualityComposition = await dependencies.composeHeadline({
    imageBuffer: imageWithCta,
    text: input.overlayText,
    accentColor: colors.accentColor,
    textColor: colors.textColor,
    angle: input.angle,
    selectedTemplate: requestedTemplate,
    selectedPosition: requestedPosition,
    allowedTemplates: uniqueTemplates([requestedTemplate, ...allowedTemplates]),
  });

  return {
    imageBuffer: qualityComposition.buffer,
    template: qualityComposition.template,
    position: qualityComposition.position,
    quality: qualityComposition.quality,
    autoSelection,
  };
}

export function buildVersionState<T extends Pick<PinImage, 'id' | 'is_active'>>(
  existingVersions: T[],
  newVersion: T
): T[] {
  return [newVersion, ...existingVersions].map((version) => ({
    ...version,
    is_active: version.id === newVersion.id,
  }));
}
