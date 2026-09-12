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

export type BannerTemplateFamilySpec = Record<TypographyRole, BannerTemplateSpec>;

const TEMPLATE_DIR = path.join(process.cwd(), 'lib/pinterest/banner-templates');

// Read eagerly with literal filenames (not a dynamic template-name lookup) so
// Next.js's build-time file tracing (@vercel/nft) can see and bundle each
// file for serverless deployment — a runtime `readFileSync(...${template}.svg)`
// would not be statically analyzable.
const cleanBandSource = readFileSync(path.join(TEMPLATE_DIR, 'clean-band.svg'), 'utf-8');
const ribbonSource = readFileSync(path.join(TEMPLATE_DIR, 'ribbon.svg'), 'utf-8');
const pillSource = readFileSync(path.join(TEMPLATE_DIR, 'pill.svg'), 'utf-8');
const tornPaperSource = readFileSync(path.join(TEMPLATE_DIR, 'torn-paper.svg'), 'utf-8');
const cornerTagSource = readFileSync(path.join(TEMPLATE_DIR, 'corner-tag.svg'), 'utf-8');

const TEMPLATE_SOURCES: Record<BannerTemplate, Record<TypographyRole, string>> = {
  'clean-band': { headline: cleanBandSource, cta: cleanBandSource },
  ribbon: { headline: ribbonSource, cta: ribbonSource },
  pill: { headline: pillSource, cta: pillSource },
  'torn-paper': { headline: tornPaperSource, cta: tornPaperSource },
  'corner-tag': { headline: cornerTagSource, cta: cornerTagSource },
  editorial: {
    headline: readFileSync(path.join(TEMPLATE_DIR, 'editorial-headline.svg'), 'utf-8'),
    cta: readFileSync(path.join(TEMPLATE_DIR, 'editorial-cta.svg'), 'utf-8'),
  },
  minimal: {
    headline: readFileSync(path.join(TEMPLATE_DIR, 'minimal-headline.svg'), 'utf-8'),
    cta: readFileSync(path.join(TEMPLATE_DIR, 'minimal-cta.svg'), 'utf-8'),
  },
  split: {
    headline: readFileSync(path.join(TEMPLATE_DIR, 'split-headline.svg'), 'utf-8'),
    cta: readFileSync(path.join(TEMPLATE_DIR, 'split-cta.svg'), 'utf-8'),
  },
  magazine: {
    headline: readFileSync(path.join(TEMPLATE_DIR, 'magazine-headline.svg'), 'utf-8'),
    cta: readFileSync(path.join(TEMPLATE_DIR, 'magazine-cta.svg'), 'utf-8'),
  },
};

// All coordinates are authored in the same 1024-wide reference space as the
// SVG shapes. The renderer scales both geometry and typography once, from
// this reference space to the actual output width. Padding belongs to the
// text area rather than to the whole image, which is essential for compact
// shapes such as pill and corner-tag.
type LegacyBannerTemplate = 'clean-band' | 'ribbon' | 'pill' | 'torn-paper' | 'corner-tag';

