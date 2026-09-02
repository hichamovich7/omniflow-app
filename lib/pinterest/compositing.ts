import sharp from 'sharp';
import type { AccentColorResult } from './color-extraction';

// Deterministic, code-side replacement for asking the image model to render
// on-image text (TASK-FIX-018/019/020). Measured real-world success rate
// asking flux.2-pro to do it in-prompt: 1/10 (7/10 missing entirely, 2/10
// corrupted or truncated text) — see docs/DECISIONS.md. This function
// guarantees identical placement and legible, correct text on every pin.

// Banner height is derived from the actual rendered text (TASK-FIX-023), not
// a fixed fraction of the image — a fixed-height band left disproportionate
// dead space above/below short CTA text and, at the top, pushed far enough
// down to clip into subjects (e.g. rabbit ears) that framing conventions
// otherwise keep clear of the extreme top edge.
const FONT_SIZE_RATIO = 0.038; // of image height — unchanged scale, already validated for legibility
const LINE_HEIGHT_RATIO = 1.1; // text's rendered vertical extent as a multiple of font size (ascenders/descenders)
const VERTICAL_PADDING_RATIO = 0.012; // of image height, added above AND below the text line to form the banner
const TOP_MARGIN_RATIO = 0.008; // gap between the top banner and the image's top edge — kept minimal by design
const BOTTOM_MARGIN_RATIO = 0.035; // gap between the CTA banner and the bottom edge — unchanged, already validated with no overlap
const BANNER_HORIZONTAL_PADDING_RATIO = 0.06; // of image width, each side
const MIN_FONT_SIZE = 18;

// Rough average glyph width for a bold sans-serif font, as a fraction of
// font-size — used only to pre-shrink text that would otherwise overflow the
// fixed-width banner, since SVG <text> does not wrap or auto-fit on its own.
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
 * Composites a fixed-position, fixed-style text banner onto an already-
 * generated pin image — used for both the top title hook and the bottom
 * "save this pin" CTA. Position, size, and font size are always derived the
 * same way from the image's real dimensions — never left to a model's
 * interpretation. Colors come from `extractAccentColor()` (one extraction per
 * image, reused for both banners); pass `accentColor: null` — its `NEUTRAL_RESULT`
 * shape — to force the original neutral dark style.
 */
export async function compositeBanner(
  imageBuffer: Buffer,
  text: string,
  position: BannerPosition,
  accentColor: AccentColorResult['accentColor'],
  textColor: AccentColorResult['textColor']
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

  // Banner height follows the final (possibly shrunk) font size — a tight
  // wrap around the actual text, not an independent fixed band.
  const verticalPadding = Math.round(height * VERTICAL_PADDING_RATIO);
  const bannerHeight = Math.round(fontSize * LINE_HEIGHT_RATIO) + verticalPadding * 2;

  const margin = Math.round(height * (position === 'bottom' ? BOTTOM_MARGIN_RATIO : TOP_MARGIN_RATIO));
  const bannerY = position === 'bottom' ? height - bannerHeight - margin : margin;

  const backgroundFill = accentColor
    ? `rgba(${accentColor.r},${accentColor.g},${accentColor.b},0.62)`
    : NEUTRAL_BACKGROUND;
  const textFill = accentColor ? textColor : NEUTRAL_TEXT;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${bannerY}" width="${width}" height="${bannerHeight}" fill="${backgroundFill}" />
      <text
        x="${width / 2}"
        y="${bannerY + bannerHeight / 2}"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="${textFill}"
      >${escapeXml(text)}</text>
    </svg>
  `;

  return image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
