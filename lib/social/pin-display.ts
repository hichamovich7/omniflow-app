import type { PinterestAngle } from '@/types/pinterest';

/**
 * Client-safe display helpers for Pins generated from an article (TASK-044
 * phase 2). No server import here: used by the result cards.
 */

export const ANGLE_LABELS: Record<PinterestAngle, string> = {
  curiosity: 'Curiosity',
  'problem-solution': 'Problem → Solution',
  listicle: 'Listicle',
  discovery: 'Discovery',
  'article-promise': 'Article Promise',
};

export const NO_LINK_NOTICE =
  'No destination URL — add one with "Edit destination URL" on the generation page, or in the CSV.';

export interface PinTextFields {
  title: string;
  description: string;
  keywords: string;
  board: string;
}

/** "Copy full Pin": the text fields only — never a URL. */
export function pinAsText(pin: PinTextFields): string {
  return `Title: ${pin.title}\nDescription: ${pin.description}\nKeywords: ${pin.keywords}\nBoard: ${pin.board}`;
}

/** Pinterest from an existing WordPress post: the picker (no post) or the post's form. */
export function wordpressPostPinterestHref(
  source: { siteId: string; postId?: number | null },
  generationId?: string
): string {
  const params = new URLSearchParams({ siteId: source.siteId });
  if (source.postId) params.set('postId', String(source.postId));
  if (generationId) params.set('generationId', generationId);
  return `/pinterest/from-wordpress?${params.toString()}`;
}

/** Key of the article-grounded Pin metadata in pins.image_analysis (lib/pinterest/article-briefs.ts). */
export const ARTICLE_SOURCE_METADATA_KEY = '_articleSource';

/** The article section a Pin was built from, for display only (null for other Pins). */
export function readPinSourceSection(imageAnalysisJson: string | null): string | null {
  if (!imageAnalysisJson) return null;
  try {
    const value = (JSON.parse(imageAnalysisJson) as Record<string, unknown>)?.[ARTICLE_SOURCE_METADATA_KEY] as
      | { brief?: { sourceSection?: unknown } }
      | undefined;
    const section = value?.brief?.sourceSection;
    return typeof section === 'string' && section.trim() ? section : null;
  } catch {
    return null;
  }
}

/** The visual archetype label of an Auto variety Pin (TASK-078), for display only (null otherwise). */
export function readPinVisualArchetype(imageAnalysisJson: string | null): string | null {
  if (!imageAnalysisJson) return null;
  try {
    const value = (JSON.parse(imageAnalysisJson) as Record<string, unknown>)?.[ARTICLE_SOURCE_METADATA_KEY] as
      | { brief?: { archetype?: { label?: unknown } } }
      | undefined;
    const label = value?.brief?.archetype?.label;
    return typeof label === 'string' && label.trim() ? label : null;
  } catch {
    return null;
  }
}

/** Key of the Template Composer contract in pins.image_analysis (TASK-079). */
export const COMPOSER_METADATA_KEY = '_pinterestComposer';

const VISUAL_FORMAT_LABELS: Record<string, string> = {
  hero: 'Hero',
  materials_and_tools: 'Materials & tools',
  step_by_step: 'Step-by-step',
};

export interface PinVisualFormatDisplay {
  /** "Classic" for every Pin without a composed template (older Pins included). */
  label: string;
  composed: boolean;
  /** Headings of the article sections the rendered text comes from. */
  sources: string[];
  status: 'planned' | 'rendered' | null;
  warnings: string[];
  /** Step-by-step v2 only: "Editorial grid · 3 panels · up to 4 image generations". */
  layout: string | null;
  panelCount: number | null;
  imageCalls: number | null;
}

const STEP_LAYOUT_LABELS: Record<string, string> = {
  'vertical-progression': 'Vertical progression',
  'editorial-grid': 'Editorial grid',
  alternating: 'Alternating',
};

function describeComposerWarning(code: string): string {
  const truncated = /^STEPS_TRUNCATED:(\d+)\/(\d+)$/.exec(code);
  if (truncated) return `Shows the first ${truncated[1]} of ${truncated[2]} steps`;
  const selected = /^STEPS_SELECTED:(\d+)\/(\d+)$/.exec(code);
  return selected ? `Shows ${selected[1]} of the article's ${selected[2]} steps (first, middle and last)` : code;
}

/** The visual format of a Pin, for display only. Never throws. */
export function readPinVisualFormat(imageAnalysisJson: string | null): PinVisualFormatDisplay {
  const classic: PinVisualFormatDisplay = {
    label: 'Classic', composed: false, sources: [], status: null, warnings: [], layout: null, panelCount: null, imageCalls: null,
  };
  if (!imageAnalysisJson) return classic;
  try {
    const value = (JSON.parse(imageAnalysisJson) as Record<string, unknown>)?.[COMPOSER_METADATA_KEY] as
      | { templateType?: unknown; sourceHeadings?: unknown; status?: unknown; warnings?: unknown; layout?: unknown; panelCount?: unknown }
      | undefined;
    const label = typeof value?.templateType === 'string' ? VISUAL_FORMAT_LABELS[value.templateType] : undefined;
    if (!value || !label) return classic;
    const strings = (list: unknown) => (Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []);
    const layout = typeof value.layout === 'string' ? STEP_LAYOUT_LABELS[value.layout] ?? null : null;
    const panelCount = typeof value.panelCount === 'number' && Number.isInteger(value.panelCount) ? value.panelCount : null;
    return {
      label,
      composed: true,
      sources: strings(value.sourceHeadings),
      status: value.status === 'rendered' ? 'rendered' : 'planned',
      warnings: strings(value.warnings).map(describeComposerWarning),
      layout,
      panelCount,
      // One finished-project photo + one per step panel; every other composed Pin makes one call.
      imageCalls: panelCount ? panelCount + 1 : 1,
    };
  } catch {
    return classic;
  }
}

/** "Source: Materials" / "Sources: Step 1, Step 2 and Step 3". */
export function describeVisualFormatSources(sources: string[]): string | null {
  if (sources.length === 0) return null;
  if (sources.length === 1) return `Source: ${sources[0]}`;
  return `Sources: ${sources.slice(0, -1).join(', ')} and ${sources[sources.length - 1]}`;
}

export function articlePinterestCreateHref(articleId: string, generationId?: string): string {
  const params = new URLSearchParams({ source: 'wordpress', articleId });
  if (generationId) params.set('generationId', generationId);
  return `/pinterest/create?${params.toString()}`;
}
