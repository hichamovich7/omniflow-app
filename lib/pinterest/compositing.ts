import sharp from 'sharp';
import type { AccentColorResult } from './color-extraction';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import { getTemplateSource } from './banner-templates';
import { BannerCompositionError, prepareBannerText } from './text-layout';
import {
  LOCAL_CONTRAST_TARGET,
  planBannerPlacement,
  type BannerPlacementPlan,
  type CandidateTextZone,
  type LocalOverlayPlan,
  type SimpleSafeArea,
} from './local-contrast';

// Deterministic, code-side replacement for asking the image model to render
// on-image text (TASK-FIX-018/019/020). Measured real-world success rate
// asking flux.2-pro to do it in-prompt: 1/10 (7/10 missing entirely, 2/10
// corrupted or truncated text) — see docs/DECISIONS.md. This function
// guarantees identical placement and legible, correct text on every pin.

// Static SVG files still own shape geometry. text-layout.ts owns measured
// typography, while local-contrast.ts owns local pixel analysis, safe areas,
// candidate scoring, text color, and optional contrast reinforcement.

export type BannerPosition = 'top' | 'bottom';

export interface BannerCompositionDiagnostics {
  requestedPosition: BannerPosition;
  chosenZone: CandidateTextZone['position'];
  brightness: number;
  localContrast: number;
  localVariance: number;
  edgeDensity: number;
  visualComplexity: number;
  contrastRatio: number;
  overlayApplied: boolean;
  overlay: LocalOverlayPlan | null;
  textColor: CandidateTextZone['textColor'];
  fallbackUsed: 'clean-band:text-fit' | 'clean-band:contrast' | null;
  safeArea: SimpleSafeArea;
  bannerBounds: CandidateTextZone['boundingBox'];
  textBounds: CandidateTextZone['textBounds'];
  candidates: BannerPlacementPlan['candidates'];
}

export interface CompositedBanner {
  buffer: Buffer;
  diagnostics: BannerCompositionDiagnostics;
}

function createLocalOverlaySvg(
  bannerWidth: number,
  bannerHeight: number,
  bannerY: number,
  sampleBounds: CandidateTextZone['sampleBounds'],
  overlay: LocalOverlayPlan
): Buffer {
  const fill = overlay.tone === 'darken' ? '#000000' : '#FFFFFF';
  const localY = sampleBounds.y - bannerY;
  const radius = Math.max(8, Math.min(24, Math.round(sampleBounds.height * 0.18)));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bannerWidth}" height="${bannerHeight}">` +
      `<rect x="${sampleBounds.x}" y="${localY}" width="${sampleBounds.width}" ` +
      `height="${sampleBounds.height}" rx="${radius}" fill="${fill}" ` +
      `fill-opacity="${overlay.opacity}"/>` +
      `</svg>`
  );
}

/**
 * Composites a measured template banner onto an already-generated pin image.
 * Top and bottom positions map to distinct headline and CTA typography roles.
 * Compact templates fall back explicitly to clean-band if their measured
 * text cannot fit. Colors come from `extractAccentColor()`
 * (one extraction per image, reused for both banners); pass
 * `accentColor: null` — its `NEUTRAL_RESULT` shape — to force the original
 * neutral dark style.
 */
export async function compositeBannerWithDiagnostics(
  imageBuffer: Buffer,
  text: string,
  position: BannerPosition,
  accentColor: AccentColorResult['accentColor'],
  textColor: AccentColorResult['textColor'],
  template: BannerTemplate,
  preferredPosition?: CandidateTextZone['position']
): Promise<CompositedBanner> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new BannerCompositionError('Cannot compose a banner on an image without dimensions');
  }

  const width = metadata.width;
  const role = position === 'top' ? 'headline' : 'cta';

  let prepared = await prepareBannerText(text, template, role, width, textColor);
  let fallbackUsed: BannerCompositionDiagnostics['fallbackUsed'] = prepared.layout.fallbackReason
    ? 'clean-band:text-fit'
    : null;
  let plan = await planBannerPlacement(imageBuffer, prepared.layout, {
    role,
    accentColor,
    preferredPosition,
  });

  if (plan.fallbackRequired) {
    prepared = await prepareBannerText(text, 'clean-band', role, width, '#FFFFFF');
    plan = await planBannerPlacement(imageBuffer, prepared.layout, {
      role,
      accentColor: null,
      forceNeutralFallback: true,
      preferredPosition,
    });
    fallbackUsed = 'clean-band:contrast';
  }

  if (plan.fallbackRequired || plan.chosen.postOverlayContrastRatio < LOCAL_CONTRAST_TARGET) {
    throw new BannerCompositionError(
      `No safe ${role} composition reaches ${LOCAL_CONTRAST_TARGET}:1 local contrast`
    );
  }

  const finalTemplate = fallbackUsed === 'clean-band:contrast' ? 'clean-band' : template;
  const { layout, renderedLines } = await prepareBannerText(
    text,
    finalTemplate,
    role,
    width,
    plan.chosen.textColor
  );
  const backgroundFill = `rgba(${plan.background.r},${plan.background.g},${plan.background.b},${plan.background.opacity})`;

  const filledSvg = getTemplateSource(layout.template, role)
    .replace(/\{\{ACCENT_COLOR\}\}/g, backgroundFill)
    .replace(/\{\{TEXT_COLOR\}\}/g, plan.chosen.textColor)
    .replace(
      '<svg ',
      `<svg width="${layout.bannerWidth}" height="${layout.bannerHeight}" `
    );

  const bannerY = plan.chosen.boundingBox.y;
  const layers: sharp.OverlayOptions[] = [
    { input: Buffer.from(filledSvg), top: bannerY, left: 0 },
  ];
  if (plan.chosen.overlay) {
    layers.push({
      input: createLocalOverlaySvg(
        layout.bannerWidth,
        layout.bannerHeight,
        bannerY,
        plan.chosen.sampleBounds,
        plan.chosen.overlay
      ),
      top: bannerY,
      left: 0,
    });
  }
  layers.push(
    ...renderedLines.map((line) => ({
      input: line.input,
      top: bannerY + line.top,
      left: line.left,
    }))
  );

  const buffer = await image.composite(layers).png().toBuffer();
  return {
    buffer,
    diagnostics: {
      requestedPosition: position,
      chosenZone: plan.chosen.position,
      brightness: plan.chosen.brightness,
      localContrast: plan.chosen.localContrast,
      localVariance: plan.chosen.localVariance,
      edgeDensity: plan.chosen.edgeDensity,
      visualComplexity: plan.chosen.visualComplexity,
      contrastRatio: plan.chosen.postOverlayContrastRatio,
      overlayApplied: plan.chosen.overlayApplied,
      overlay: plan.chosen.overlay,
      textColor: plan.chosen.textColor,
      fallbackUsed,
      safeArea: plan.safeArea,
      bannerBounds: plan.chosen.boundingBox,
      textBounds: plan.chosen.textBounds,
      candidates: plan.candidates,
    },
  };
}

export async function compositeBanner(
  imageBuffer: Buffer,
  text: string,
  position: BannerPosition,
  accentColor: AccentColorResult['accentColor'],
  textColor: AccentColorResult['textColor'],
  template: BannerTemplate,
  preferredPosition?: CandidateTextZone['position']
): Promise<Buffer> {
  return (
    await compositeBannerWithDiagnostics(
      imageBuffer,
      text,
      position,
      accentColor,
      textColor,
      template,
      preferredPosition
    )
  ).buffer;
}
