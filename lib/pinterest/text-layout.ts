import sharp from 'sharp';
import path from 'node:path';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import {
  TEMPLATE_REFERENCE_WIDTH,
  getTemplateSpec,
  type TextAlignment,
  type TypographyRole,
} from './banner-templates';

const FONT_FAMILY = 'Inter';
const MEASUREMENT_FONT_SIZE = 100;
const FALLBACK_TEMPLATE: BannerTemplate = 'clean-band';

// Versioned TTF files are used by Sharp/Pango for both measurement and final
// rasterization. next.config.ts includes these assets in server output tracing.
export const RENDERER_FONT_PATHS = {
  600: path.join(
    process.cwd(),
    'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'
  ),
  700: path.join(
    process.cwd(),
    'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'
  ),
} as const;

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BannerTextLayout {
  requestedTemplate: BannerTemplate;
  template: BannerTemplate;
  role: TypographyRole;
  lines: string[];
  fontSize: number;
  minFontSize: number;
  maxLines: number;
  lineHeight: number;
  align: TextAlignment;
  bannerWidth: number;
  bannerHeight: number;
  textArea: PixelRect;
  innerTextArea: PixelRect;
  textBounds: PixelRect;
  fallbackReason: string | null;
}

export interface RenderedLine {
  input: Buffer;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PreparedBannerText {
  layout: BannerTextLayout;
  renderedLines: RenderedLine[];
}

export class BannerCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BannerCompositionError';
  }
}

function escapeMarkup(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function scaleRect(rect: PixelRect, scale: number): PixelRect {
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
  };
}

function getAlignedLeft(area: PixelRect, width: number, align: TextAlignment): number {
  if (align === 'left') return area.x;
  if (align === 'right') return area.x + area.width - width;
  return area.x + Math.round((area.width - width) / 2);
}

function getFontPath(fontWeight: number): string {
  return fontWeight >= 700 ? RENDERER_FONT_PATHS[700] : RENDERER_FONT_PATHS[600];
}

async function rasterizeLine(
  text: string,
  fontSize: number,
  fontWeight: number,
  color: string
): Promise<{ input: Buffer; width: number; height: number }> {
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${color}" weight="${fontWeight}">${escapeMarkup(text)}</span>`,
      font: `${FONT_FAMILY} ${fontSize}`,
      fontfile: getFontPath(fontWeight),
      dpi: 72,
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });

  return { input: data, width: info.width, height: info.height };
}

const referenceMeasurementCache = new Map<string, Promise<number>>();

async function measureAtReferenceSize(text: string, fontWeight: number): Promise<number> {
  const key = `${fontWeight}:${text}`;
  const cached = referenceMeasurementCache.get(key);
  if (cached) return cached;

  const measurement = rasterizeLine(text, MEASUREMENT_FONT_SIZE, fontWeight, '#ffffff')
    .then(({ width }) => width);
  referenceMeasurementCache.set(key, measurement);
  return measurement;
}

async function measureWords(
  words: string[],
  fontWeight: number
): Promise<{ wordWidths: number[]; spaceWidth: number }> {
  const [spaceSample, letterSample, ...wordWidths] = await Promise.all([
    measureAtReferenceSize('a a', fontWeight),
    measureAtReferenceSize('a', fontWeight),
    ...words.map((word) => measureAtReferenceSize(word, fontWeight)),
  ]);

  return {
    wordWidths,
    spaceWidth: Math.max(1, spaceSample - letterSample * 2),
  };
}

function lineWidth(
  wordWidths: number[],
  spaceWidth: number,
  start: number,
  end: number,
  scale: number
): number {
  let width = 0;
  for (let index = start; index < end; index++) {
    width += wordWidths[index];
    if (index > start) width += spaceWidth;
  }
  return width * scale;
}

function chooseBalancedLines(
  words: string[],
  wordWidths: number[],
  spaceWidth: number,
  maxWidth: number,
  maxLines: number,
  fontScale: number
): string[] | null {
  for (let lineCount = 1; lineCount <= Math.min(maxLines, words.length); lineCount++) {
    const candidates: Array<{ lines: string[]; score: number }> = [];

    const visit = (starts: number[], nextStart: number) => {
      if (starts.length === lineCount) {
        const ranges = starts.map((start, index) => ({
          start,
          end: index + 1 < starts.length ? starts[index + 1] : words.length,
        }));
        const widths = ranges.map((range) =>
          lineWidth(wordWidths, spaceWidth, range.start, range.end, fontScale)
        );
        if (widths.some((width) => width > maxWidth)) return;

        const target = widths.reduce((sum, width) => sum + width, 0) / widths.length;
        const raggedness = widths.reduce((sum, width) => sum + (width - target) ** 2, 0);
        const lastLineRatio = widths[widths.length - 1] / maxWidth;
        const orphanPenalty = lineCount > 1 && lastLineRatio < 0.32 ? maxWidth ** 2 : 0;
        const candidate = {
          lines: ranges.map(({ start, end }) => words.slice(start, end).join(' ')),
          score: raggedness + orphanPenalty,
        };

        candidates.push(candidate);
        return;
      }

      const linesRemaining = lineCount - starts.length;
      const maximumStart = words.length - linesRemaining;
      for (let start = nextStart; start <= maximumStart; start++) {
        visit([...starts, start], start + 1);
      }
    };

    visit([0], 1);
    candidates.sort((a, b) => a.score - b.score);
    if (candidates[0]) return candidates[0].lines;
  }

  return null;
}

