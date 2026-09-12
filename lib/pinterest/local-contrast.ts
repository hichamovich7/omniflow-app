import sharp from 'sharp';
import { getMaximumTemplateHeight } from './banner-templates';
import { contrastRatio, relativeLuminance, type AccentColorResult } from './color-extraction';
import type { BannerTextLayout, PixelRect } from './text-layout';

export const LOCAL_CONTRAST_TARGET = 4.5;
export const SAFE_HORIZONTAL_RATIO = 0.05;
export const SAFE_VERTICAL_RATIO = 0.04;

const BASE_BANNER_OPACITY = 0.62;
const FALLBACK_BANNER_OPACITY = 0.82;
const HEADLINE_CTA_GAP_RATIO = 0.02;
const REGION_GRID_X = 64;
const REGION_GRID_Y = 32;
const EDGE_THRESHOLD = 0.08;
const OVERLAY_OPACITIES = [0.12, 0.18, 0.24, 0.3, 0.36] as const;
const LIGHT_TEXT = '#FFFFFF' as const;
const DARK_TEXT = '#141414' as const;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface SampledRegion {
  rgb: Rgb[];
  luminances: number[];
  gridWidth: number;
  gridHeight: number;
}

export type CandidateZoneName = 'top' | 'bottom';
export type AdaptiveTextColor = typeof LIGHT_TEXT | typeof DARK_TEXT;
export type OverlayTone = 'darken' | 'lighten';

export interface SimpleSafeArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface LocalRegionMetrics {
  brightness: number;
  localContrast: number;
  localVariance: number;
  edgeDensity: number;
  visualComplexity: number;
}

export interface BannerBackgroundPlan extends Rgb {
  opacity: number;
}

export interface LocalOverlayPlan {
  tone: OverlayTone;
  opacity: number;
}

export interface CandidateTextZone extends LocalRegionMetrics {
  position: CandidateZoneName;
  boundingBox: PixelRect;
  sampleBounds: PixelRect;
  textBounds: PixelRect;
  textColor: AdaptiveTextColor;
  contrastRatio: number;
  postOverlayContrastRatio: number;
  overlay: LocalOverlayPlan | null;
  overlayApplied: boolean;
  textFitScore: number;
  safeAreaScore: number;
  calmAreaScore: number;
  finalScore: number;
}

export interface BannerPlacementPlan {
  chosen: CandidateTextZone;
  candidates: CandidateTextZone[];
  safeArea: SimpleSafeArea;
  background: BannerBackgroundPlan;
  fallbackRequired: boolean;
}

export interface BannerPlacementOptions {
  role: 'headline' | 'cta';
  accentColor: AccentColorResult['accentColor'];
  forceNeutralFallback?: boolean;
}

