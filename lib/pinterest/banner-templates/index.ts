import { readFileSync } from 'fs';
import path from 'path';
import type { BannerTemplate } from '@/lib/validations/pinterest';

// Every template SVG is authored on a fixed 1024-wide reference canvas with
// its own intrinsic shape geometry. Its text area is declared below in the
// same coordinate space, then both are scaled once to the actual image width.
export const TEMPLATE_REFERENCE_WIDTH = 1024;

export type TextAlignment = 'left' | 'center' | 'right';
export type TypographyRole = 'headline' | 'cta';

export interface TypographySpec {
  minFontSize: number;
  maxFontSize: number;
  fontWeight: number;
  maxLines: number;
  lineHeight: number;
}

export interface TemplateTextArea {
  x: number;
  y: number;
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
  align: TextAlignment;
  typography: Record<TypographyRole, TypographySpec>;
}

export interface BannerTemplateSpec {
  width: number;
  height: number;
  textArea: TemplateTextArea;
}

const TEMPLATE_DIR = path.join(process.cwd(), 'lib/pinterest/banner-templates');

// Read eagerly with literal filenames (not a dynamic template-name lookup) so
// Next.js's build-time file tracing (@vercel/nft) can see and bundle each
// file for serverless deployment — a runtime `readFileSync(...${template}.svg)`
// would not be statically analyzable.
const TEMPLATE_SOURCES: Record<BannerTemplate, string> = {
  'clean-band': readFileSync(path.join(TEMPLATE_DIR, 'clean-band.svg'), 'utf-8'),
  ribbon: readFileSync(path.join(TEMPLATE_DIR, 'ribbon.svg'), 'utf-8'),
  pill: readFileSync(path.join(TEMPLATE_DIR, 'pill.svg'), 'utf-8'),
  'torn-paper': readFileSync(path.join(TEMPLATE_DIR, 'torn-paper.svg'), 'utf-8'),
  'corner-tag': readFileSync(path.join(TEMPLATE_DIR, 'corner-tag.svg'), 'utf-8'),
};

// All coordinates are authored in the same 1024-wide reference space as the
// SVG shapes. The renderer scales both geometry and typography once, from
// this reference space to the actual output width. Padding belongs to the
// text area rather than to the whole image, which is essential for compact
// shapes such as pill and corner-tag.
export const BANNER_TEMPLATE_SPECS: Record<BannerTemplate, BannerTemplateSpec> = {
  'clean-band': {
    width: 1024,
    height: 140,
    textArea: {
      x: 32,
      y: 8,
      width: 960,
      height: 124,
      paddingX: 24,
      paddingY: 10,
      align: 'center',
      typography: {
        headline: { minFontSize: 30, maxFontSize: 54, fontWeight: 700, maxLines: 3, lineHeight: 1.04 },
        cta: { minFontSize: 22, maxFontSize: 32, fontWeight: 600, maxLines: 1, lineHeight: 1 },
      },
    },
  },
  ribbon: {
    width: 1024,
    height: 150,
    textArea: {
      x: 40,
      y: 20,
      width: 944,
      height: 110,
      paddingX: 32,
      paddingY: 10,
      align: 'center',
      typography: {
        headline: { minFontSize: 30, maxFontSize: 50, fontWeight: 700, maxLines: 2, lineHeight: 1.05 },
        cta: { minFontSize: 22, maxFontSize: 30, fontWeight: 600, maxLines: 1, lineHeight: 1 },
      },
    },
  },
  pill: {
    width: 1024,
    height: 120,
    textArea: {
      x: 212,
      y: 10,
      width: 600,
      height: 100,
      paddingX: 34,
      paddingY: 16,
      align: 'center',
      typography: {
        headline: { minFontSize: 28, maxFontSize: 40, fontWeight: 700, maxLines: 2, lineHeight: 1.02 },
        cta: { minFontSize: 20, maxFontSize: 28, fontWeight: 600, maxLines: 1, lineHeight: 1 },
      },
    },
  },
  'torn-paper': {
    width: 1024,
    height: 160,
    textArea: {
      x: 32,
      y: 4,
      width: 960,
      height: 124,
      paddingX: 28,
      paddingY: 10,
      align: 'center',
      typography: {
        headline: { minFontSize: 30, maxFontSize: 50, fontWeight: 700, maxLines: 2, lineHeight: 1.05 },
        cta: { minFontSize: 22, maxFontSize: 30, fontWeight: 600, maxLines: 1, lineHeight: 1 },
      },
    },
  },
  'corner-tag': {
    width: 1024,
    height: 150,
    textArea: {
      x: 16,
      y: 15,
      width: 344,
      height: 120,
      paddingX: 20,
      paddingY: 12,
      align: 'left',
      typography: {
        headline: { minFontSize: 26, maxFontSize: 36, fontWeight: 700, maxLines: 2, lineHeight: 1.04 },
        cta: { minFontSize: 20, maxFontSize: 25, fontWeight: 600, maxLines: 1, lineHeight: 1 },
      },
    },
  },
};

// Short, plain-language descriptions injected into the FAST role's prompt
// (lib/prompts/pinterest-pins.ts) so the AI picks a shape by context instead
// of guessing from the enum name alone.
export const BANNER_TEMPLATE_DESCRIPTIONS: Record<BannerTemplate, string> = {
  'clean-band': 'a plain solid full-width horizontal band — neutral, works for any subject',
  ribbon: 'a horizontal ribbon banner with pointed folded ends — festive, promotional feel',
  pill: 'a small centered rounded pill, narrower than the full width — best for very short text (2-4 words), overflows badly with longer text',
  'torn-paper': 'a full-width band with a hand-torn paper edge — rustic, craft, DIY feel',
  'corner-tag': 'a compact flag-shaped tag anchored to the left side, not full width — good for a short label rather than a full sentence',
};

export function getTemplateSource(template: BannerTemplate): string {
  return TEMPLATE_SOURCES[template];
}

export function getTemplateSpec(template: BannerTemplate): BannerTemplateSpec {
  return BANNER_TEMPLATE_SPECS[template];
}

const VIEW_BOX_HEIGHT_RE = /viewBox="0 0 1024 (\d+(?:\.\d+)?)"/;

// Every template's intrinsic aspect ratio, read from its own viewBox — the
// value that lets compositing.ts derive the rendered banner's pixel height
// from the actual image width, without hardcoding per-template geometry.
export function getTemplateAspectRatio(template: BannerTemplate): number {
  const source = TEMPLATE_SOURCES[template];
  const match = source.match(VIEW_BOX_HEIGHT_RE);
  if (!match) {
    throw new Error(`Banner template "${template}" is missing a "viewBox=\"0 0 1024 H\"" declaration`);
  }
  return Number(match[1]) / TEMPLATE_REFERENCE_WIDTH;
}