async function prepareForTemplate(
  text: string,
  requestedTemplate: BannerTemplate,
  template: BannerTemplate,
  role: TypographyRole,
  bannerWidth: number,
  textColor: string,
  fallbackReason: string | null
): Promise<PreparedBannerText> {
  const normalizedText = text.trim().replace(/\s+/g, ' ');
  if (!normalizedText) throw new BannerCompositionError(`Cannot compose an empty ${role}`);

  const spec = getTemplateSpec(template, role);
  const roleSpec = spec.textArea.typography[role];
  const scale = bannerWidth / TEMPLATE_REFERENCE_WIDTH;
  const bannerHeight = Math.round(spec.height * scale);
  const textArea = scaleRect(spec.textArea, scale);
  const paddingX = Math.round(spec.textArea.paddingX * scale);
  const paddingY = Math.round(spec.textArea.paddingY * scale);
  const innerTextArea: PixelRect = {
    x: textArea.x + paddingX,
    y: textArea.y + paddingY,
    width: textArea.width - paddingX * 2,
    height: textArea.height - paddingY * 2,
  };

  const minFontSize = Math.max(1, Math.round(roleSpec.minFontSize * scale));
  const maxFontSize = Math.max(minFontSize, Math.round(roleSpec.maxFontSize * scale));
  const words = normalizedText.split(' ');
  const { wordWidths, spaceWidth } = await measureWords(words, roleSpec.fontWeight);

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize--) {
    const lines = chooseBalancedLines(
      words,
      wordWidths,
      spaceWidth,
      innerTextArea.width,
      roleSpec.maxLines,
      fontSize / MEASUREMENT_FONT_SIZE
    );
    if (!lines) continue;

    const rasterizedLines = await Promise.all(
      lines.map((line) => rasterizeLine(line, fontSize, roleSpec.fontWeight, textColor))
    );
    if (rasterizedLines.some((line) => line.width > innerTextArea.width)) continue;

    const lineGap = Math.max(0, Math.round(fontSize * (roleSpec.lineHeight - 1)));
    const textHeight =
      rasterizedLines.reduce((sum, line) => sum + line.height, 0) +
      lineGap * Math.max(0, rasterizedLines.length - 1);
    if (textHeight > innerTextArea.height) continue;

    let currentTop = innerTextArea.y + Math.round((innerTextArea.height - textHeight) / 2);
    const renderedLines = rasterizedLines.map((line): RenderedLine => {
      const rendered = {
        input: line.input,
        left: getAlignedLeft(innerTextArea, line.width, spec.textArea.align),
        top: currentTop,
        width: line.width,
        height: line.height,
      };
      currentTop += line.height + lineGap;
      return rendered;
    });

    const left = Math.min(...renderedLines.map((line) => line.left));
    const top = Math.min(...renderedLines.map((line) => line.top));
    const right = Math.max(...renderedLines.map((line) => line.left + line.width));
    const bottom = Math.max(...renderedLines.map((line) => line.top + line.height));
    const textBounds = { x: left, y: top, width: right - left, height: bottom - top };
    const withinTextArea =
      left >= innerTextArea.x &&
      top >= innerTextArea.y &&
      right <= innerTextArea.x + innerTextArea.width &&
      bottom <= innerTextArea.y + innerTextArea.height;
    const withinCanvas = left >= 0 && top >= 0 && right <= bannerWidth && bottom <= bannerHeight;
    if (!withinTextArea || !withinCanvas) continue;

    return {
      layout: {
        requestedTemplate,
        template,
        role,
        lines,
        fontSize,
        minFontSize,
        maxLines: roleSpec.maxLines,
        lineHeight: roleSpec.lineHeight,
        align: spec.textArea.align,
        bannerWidth,
        bannerHeight,
        textArea,
        innerTextArea,
        textBounds,
        fallbackReason,
      },
      renderedLines,
    };
  }

  throw new BannerCompositionError(
    `${role} does not fit template "${template}" within ${roleSpec.maxLines} line(s) at the minimum font size`
  );
}

export async function prepareBannerText(
  text: string,
  template: BannerTemplate,
  role: TypographyRole,
  bannerWidth: number,
  textColor: string
): Promise<PreparedBannerText> {
  try {
    return await prepareForTemplate(text, template, template, role, bannerWidth, textColor, null);
  } catch (error) {
    if (template === FALLBACK_TEMPLATE || !(error instanceof BannerCompositionError)) throw error;

    return prepareForTemplate(
      text,
      template,
      FALLBACK_TEMPLATE,
      role,
      bannerWidth,
      textColor,
      error.message
    );
  }
}

/** Returns the exact measured layout used by the renderer, without creating a Pin image. */
export async function layoutBannerText(
  text: string,
  template: BannerTemplate,
  role: TypographyRole,
  bannerWidth: number
): Promise<BannerTextLayout> {
  return (await prepareBannerText(text, template, role, bannerWidth, '#ffffff')).layout;
}