export function getSimpleSafeArea(width: number, height: number): SimpleSafeArea {
  return {
    left: Math.ceil(width * SAFE_HORIZONTAL_RATIO),
    right: Math.ceil(width * SAFE_HORIZONTAL_RATIO),
    top: Math.ceil(height * SAFE_VERTICAL_RATIO),
    bottom: Math.ceil(height * SAFE_VERTICAL_RATIO),
  };
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function blendChannel(background: number, foreground: number, opacity: number): number {
  return foreground * opacity + background * (1 - opacity);
}

function blendRgb(background: Rgb, foreground: Rgb, opacity: number): Rgb {
  return {
    r: blendChannel(background.r, foreground.r, opacity),
    g: blendChannel(background.g, foreground.g, opacity),
    b: blendChannel(background.b, foreground.b, opacity),
  };
}

function getBackgroundPlan(
  accentColor: AccentColorResult['accentColor'],
  forceNeutralFallback: boolean
): BannerBackgroundPlan {
  if (forceNeutralFallback || !accentColor) {
    return {
      r: 17,
      g: 17,
      b: 17,
      opacity: forceNeutralFallback ? FALLBACK_BANNER_OPACITY : BASE_BANNER_OPACITY,
    };
  }

  return { ...accentColor, opacity: BASE_BANNER_OPACITY };
}

function getCandidateBannerBounds(
  width: number,
  height: number,
  bannerHeight: number,
  role: 'headline' | 'cta',
  safeArea: SimpleSafeArea
): Array<{ position: CandidateZoneName; boundingBox: PixelRect }> {
  if (role === 'cta') {
    return [
      {
        position: 'bottom',
        boundingBox: {
          x: 0,
          y: height - safeArea.bottom - bannerHeight,
          width,
          height: bannerHeight,
        },
      },
    ];
  }

  const maximumCtaHeight = Math.round(width * (getMaximumTemplateHeight('cta') / 1024));
  const ctaGap = Math.ceil(height * HEADLINE_CTA_GAP_RATIO);

  return [
    {
      position: 'top',
      boundingBox: { x: 0, y: safeArea.top, width, height: bannerHeight },
    },
    {
      position: 'bottom',
      boundingBox: {
        x: 0,
        y: height - safeArea.bottom - maximumCtaHeight - ctaGap - bannerHeight,
        width,
        height: bannerHeight,
      },
    },
  ];
}

function translateRect(rect: PixelRect, offsetY: number): PixelRect {
  return { ...rect, y: rect.y + offsetY };
}

function intersectWithSafeArea(
  rect: PixelRect,
  width: number,
  height: number,
  safeArea: SimpleSafeArea
): PixelRect {
  const left = Math.max(rect.x, safeArea.left);
  const top = Math.max(rect.y, safeArea.top);
  const right = Math.min(rect.x + rect.width, width - safeArea.right);
  const bottom = Math.min(rect.y + rect.height, height - safeArea.bottom);

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  };
}

function rectIsInsideSafeArea(
  rect: PixelRect,
  width: number,
  height: number,
  safeArea: SimpleSafeArea
): boolean {
  return (
    rect.x >= safeArea.left &&
    rect.y >= safeArea.top &&
    rect.x + rect.width <= width - safeArea.right &&
    rect.y + rect.height <= height - safeArea.bottom
  );
}

function sampleRegion(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  bounds: PixelRect
): SampledRegion {
  const gridWidth = Math.max(1, Math.min(REGION_GRID_X, bounds.width));
  const gridHeight = Math.max(1, Math.min(REGION_GRID_Y, bounds.height));
  const rgb: Rgb[] = [];
  const luminances: number[] = [];

  for (let gridY = 0; gridY < gridHeight; gridY++) {
    const y = Math.min(
      height - 1,
      bounds.y + Math.floor(((gridY + 0.5) * bounds.height) / gridHeight)
    );
    for (let gridX = 0; gridX < gridWidth; gridX++) {
      const x = Math.min(
        width - 1,
        bounds.x + Math.floor(((gridX + 0.5) * bounds.width) / gridWidth)
      );
      const index = (y * width + x) * channels;
      const pixel = { r: data[index], g: data[index + 1], b: data[index + 2] };
      rgb.push(pixel);
      luminances.push(relativeLuminance(pixel.r, pixel.g, pixel.b));
    }
  }

  return { rgb, luminances, gridWidth, gridHeight };
}

function calculateRegionMetrics(sample: SampledRegion): LocalRegionMetrics {
  const brightness =
    sample.luminances.reduce((sum, luminance) => sum + luminance, 0) /
    sample.luminances.length;
  const localVariance =
    sample.luminances.reduce(
      (sum, luminance) => sum + (luminance - brightness) ** 2,
      0
    ) / sample.luminances.length;
  const low = percentile(sample.luminances, 0.1);
  const high = percentile(sample.luminances, 0.9);
  const localContrast = contrastRatio(low, high);

  let comparedEdges = 0;
  let strongEdges = 0;
  for (let y = 0; y < sample.gridHeight; y++) {
    for (let x = 0; x < sample.gridWidth; x++) {
      const index = y * sample.gridWidth + x;
      if (x > 0) {
        comparedEdges++;
        if (Math.abs(sample.luminances[index] - sample.luminances[index - 1]) >= EDGE_THRESHOLD) {
          strongEdges++;
        }
      }
      if (y > 0) {
        comparedEdges++;
        if (
          Math.abs(sample.luminances[index] - sample.luminances[index - sample.gridWidth]) >=
          EDGE_THRESHOLD
        ) {
          strongEdges++;
        }
      }
    }
  }

  const edgeDensity = comparedEdges === 0 ? 0 : strongEdges / comparedEdges;
  const varianceScore = clamp(localVariance / 0.08);
  const edgeScore = clamp(edgeDensity / 0.35);
  const visualComplexity = varianceScore * 0.55 + edgeScore * 0.45;

  return { brightness, localContrast, localVariance, edgeDensity, visualComplexity };
}

