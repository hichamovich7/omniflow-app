import sharp from 'sharp';
import type { AccentColorResult } from './color-extraction';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import { getTemplateSource, getTemplateAspectRatio } from './banner-templates';

// Deterministic, code-side replacement for asking the image model to render
// on-image text (TASK-FIX-018/019/020). Measured real-world success rate
// asking flux.2-pro to do it in-prompt: 1/10 (7/10 missing entirely, 2/10
// corrupted or truncated text) — see docs/DECISIONS.md. This function
// guarantees identical placement and legible, correct text on every pin.

// TASK-FIX-024: the banner's shape and its internal text layout are now
// entirely owned by a static SVG file per template (lib/pinterest/banner-
// templates/) — this module only fills in text/color/font-size tokens and
// places the rendered strip near the top or bottom edge. Banner height is
// therefore the template's own intrinsic aspect ratio at the actual image
// width, not derived from the rendered text as it was pre-TASK-FIX-024 —
// a template is expected to be designed with enough vertical room for its
// text at the font sizes this module produces.
const FONT_SIZE_RATIO = 0.038; // of image height — unchanged scale, already validated for legibility
const TOP_MARGIN_RATIO = 0.008; // gap between the top banner and the image's top edge — kept minimal by design
const BOTTOM_MARGIN_RATIO = 0.035; // gap between the CTA banner and the bottom edge — unchanged, already validated with no overlap
const BANNER_HORIZONTAL_PADDING_RATIO = 0.06; // of image width, each side
const MIN_FONT_SIZE = 18;

// Rough average glyph width for a bold sans-serif font, as a fraction of
// font-size — used only to pre-shrink text that would otherwise overflow the
// banner, since SVG <text> does not wrap or auto-fit on its own. Approximates
// against the full image width for every template, including narrower shapes
// (pill, corner-tag) — the FAST prompt steers the AI away from long text on
// those shapes instead of this module knowing each template's usable width.
const AVG_GLYPH_WIDTH_RATIO = 0.56;

const NEUTRAL_BACKGROUND = 'rgba(17,17,17,0.62)';
const NEUTRAL_TEXT = '#ffffff';

export type BannerPosition = 'top' | 'bottom';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Composites a static-SVG-template text banner onto an already-generated pin
 * image — used for both the top title hook and the bottom "save this pin"
 * CTA, each independently choosing its own `template`. Position and font size
 * are always derived the same way from the image's real dimensions — never
 * left to a model's interpretation. Colors come from `extractAccentColor()`
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
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1536;

  const horizontalPadding = Math.round(width * BANNER_HORIZONTAL_PADDING_RATIO);
  const maxTextWidth = width - horizontalPadding * 2;

  let fontSize = Math.round(height * FONT_SIZE_RATIO);
  const estimatedTextWidth = text.length * fontSize * AVG_GLYPH_WIDTH_RATIO;
  if (estimatedTextWidth > maxTextWidth) {
    fontSize = Math.max(MIN_FONT_SIZE, Math.round(fontSize * (maxTextWidth / estimatedTextWidth)));
  }

  const bannerHeight = Math.round(width * getTemplateAspectRatio(template));

  const backgroundFill = accentColor
    ? `rgba(${accentColor.r},${accentColor.g},${accentColor.b},0.62)`
    : NEUTRAL_BACKGROUND;
  const textFill = accentColor ? textColor : NEUTRAL_TEXT;

  const filledSvg = getTemplateSource(template)
    .replace(/\{\{TEXT\}\}/g, escapeXml(text))
    .replace(/\{\{ACCENT_COLOR\}\}/g, backgroundFill)
    .replace(/\{\{TEXT_COLOR\}\}/g, textFill)
    .replace(/\{\{FONT_SIZE\}\}/g, String(fontSize))
    .replace('<svg ', `<svg width="${width}" height="${bannerHeight}" `);

  const margin = Math.round(height * (position === 'bottom' ? BOTTOM_MARGIN_RATIO : TOP_MARGIN_RATIO));
  const bannerY = position === 'bottom' ? height - bannerHeight - margin : margin;

  return image
    .composite([{ input: Buffer.from(filledSvg), top: bannerY, left: 0 }])
    .png()
    .toBuffer();
}