const LEGACY_TEMPLATE_SPECS: Record<LegacyBannerTemplate, BannerTemplateSpec> = {
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
      x: 32,
      y: 15,
      width: 328,
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

const legacyFamily = (spec: BannerTemplateSpec): BannerTemplateFamilySpec => ({
  headline: spec,
  cta: spec,
});

export const BANNER_TEMPLATE_SPECS: Record<BannerTemplate, BannerTemplateFamilySpec> = {
  'clean-band': legacyFamily(LEGACY_TEMPLATE_SPECS['clean-band']),
  ribbon: legacyFamily(LEGACY_TEMPLATE_SPECS.ribbon),
  pill: legacyFamily(LEGACY_TEMPLATE_SPECS.pill),
  'torn-paper': legacyFamily(LEGACY_TEMPLATE_SPECS['torn-paper']),
  'corner-tag': legacyFamily(LEGACY_TEMPLATE_SPECS['corner-tag']),
  editorial: {
    headline: {
      width: 1024,
      height: 248,
      textArea: {
        x: 52,
        y: 36,
        width: 920,
        height: 176,
        paddingX: 28,
        paddingY: 18,
        align: 'left',
        typography: {
          headline: { minFontSize: 34, maxFontSize: 62, fontWeight: 700, maxLines: 3, lineHeight: 1.04 },
          cta: { minFontSize: 22, maxFontSize: 30, fontWeight: 600, maxLines: 1, lineHeight: 1 },
        },
      },
    },
    cta: {
      width: 1024,
      height: 112,
      textArea: {
        x: 144,
        y: 16,
        width: 736,
        height: 80,
        paddingX: 32,
        paddingY: 18,
        align: 'center',
        typography: {
          headline: { minFontSize: 30, maxFontSize: 46, fontWeight: 700, maxLines: 2, lineHeight: 1.04 },
          cta: { minFontSize: 22, maxFontSize: 30, fontWeight: 600, maxLines: 1, lineHeight: 1 },
        },
      },
    },
  },
  minimal: {
    headline: {
      width: 1024,
      height: 170,
      textArea: {
        x: 96,
        y: 28,
        width: 832,
        height: 114,
        paddingX: 28,
        paddingY: 18,
        align: 'center',
        typography: {
          headline: { minFontSize: 32, maxFontSize: 54, fontWeight: 600, maxLines: 2, lineHeight: 1.06 },
          cta: { minFontSize: 21, maxFontSize: 28, fontWeight: 600, maxLines: 1, lineHeight: 1 },
        },
      },
    },
    cta: {
      width: 1024,
      height: 92,
      textArea: {
        x: 252,
        y: 12,
        width: 520,
        height: 68,
        paddingX: 30,
        paddingY: 16,
        align: 'center',
        typography: {
          headline: { minFontSize: 28, maxFontSize: 38, fontWeight: 600, maxLines: 2, lineHeight: 1.04 },
          cta: { minFontSize: 20, maxFontSize: 27, fontWeight: 600, maxLines: 1, lineHeight: 1 },
        },
      },
    },
  },
  split: {
    headline: {
      width: 1024,
      height: 300,
      textArea: {
        x: 52,
        y: 24,
        width: 640,
        height: 252,
        paddingX: 32,
        paddingY: 26,
        align: 'left',
        typography: {
          headline: { minFontSize: 32, maxFontSize: 58, fontWeight: 700, maxLines: 3, lineHeight: 1.05 },
          cta: { minFontSize: 21, maxFontSize: 28, fontWeight: 600, maxLines: 1, lineHeight: 1 },
        },
      },
    },
    cta: {
      width: 1024,
      height: 110,
      textArea: {
        x: 404,
        y: 14,
        width: 568,
        height: 82,
        paddingX: 32,
        paddingY: 20,
        align: 'right',
        typography: {
          headline: { minFontSize: 28, maxFontSize: 42, fontWeight: 700, maxLines: 2, lineHeight: 1.04 },
          cta: { minFontSize: 20, maxFontSize: 28, fontWeight: 600, maxLines: 1, lineHeight: 1 },
        },
      },
    },
  },
  magazine: {
    headline: {
      width: 1024,
      height: 260,
      textArea: {
        x: 78,
        y: 40,
        width: 868,
        height: 180,
        paddingX: 24,
        paddingY: 20,
        align: 'left',
        typography: {
          headline: { minFontSize: 34, maxFontSize: 64, fontWeight: 700, maxLines: 3, lineHeight: 1.02 },
          cta: { minFontSize: 22, maxFontSize: 30, fontWeight: 600, maxLines: 1, lineHeight: 1 },
        },
      },
    },
    cta: {
      width: 1024,
      height: 104,
      textArea: {
        x: 184,
        y: 10,
        width: 656,
        height: 84,
        paddingX: 32,
        paddingY: 20,
        align: 'center',
        typography: {
          headline: { minFontSize: 28, maxFontSize: 44, fontWeight: 700, maxLines: 2, lineHeight: 1.04 },
          cta: { minFontSize: 21, maxFontSize: 29, fontWeight: 600, maxLines: 1, lineHeight: 1 },
        },
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
  editorial: 'a premium editorial frame with confident left-aligned hierarchy for headlines and a restrained framed CTA',
  minimal: 'a quiet centered composition with generous whitespace and fine rules — best for concise, elegant copy',
  split: 'an asymmetric side panel that keeps more of the photo visible — useful when the center or opposite side carries the subject',
  magazine: 'an inset cover-style card with a refined keyline and strong typographic hierarchy — premium and content-led',
};

export function getTemplateSource(
  template: BannerTemplate,
  role: TypographyRole = 'headline'
): string {
  return TEMPLATE_SOURCES[template][role];
}

export function getTemplateSpec(
  template: BannerTemplate,
  role: TypographyRole = 'headline'
): BannerTemplateSpec {
  return BANNER_TEMPLATE_SPECS[template][role];
}

export function getMaximumTemplateHeight(role: TypographyRole): number {
  return Math.max(...Object.values(BANNER_TEMPLATE_SPECS).map((family) => family[role].height));
}

const VIEW_BOX_HEIGHT_RE = /viewBox="0 0 1024 (\d+(?:\.\d+)?)"/;

// Every template's intrinsic aspect ratio, read from its own viewBox — the
// value that lets compositing.ts derive the rendered banner's pixel height
// from the actual image width, without hardcoding per-template geometry.
export function getTemplateAspectRatio(
  template: BannerTemplate,
  role: TypographyRole = 'headline'
): number {
  const source = TEMPLATE_SOURCES[template][role];
  const match = source.match(VIEW_BOX_HEIGHT_RE);
  if (!match) {
    throw new Error(`Banner template "${template}" is missing a "viewBox=\"0 0 1024 H\"" declaration`);
  }
  return Number(match[1]) / TEMPLATE_REFERENCE_WIDTH;
}
