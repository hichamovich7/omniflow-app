import { z } from 'zod';
import type { ArticleSection, WordPressArticleContext } from '@/lib/wordpress/article-context';
import { pickCtaMessage } from '@/lib/pinterest/cta-messages';
import { MATERIALS_HEADING, type PinVisualArchetype, type VisualArchetypeId } from '@/lib/pinterest/visual-archetypes';
import { COMPOSER_METADATA_KEY } from '@/lib/social/pin-display';
import type { PinterestVisualStyle } from '@/types/pinterest';

/**
 * Pinterest Template Composer (TASK-079) — what a composed Pin says.
 *
 * The image model only draws a photo without text; OmniFlow renders every
 * word (render.ts). Each word comes from the article: titles, headings and
 * list items are copied verbatim and only ever shortened
 * (parentheses dropped, cut at a separator), then checked against the
 * article again. The CTA is the only fixed phrase, and only with a
 * Destination URL. Pure and offline: no AI, storage or network call.
 */

export const COMPOSER_TEMPLATE_TYPES = ['hero', 'materials_and_tools', 'step_by_step', 'listicle_article_image'] as const;
export type ComposerTemplateType = (typeof COMPOSER_TEMPLATE_TYPES)[number];
/**
 * The formats a visual style may ask for. `step_by_step` was withdrawn
 * (2026-10-29, replaced by the planned Pinterest Detailed Tutorial
 * Infographic, TASK-080): it stays a stored type only, so older Pins are
 * still read, shown and regenerated. `listicle_article_image` (TASK-083) is
 * never chosen by a style: it is given automatically to numbered Pins.
 */
export type OfferedTemplateType = Exclude<ComposerTemplateType, 'step_by_step' | 'listicle_article_image'>;
export const COMPOSER_TEMPLATE_VERSION = 'v1';
/** Historical Step-by-step v2 contracts (one photo per step panel); v1 = one photo + step cards. Never created any more. */
export const STEP_BY_STEP_TEMPLATE_VERSION = 'v2';
export const COMPOSER_RENDERED_BY = 'omniflow-composer';

/** Historical Step-by-step v2: three step panels, each with its own photo. */
export const STEP_PANEL_COUNT = 3;
/** One finished-project photo + one photo per step panel. */
export const STEP_BY_STEP_IMAGE_CALLS = STEP_PANEL_COUNT + 1;
export const STEP_BY_STEP_LAYOUTS = ['vertical-progression', 'editorial-grid', 'alternating'] as const;
export type StepByStepLayout = (typeof STEP_BY_STEP_LAYOUTS)[number];

export const COMPOSER_TEMPLATE_LABELS: Record<ComposerTemplateType, string> = {
  hero: 'Hero',
  materials_and_tools: 'Materials & tools',
  step_by_step: 'Step-by-step',
  listicle_article_image: 'Numbered list (article photo)',
};

/** TASK-083: crop / layout variants of a numbered Pin's article photo. */
export const LISTICLE_CROP_VARIANTS = 4;
/** `pin_images.image_model` of a Pin composed on an article photo: no image model was called. */
export const ARTICLE_IMAGE_MODEL = 'omniflow-composer/article-image';

export const COMPOSER_LIMITS = {
  title: 90,
  subtitle: 70,
  label: 40,
  item: 48,
  minItems: 3,
  maxItems: 7,
  minTools: 2,
  maxTools: 4,
  minSteps: 3,
  maxSteps: 5,
  sourceText: 600,
  stepPrompt: 2400,
} as const;

const TEMPLATE_BY_STYLE: Partial<Record<PinterestVisualStyle, OfferedTemplateType>> = {
  hero: 'hero',
  'materials-and-tools': 'materials_and_tools',
};

/** The template an explicitly chosen visual format asks for; null for Classic and Auto variety. */
export function composerTemplateForStyle(style: PinterestVisualStyle | undefined): OfferedTemplateType | null {
  return style ? TEMPLATE_BY_STYLE[style] ?? null : null;
}

