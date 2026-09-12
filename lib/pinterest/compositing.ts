import sharp from 'sharp';
import type { AccentColorResult } from './color-extraction';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import { getTemplateSource } from './banner-templates';
import { BannerCompositionError, prepareBannerText } from './text-layout';

// Deterministic, code-side replacement for asking the image model to render
// on-image text (TASK-FIX-018/019/020). Measured real-world success rate
// asking flux.2-pro to do it in-prompt: 1/10 (7/10 missing entirely, 2/10
// corrupted or truncated text) — see docs/DECISIONS.md. This function
// guarantees identical placement and legible, correct text on every pin.

// Static SVG files still own the shape geometry. Template-specific text areas
// and typography roles live in banner-templates/index.ts, while text-layout.ts
// measures and rasterizes the controlled font before this module composites
// shape and text in one image-pixel coordinate system.
const TOP_MARGIN_RATIO = 0.008; // gap between the top banner and the image's top edge — kept minimal by design
const BOTTOM_MARGIN_RATIO = 0.035; // gap between the CTA banner and the bottom edge — unchanged, already validated with no overlap

const NEUTRAL_BACKGROUND = 'rgba(17,17,17,0.62)';
const NEUTRAL_TEXT = '#ffffff';

export type BannerPosition = 'top' | 'bottom';

/**
 * Composites a measured template banner onto an already-generated pin image.
 * Top and bottom positions map to distinct headline and CTA typography roles.
 * Compact templates fall back explicitly to clean-band if their measured
 * text cannot fit. Colors come from `extractAccentColor()`
 * (one extraction per image, reused for both banners); pass
 * `accentColor: null` — its `NEUTRAL_RESULT` shape — to force the original
 * neutral dark style.
 */
export async function compositeBanner(
  imageBuffer: Buffer,
  text: string,
  position: BannerPosition,
  accentColor: AccentColorResult['accentColor'],
  textColor: AccentColorResult['textColor'],
  template: BannerTemplate
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new BannerCompositionError('Cannot compose a banner on an image without dimensions');
  }

  const width = metadata.width;
  const height = metadata.height;
  const role = position === 'top' ? 'headline' : 'cta';

  const backgroundFill = accentColor
    ? `rgba(${accentColor.r},${accentColor.g},${accentColor.b},0.62)`
    : NEUTRAL_BACKGROUND;
  const textFill = accentColor ? textColor : NEUTRAL_TEXT;
  const { layout, renderedLines } = await prepareBannerText(
    text,
    template,
    role,
    width,
    textFill
  );

  const filledSvg = getTemplateSource(layout.template)
    .replace(/\{\{ACCENT_COLOR\}\}/g, backgroundFill)
    .replace(
      '<svg ',
      `<svg width="${layout.bannerWidth}" height="${layout.bannerHeight}" `
    );

  const margin = Math.round(height * (position === 'bottom' ? BOTTOM_MARGIN_RATIO : TOP_MARGIN_RATIO));
  const bannerY = position === 'bottom' ? height - layout.bannerHeight - margin : margin;
  if (bannerY < 0 || bannerY + layout.bannerHeight > height) {
    throw new BannerCompositionError('Banner would render outside the image canvas');
  }

  return image
    .composite([
      { input: Buffer.from(filledSvg), top: bannerY, left: 0 },
      ...renderedLines.map((line) => ({
        input: line.input,
        top: bannerY + line.top,
        left: line.left,
      })),
    ])
    .png()
    .toBuffer();
}