function robustTextContrast(
  sample: SampledRegion,
  background: BannerBackgroundPlan,
  textColor: AdaptiveTextColor,
  overlay: LocalOverlayPlan | null
): number {
  const textRgb = textColor === LIGHT_TEXT ? { r: 255, g: 255, b: 255 } : { r: 20, g: 20, b: 20 };
  const overlayRgb = overlay?.tone === 'lighten'
    ? { r: 255, g: 255, b: 255 }
    : { r: 0, g: 0, b: 0 };
  const ratios = sample.rgb.map((pixel) => {
    let effective = blendRgb(pixel, background, background.opacity);
    if (overlay) effective = blendRgb(effective, overlayRgb, overlay.opacity);
    return contrastRatio(
      relativeLuminance(effective.r, effective.g, effective.b),
      relativeLuminance(textRgb.r, textRgb.g, textRgb.b)
    );
  });

  // A 10th-percentile floor prevents a handful of isolated pixels from
  // forcing an overlay while still requiring 90% of the sampled text region
  // to meet the selected contrast ratio.
  return percentile(ratios, 0.1);
}

function chooseTextWithoutOverlay(
  sample: SampledRegion,
  background: BannerBackgroundPlan
): { textColor: AdaptiveTextColor; contrast: number } {
  const lightContrast = robustTextContrast(sample, background, LIGHT_TEXT, null);
  const darkContrast = robustTextContrast(sample, background, DARK_TEXT, null);
  return lightContrast >= darkContrast
    ? { textColor: LIGHT_TEXT, contrast: lightContrast }
    : { textColor: DARK_TEXT, contrast: darkContrast };
}

function chooseOverlay(
  sample: SampledRegion,
  background: BannerBackgroundPlan
): { textColor: AdaptiveTextColor; contrast: number; overlay: LocalOverlayPlan } {
  let best: {
    textColor: AdaptiveTextColor;
    contrast: number;
    overlay: LocalOverlayPlan;
  } | null = null;

  for (const opacity of OVERLAY_OPACITIES) {
    const options = [
      {
        textColor: LIGHT_TEXT,
        overlay: { tone: 'darken', opacity } as LocalOverlayPlan,
      },
      {
        textColor: DARK_TEXT,
        overlay: { tone: 'lighten', opacity } as LocalOverlayPlan,
      },
    ].map((option) => ({
      ...option,
      contrast: robustTextContrast(sample, background, option.textColor, option.overlay),
    }));
    options.sort((a, b) => b.contrast - a.contrast);
    const strongest = options[0];
    if (!best || strongest.contrast > best.contrast) best = strongest;
    if (strongest.contrast >= LOCAL_CONTRAST_TARGET) return strongest;
  }

  return best!;
}

function scoreCandidate(
  contrast: number,
  visualComplexity: number,
  textFitScore: number,
  safeAreaScore: number,
  preferred: boolean
): number {
  if (textFitScore === 0 || safeAreaScore === 0) return Number.NEGATIVE_INFINITY;
  const contrastScore = Math.min(contrast, LOCAL_CONTRAST_TARGET) / LOCAL_CONTRAST_TARGET;
  const calmAreaScore = 1 - visualComplexity;
  return (
    textFitScore * 1_000_000 +
    safeAreaScore * 100_000 +
    contrastScore * 10_000 +
    calmAreaScore * 100 +
    (preferred ? 1 : 0)
  );
}