export const COMPOSER_INELIGIBLE_MESSAGES: Record<OfferedTemplateType, string> = {
  hero: 'This article has no title short enough for the Hero format. Choose another visual format.',
  materials_and_tools:
    'This article has no Materials, Ingredients or Tools list with at least 3 items, so the Materials & tools format cannot be used. Choose another visual format.',
};

// ── Text helpers ─────────────────────────────────────────────────────────

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Comparison form: case, quotes, spacing and a trailing ellipsis do not matter. */
function normalizeForMatch(text: string): string {
  return collapse(
    text
      .normalize('NFC')
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…$/, '')
  );
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

const wordCount = (text: string) => text.split(' ').filter(Boolean).length;

/**
 * Deterministic shortening: drop parentheses and trailing punctuation, then
 * cut at the first separator. With `ellipsis`, a still-too-long text is cut
 * at a word boundary and marked with "…". Null when nothing usable is left.
 */
function shorten(text: string, max: number, options: { ellipsis?: boolean } = {}): string | null {
  const value = collapse(text.replace(/\s*\([^)]*\)/g, '')).replace(/[\s.;:,]+$/, '');
  if (!value) return null;
  if (value.length <= max) return value;
  const head = value.split(/\s*[,;:|]\s+|\s+[–—-]\s+/)[0].trim();
  if (head.length <= max && wordCount(head) >= 2) return head;
  if (!options.ellipsis) return null;
  let out = '';
  for (const word of value.split(' ')) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > max - 1) break;
    out = next;
  }
  return wordCount(out) >= 2 ? `${out.replace(/[\s.;:,]+$/, '')}…` : null;
}

/** The article title, or its first part ("Title: subtitle" → "Title") when the whole one is too long. */
export function composerTitle(context: WordPressArticleContext): string | null {
  return shorten(context.title, COMPOSER_LIMITS.title);
}

/** Everything the article says — the only text a composed Pin may show. */
function articleCorpus(context: WordPressArticleContext): string {
  return normalizeForMatch(
    [context.title, context.excerpt, ...context.sections.flatMap((section) => [section.heading, section.text])].join('\n')
  );
}

function inSource(text: string, source: string): boolean {
  const needle = normalizeForMatch(text);
  return needle.length > 0 && source.includes(needle);
}

// ── Materials & tools ─────────────────────────────────────────────────────

const TOOLS_HEADING =
  /^(?:tools|equipment|werkzeuge?|utensilien|hilfsmittel|outils|ustensiles|herramientas|utensilios)\b/i;

function findListSection(context: WordPressArticleContext, heading: RegExp, exclude?: string): ArticleSection | null {
  return (
    context.sections.find(
      (section) => section.kind !== 'intro' && section.id !== exclude && heading.test(section.heading.trim())
    ) ?? null
  );
}

/** "a, b, c and d" written as one sentence — a list only when every part is short. */
function splitInlineList(paragraph: string): string[] {
  if (paragraph.length > 280) return [];
  const parts = paragraph.replace(/[.!]+$/, '').split(/\s*[,;]\s*/);
  if (parts.length < 2) return [];
  const last = parts.pop() ?? '';
  const all = [...parts, ...last.split(/\s+(?:and|und|et|y|or|oder|ou|o)\s+/i)].map(collapse).filter(Boolean);
  return all.length >= COMPOSER_LIMITS.minItems && all.every((part) => wordCount(part) <= 8) ? all : [];
}

/** The section's list, item by item (one `<li>` per line), verbatim and short enough to read. */
function listItems(section: ArticleSection, max: number): string[] {
  const lines = section.text
    .split('\n')
    .map((line) => collapse(line.replace(/^[-•*–·]\s*/, '')))
    .filter((line) => line && !line.endsWith(':'));
  const raw = lines.length >= COMPOSER_LIMITS.minItems ? lines : splitInlineList(lines[0] ?? '');
  const source = normalizeForMatch(section.text);
  const seen = new Set<string>();
  const items: string[] = [];
  for (const line of raw) {
    const item = shorten(line, COMPOSER_LIMITS.item);
    // A long sentence is prose, not a list item; anything the cut altered is dropped.
    if (!item || wordCount(item) > 8 || !inSource(item, source)) continue;
    const key = normalizeForMatch(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(capitalizeFirst(item));
    if (items.length === max) break;
  }
  return items;
}

interface MaterialsContent {
  text: ComposerMaterialsText;
  sources: ArticleSection[];
}

function materialsContent(context: WordPressArticleContext): MaterialsContent | null {
  const section = findListSection(context, MATERIALS_HEADING);
  if (!section) return null;
  const label = shorten(section.heading, COMPOSER_LIMITS.label);
  const items = listItems(section, COMPOSER_LIMITS.maxItems);
  if (!label || items.length < COMPOSER_LIMITS.minItems) return null;
  const toolsSection = findListSection(context, TOOLS_HEADING, section.id);
  const toolsLabel = toolsSection ? shorten(toolsSection.heading, COMPOSER_LIMITS.label) : null;
  const tools = toolsSection && toolsLabel ? listItems(toolsSection, COMPOSER_LIMITS.maxTools) : [];
  const withTools = Boolean(toolsLabel) && tools.length >= COMPOSER_LIMITS.minTools;
  return {
    text: {
      title: composerTitle(context),
      label,
      items,
      toolsLabel: withTools ? toolsLabel : null,
      tools: withTools ? tools : [],
    },
    sources: withTools && toolsSection ? [section, toolsSection] : [section],
  };
}

// ── Eligibility and planning ───────────────────────────────────────────────

export type ComposerEligibility = Record<OfferedTemplateType, boolean>;

/** Which formats the article proves. Checked before any AI call. */
export function composerEligibility(context: WordPressArticleContext): ComposerEligibility {
  return {
    hero: composerTitle(context) !== null,
    materials_and_tools: materialsContent(context) !== null,
  };
}

// Auto variety: the TASK-078 archetypes that a real template renders better.
// A tutorial archetype keeps its TASK-078 layout: no step format is offered.
const ARCHETYPE_TEMPLATE: Partial<Record<VisualArchetypeId, OfferedTemplateType>> = {
  finished_project: 'hero',
  hero_lifestyle: 'hero',
  materials_and_tools: 'materials_and_tools',
};
// Article-wide content: a second Materials Pin would repeat the first.
const ONCE_PER_BATCH: readonly OfferedTemplateType[] = ['materials_and_tools'];

/**
 * One template (or null = classic rendering) per planned Pin slot. An
 * explicit format applies to every slot (its eligibility is checked by the
 * caller first). Auto variety turns an archetype into its template only when
 * the article proves it, never twice in a row, Materials at most once per
 * batch; otherwise the slot keeps its TASK-078 archetype.
 */
export function planComposerTemplates(
  style: PinterestVisualStyle | undefined,
  slotCount: number,
  archetypes: (PinVisualArchetype | null)[] | undefined,
  eligibility: ComposerEligibility
): (OfferedTemplateType | null)[] {
  const explicit = composerTemplateForStyle(style);
  if (explicit) return Array.from({ length: slotCount }, () => (eligibility[explicit] ? explicit : null));
  if (style !== 'auto-variety' || !archetypes) return Array.from({ length: slotCount }, () => null);
  const used = new Set<OfferedTemplateType>();
  let previous: OfferedTemplateType | null = null;
  return Array.from({ length: slotCount }, (_, index) => {
    const archetype = archetypes[index];
    const template = archetype ? ARCHETYPE_TEMPLATE[archetype.id] ?? null : null;
    const allowed =
      template !== null &&
      eligibility[template] &&
      template !== previous &&
      !(ONCE_PER_BATCH.includes(template) && used.has(template));
    previous = allowed ? template : null;
    if (!allowed || !template) return null;
    used.add(template);
    return template;
  });
}

// ── Metadata (pins.image_analysis) ─────────────────────────────────────────

const shortText = (max: number) => z.string().trim().min(1).max(max);

const heroTextSchema = z
  .object({
    title: shortText(120),
    subtitle: shortText(120).nullable(),
    cta: shortText(60).nullable(),
  })
  .strict();

const materialsTextSchema = z
  .object({
    title: shortText(120).nullable(),
    label: shortText(60),
    items: z.array(shortText(80)).min(1).max(COMPOSER_LIMITS.maxItems),
    toolsLabel: shortText(60).nullable(),
    tools: z.array(shortText(80)).max(COMPOSER_LIMITS.maxTools),
  })
  .strict();

// v1 (TASK-079 first version, older Pins): one photo + 3-5 step cards.
const stepsTextSchema = z
  .object({
    title: shortText(120).nullable(),
    steps: z
      .array(z.object({ label: shortText(24), title: shortText(80) }).strict())
      .min(COMPOSER_LIMITS.minSteps)
      .max(COMPOSER_LIMITS.maxSteps),
  })
  .strict();

// v2: three step panels, each with its own photo; OmniFlow numbers them 1-3.
const stepsV2TextSchema = z
  .object({
    title: shortText(120).nullable(),
    steps: z
      .array(z.object({ label: shortText(24).nullable(), title: shortText(80) }).strict())
      .length(STEP_PANEL_COUNT),
  })
  .strict();

const stepPanelSchema = z
  .object({
    sectionId: z.string().min(1).max(40),
    sectionTitle: z.string().max(300),
    sectionLanguage: z.string().min(2).max(8),
    sourceText: z.string().min(1).max(COMPOSER_LIMITS.sourceText),
    /** Deterministic image prompt (built from the section's subject contract, no text-model call). */
    imagePrompt: z.string().min(1).max(COMPOSER_LIMITS.stepPrompt),
  })
  .strict();

const commonFields = {
  sourceSections: z.array(z.string().min(1).max(40)).min(1).max(8),
  sourceHeadings: z.array(z.string().max(300)).max(8),
  renderedBy: z.literal(COMPOSER_RENDERED_BY),
  language: z.string().min(2).max(8),
  status: z.enum(['planned', 'rendered']),
  warnings: z.array(z.string().max(80)).max(10),
};
const v1 = { templateVersion: z.literal(COMPOSER_TEMPLATE_VERSION), ...commonFields };

const stepsV2MetadataSchema = z
  .object({
    templateType: z.literal('step_by_step'),
    templateVersion: z.literal(STEP_BY_STEP_TEMPLATE_VERSION),
    ...commonFields,
    layout: z.enum(STEP_BY_STEP_LAYOUTS),
    panelCount: z.literal(STEP_PANEL_COUNT),
    niche: z.string().max(60).nullable(),
    panels: z.array(stepPanelSchema).length(STEP_PANEL_COUNT),
    text: stepsV2TextSchema,
  })
  .strict();

// TASK-083: the validated Pin title (with the article's number) on the article's own photo.
const listicleTextSchema = z
  .object({
    title: shortText(120),
    number: z.string().regex(/^[1-9]\d{0,3}$/),
    cta: shortText(60).nullable(),
  })
  .strict();

const listicleSourceSchema = z
  .object({
    imageUrl: z.string().url().max(2048),
    imageKey: z.string().max(2048).nullable(),
    origin: z.enum(['section', 'featured']),
    sectionId: z.string().min(1).max(40).nullable(),
    fallbackUrl: z.string().url().max(2048).nullable(),
    crop: z.number().int().min(0).max(LISTICLE_CROP_VARIANTS - 1),
  })
  .strict();

const listicleMetadataSchema = z
  .object({ templateType: z.literal('listicle_article_image'), ...v1, text: listicleTextSchema, source: listicleSourceSchema })
  .strict();

const composerMetadataSchema = z.union([
  z.object({ templateType: z.literal('hero'), ...v1, text: heroTextSchema }).strict(),
  z.object({ templateType: z.literal('materials_and_tools'), ...v1, text: materialsTextSchema }).strict(),
  z.object({ templateType: z.literal('step_by_step'), ...v1, text: stepsTextSchema }).strict(),
  stepsV2MetadataSchema,
  listicleMetadataSchema,
]);

export type ComposerMetadata = z.infer<typeof composerMetadataSchema>;
export type StepByStepV2Metadata = z.infer<typeof stepsV2MetadataSchema>;
export type ListicleMetadata = z.infer<typeof listicleMetadataSchema>;
export type ComposerListicleText = z.infer<typeof listicleTextSchema>;
export type ListicleSource = z.infer<typeof listicleSourceSchema>;
export type ComposerStepPanel = z.infer<typeof stepPanelSchema>;
export type ComposerHeroText = z.infer<typeof heroTextSchema>;
export type ComposerMaterialsText = z.infer<typeof materialsTextSchema>;
export type ComposerStepsText = z.infer<typeof stepsTextSchema>;
export type ComposerStepsV2Text = z.infer<typeof stepsV2TextSchema>;

export function isListicleArticleImage(metadata: ComposerMetadata): metadata is ListicleMetadata {
  return metadata.templateType === 'listicle_article_image';
}

export function isStepByStepV2(metadata: ComposerMetadata): metadata is StepByStepV2Metadata {
  return metadata.templateType === 'step_by_step' && metadata.templateVersion === STEP_BY_STEP_TEMPLATE_VERSION;
}

function parseObject(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The Pin's composer contract; null for Classic Pins, older Pins and malformed data. */
export function readComposerMetadata(imageAnalysisJson: string | null): ComposerMetadata | null {
  const parsed = composerMetadataSchema.safeParse(parseObject(imageAnalysisJson)[COMPOSER_METADATA_KEY]);
  return parsed.success ? parsed.data : null;
}

export function attachComposerMetadata(imageAnalysisJson: string | null, value: ComposerMetadata): string {
  return JSON.stringify({ ...parseObject(imageAnalysisJson), [COMPOSER_METADATA_KEY]: composerMetadataSchema.parse(value) });
}

/**
 * The text a composed Pin may show, for one Pin. `sectionId` is the Pin's own
 * section (Hero subtitle). The CTA is set only with a Destination URL.
 * Null when the article does not prove this template.
 */
export function buildComposerMetadata(
  template: OfferedTemplateType,
  context: WordPressArticleContext,
  options: { sectionId?: string | null; language: string; hasDestination: boolean; ctaIndex: number }
): ComposerMetadata | null {
  const common = {
    templateVersion: COMPOSER_TEMPLATE_VERSION,
    renderedBy: COMPOSER_RENDERED_BY,
    language: options.language,
    status: 'planned',
  } as const;
  const headingsOf = (sections: ArticleSection[]) => sections.map((section) => section.heading || section.subject);

  if (template === 'hero') {
    const section = context.sections.find((item) => item.id === options.sectionId) ?? null;
    const title = composerTitle(context);
    if (!title) return null;
    const subject = section && section.kind === 'subject' ? shorten(section.subject, COMPOSER_LIMITS.subtitle) : null;
    const subtitle = subject && !normalizeForMatch(title).includes(normalizeForMatch(subject)) ? subject : null;
    return {
      ...common,
      templateType: 'hero',
      sourceSections: [section?.id ?? context.sections[0]?.id ?? 's0'],
      sourceHeadings: section ? headingsOf([section]) : [],
      warnings: [],
      text: {
        title,
        subtitle,
        cta: options.hasDestination ? pickCtaMessage(options.language, options.ctaIndex) : null,
      },
    };
  }

  const content = materialsContent(context);
  if (!content) return null;
  return {
    ...common,
    templateType: 'materials_and_tools',
    sourceSections: content.sources.map((section) => section.id),
    sourceHeadings: headingsOf(content.sources),
    warnings: [],
    text: content.text,
  };
}

const LISTICLE_TITLE_SHORT = 70;

function numbersOf(text: string): Set<string> {
  return new Set((text.match(/\p{Number}+/gu) ?? []).map((digits) => String(Number(digits))));
}

/**
 * The words a numbered Pin shows: its validated title, shortened at a
 * separator ("15 Crochet Blankets: Cozy Ideas…" → "15 Crochet Blankets")
 * only while the number stays in it.
 */
export function listicleDisplayTitle(pinTitle: string, number: string): string | null {
  const full = collapse(pinTitle);
  if (!full || !numbersOf(full).has(number)) return null;
  const short = shorten(full, LISTICLE_TITLE_SHORT);
  if (short && numbersOf(short).has(number)) return short;
  return full.length <= 120 ? full : null;
}

/**
 * TASK-083: the contract of a numbered Pin — its validated title and the
 * article's number on one of the article's own photos. Null when the title
 * does not carry the number.
 */
export function buildListicleComposerMetadata(input: {
  pinTitle: string;
  number: string;
  source: ListicleSource;
  context: WordPressArticleContext;
  sectionId?: string | null;
  language: string;
  hasDestination: boolean;
  ctaIndex: number;
}): ListicleMetadata | null {
  const title = listicleDisplayTitle(input.pinTitle, input.number);
  if (!title) return null;
  const section = input.context.sections.find((item) => item.id === input.sectionId) ?? null;
  return {
    templateType: 'listicle_article_image',
    templateVersion: COMPOSER_TEMPLATE_VERSION,
    renderedBy: COMPOSER_RENDERED_BY,
    language: input.language,
    status: 'planned',
    sourceSections: [section?.id ?? input.context.sections[0]?.id ?? 's0'],
    sourceHeadings: section ? [section.heading || section.subject] : [],
    warnings: [],
    text: {
      title,
      number: input.number,
      cta: input.hasDestination ? pickCtaMessage(input.language, input.ctaIndex) : null,
    },
    source: input.source,
  };
}

/** Every image URL the article shows (featured + in-body): the only photos a numbered Pin may use. */
function articleImageUrlSet(context: WordPressArticleContext): Set<string> {
  return new Set(
    [
      context.featuredImage?.url,
      ...context.internalImages.map((image) => image.url),
      ...context.sections.flatMap((section) => section.images.map((image) => image.url)),
    ].filter((url): url is string => Boolean(url))
  );
}

export interface ComposerTextIssue {
  code:
    | 'COMPOSER_TEXT_NOT_IN_ARTICLE'
    | 'COMPOSER_CTA_NOT_ALLOWED'
    | 'COMPOSER_SOURCE_SECTION_UNKNOWN'
    | 'COMPOSER_TEXT_NOT_IN_TITLE'
    | 'COMPOSER_SOURCE_IMAGE_UNKNOWN';
  field: string;
}

function ctaVariants(language: string): string[] {
  return [0, 1, 2, 3].map((index) => pickCtaMessage(language, index));
}

/**
 * Every word a composed Pin shows must be in the article (numbers included);
 * the CTA must be one of the fixed localized phrases. An empty list = valid.
 */
export function verifyComposerText(
  metadata: ComposerMetadata,
  context: WordPressArticleContext,
  options: { pinTitle?: string } = {}
): ComposerTextIssue[] {
  const corpus = articleCorpus(context);
  const issues: ComposerTextIssue[] = [];
  const check = (field: string, text: string | null) => {
    if (text !== null && !inSource(text, corpus)) issues.push({ code: 'COMPOSER_TEXT_NOT_IN_ARTICLE', field });
  };
  const known = new Set(context.sections.map((section) => section.id));
  metadata.sourceSections.forEach((id, index) => {
    if (!known.has(id)) issues.push({ code: 'COMPOSER_SOURCE_SECTION_UNKNOWN', field: `sourceSections.${index}` });
  });

  if (metadata.templateType === 'listicle_article_image') {
    // The number comes from the article (H1 or its numbered list), the words
    // from the Pin's validated title, the photo is one the article shows.
    const articleNumbers = numbersOf([context.title, ...context.sections.map((section) => section.heading)].join('\n'));
    if (!articleNumbers.has(metadata.text.number)) issues.push({ code: 'COMPOSER_TEXT_NOT_IN_ARTICLE', field: 'number' });
    const titleNumbers = numbersOf(metadata.text.title);
    if (!titleNumbers.has(metadata.text.number)) issues.push({ code: 'COMPOSER_TEXT_NOT_IN_TITLE', field: 'title.number' });
    const corpusNumbers = numbersOf(corpus);
    if ([...titleNumbers].some((value) => !corpusNumbers.has(value))) issues.push({ code: 'COMPOSER_TEXT_NOT_IN_ARTICLE', field: 'title.numbers' });
    if (options.pinTitle === undefined || !normalizeForMatch(options.pinTitle).includes(normalizeForMatch(metadata.text.title))) {
      issues.push({ code: 'COMPOSER_TEXT_NOT_IN_TITLE', field: 'title' });
    }
    if (metadata.text.cta !== null && !ctaVariants(metadata.language).includes(metadata.text.cta)) {
      issues.push({ code: 'COMPOSER_CTA_NOT_ALLOWED', field: 'cta' });
    }
    const images = articleImageUrlSet(context);
    if (!images.has(metadata.source.imageUrl)) issues.push({ code: 'COMPOSER_SOURCE_IMAGE_UNKNOWN', field: 'source.imageUrl' });
    if (metadata.source.fallbackUrl !== null && !images.has(metadata.source.fallbackUrl)) {
      issues.push({ code: 'COMPOSER_SOURCE_IMAGE_UNKNOWN', field: 'source.fallbackUrl' });
    }
  } else if (metadata.templateType === 'hero') {
    check('title', metadata.text.title);
    check('subtitle', metadata.text.subtitle);
    if (metadata.text.cta !== null && !ctaVariants(metadata.language).includes(metadata.text.cta)) {
      issues.push({ code: 'COMPOSER_CTA_NOT_ALLOWED', field: 'cta' });
    }
  } else if (metadata.templateType === 'materials_and_tools') {
    check('title', metadata.text.title);
    check('label', metadata.text.label);
    metadata.text.items.forEach((item, index) => check(`items.${index}`, item));
    check('toolsLabel', metadata.text.toolsLabel);
    metadata.text.tools.forEach((tool, index) => check(`tools.${index}`, tool));
  } else {
    check('title', metadata.text.title);
    metadata.text.steps.forEach((step, index) => {
      check(`steps.${index}.label`, step.label);
      check(`steps.${index}.title`, step.title);
    });
  }
  return issues;
}

/** The stored contract after a successful render; text and sources unchanged. */
export function markComposerRendered(imageAnalysisJson: string | null, metadata: ComposerMetadata, warnings: string[]): string {
  return attachComposerMetadata(imageAnalysisJson, {
    ...metadata,
    status: 'rendered',
    warnings: [...new Set([...metadata.warnings, ...warnings])].slice(0, 10),
  });
}

/** Image-model instruction for a composed Pin: one clean photo, the text is added by OmniFlow. */
export function composerPhotoInstruction(template: ComposerTemplateType): string {
  const framing =
    template === 'hero'
      ? 'Keep the main subject in the middle of the frame with calm, uncluttered space near the top and bottom edges.'
      : 'Keep the whole main subject in the upper-middle part of the frame; the lower part of the Pin will be covered by a text panel.';
  return [
    'COMPOSED PIN PHOTO — OmniFlow adds every title, list and step label after generation.',
    'Generate one single photograph of the finished project: no collage, no panels, no grid, no frames, no split layout.',
    'No text, letters, numbers, labels, logos or lists anywhere in the image.',
    framing,
  ].join('\n');
}