function buildCandidate(
  sampled: SampledRegion,
  metrics: LocalRegionMetrics,
  background: BannerBackgroundPlan,
  position: CandidateZoneName,
  boundingBox: PixelRect,
  sampleBounds: PixelRect,
  textBounds: PixelRect,
  safeAreaScore: number,
  withOverlay: boolean,
  preferred: boolean
): CandidateTextZone {
  const withoutOverlay = chooseTextWithoutOverlay(sampled, background);
  const overlayChoice = withOverlay ? chooseOverlay(sampled, background) : null;
  const textColor = overlayChoice?.textColor ?? withoutOverlay.textColor;
  const postOverlayContrastRatio = overlayChoice?.contrast ?? withoutOverlay.contrast;
  const overlay = overlayChoice?.overlay ?? null;
  const textFitScore = 1;
  const calmAreaScore = 1 - metrics.visualComplexity;

  return {
    position,
    boundingBox,
    sampleBounds,
    textBounds,
    ...metrics,
    textColor,
    contrastRatio: withoutOverlay.contrast,
    postOverlayContrastRatio,
    overlay,
    overlayApplied: overlay !== null,
    textFitScore,
    safeAreaScore,
    calmAreaScore,
    finalScore: scoreCandidate(
      postOverlayContrastRatio,
      metrics.visualComplexity,
      textFitScore,
      safeAreaScore,
      preferred
    ),
  };
}

function chooseHighestScore(candidates: CandidateTextZone[]): CandidateTextZone {
  return [...candidates].sort((a, b) => b.finalScore - a.finalScore)[0];
}

export async function planBannerPlacement(
  imageBuffer: Buffer,
  layout: BannerTextLayout,
  options: BannerPlacementOptions
): Promise<BannerPlacementPlan> {
  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const safeArea = getSimpleSafeArea(width, height);
  const background = getBackgroundPlan(
    options.accentColor,
    options.forceNeutralFallback ?? false
  );
  const candidateBounds = getCandidateBannerBounds(
    width,
    height,
    layout.bannerHeight,
    options.role,
    safeArea
  );

  const sources = candidateBounds.map(({ position, boundingBox }) => {
    const globalInnerArea = translateRect(layout.innerTextArea, boundingBox.y);
    const textBounds = translateRect(layout.textBounds, boundingBox.y);
    const sampleBounds = intersectWithSafeArea(globalInnerArea, width, height, safeArea);
    const sampled = sampleRegion(data, width, height, channels, sampleBounds);
    const metrics = calculateRegionMetrics(sampled);
    const safeAreaScore = rectIsInsideSafeArea(textBounds, width, height, safeArea) ? 1 : 0;
    return { position, boundingBox, textBounds, sampleBounds, sampled, metrics, safeAreaScore };
  });

  const withoutOverlay = sources.map((source) =>
    buildCandidate(
      source.sampled,
      source.metrics,
      background,
      source.position,
      source.boundingBox,
      source.sampleBounds,
      source.textBounds,
      source.safeAreaScore,
      false,
      source.position === (options.role === 'headline' ? 'top' : 'bottom')
    )
  );
  const readableWithoutOverlay = withoutOverlay.filter(
    (candidate) => candidate.postOverlayContrastRatio >= LOCAL_CONTRAST_TARGET
  );
  if (readableWithoutOverlay.length > 0) {
    return {
      chosen: chooseHighestScore(readableWithoutOverlay),
      candidates: withoutOverlay,
      safeArea,
      background,
      fallbackRequired: false,
    };
  }

  const withOverlay = sources.map((source) =>
    buildCandidate(
      source.sampled,
      source.metrics,
      background,
      source.position,
      source.boundingBox,
      source.sampleBounds,
      source.textBounds,
      source.safeAreaScore,
      true,
      source.position === (options.role === 'headline' ? 'top' : 'bottom')
    )
  );
  const readableWithOverlay = withOverlay.filter(
    (candidate) => candidate.postOverlayContrastRatio >= LOCAL_CONTRAST_TARGET
  );
  const candidates = readableWithOverlay.length > 0 ? readableWithOverlay : withOverlay;

  return {
    chosen: chooseHighestScore(candidates),
    candidates: withOverlay,
    safeArea,
    background,
    fallbackRequired: readableWithOverlay.length === 0,
  };
}
