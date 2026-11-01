export const SUPPORTED_LANGUAGES = ['en', 'de', 'es', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const PINTEREST_ANGLES = [
  'curiosity',
  'problem-solution',
  'listicle',
  'discovery',
  'article-promise',
] as const;
export type PinterestAngle = (typeof PINTEREST_ANGLES)[number];

export const PINTEREST_GENERATION_MODES = [
  'ai-integrated',
  'photo-only',
  'legacy-composite',
] as const;
export type PinterestGenerationMode = (typeof PINTEREST_GENERATION_MODES)[number];

// TASK-078: Pins from an article only. `classic` = the behavior before
// visual archetypes; `auto-variety` gives each Pin a composition family
// (lib/pinterest/visual-archetypes.ts). TASK-079: `hero` and
// `materials-and-tools` are Template Composer formats — a photo without
// text, every word rendered by OmniFlow (lib/pinterest/composer/). The
// former `step-by-step` format was withdrawn (2026-10-29): it is replaced by
// the planned Pinterest Detailed Tutorial Infographic (TASK-080).
export const PINTEREST_VISUAL_STYLES = [
  'classic',
  'auto-variety',
  'hero',
  'materials-and-tools',
] as const;
export type PinterestVisualStyle = (typeof PINTEREST_VISUAL_STYLES)[number];

// TASK-088: how the text of a numbered Pin on an article photo
// (`listicle_article_image`) is made. `ai-design` (default since v3.3.0) =
// the image model receives the article photo as a reference and draws the
// text itself (one image call per Pin); `omniflow-overlay` = the TASK-087
// panel drawn by OmniFlow; `photo-only` = the article photo without text.
export const LISTICLE_TEXT_TREATMENTS = ['omniflow-overlay', 'ai-design', 'photo-only'] as const;
export type ListicleTextTreatment = (typeof LISTICLE_TEXT_TREATMENTS)[number];
/**
 * v3.3.0: new numbered article Pins default to the AI-generated design (the
 * article photo as a reference, one paid image call per Pin). The overlay and
 * Photo only stay available when chosen explicitly.
 */
export const DEFAULT_LISTICLE_TEXT_TREATMENT: ListicleTextTreatment = 'ai-design';
/** What a stored numbered Pin without `textTreatment` was made with (every Pin made before v3.3.0 that kept the overlay). */
export const STORED_LISTICLE_TEXT_TREATMENT_FALLBACK: ListicleTextTreatment = 'omniflow-overlay';

/**
 * TASK-FIX-089: what an article is, decided before the visual format —
 * lib/pinterest/article-kind.ts. Only `project_listicle` gets numbered Pins
 * composed on the article's photos.
 */
export type ArticleKind = 'project_listicle' | 'tips_guide' | 'generic_article';
export const ARTICLE_KIND_LABELS: Record<ArticleKind, string> = {
  project_listicle: 'Project ideas',
  tips_guide: 'Tips & tricks',
  generic_article: 'Article',
};

export const PINTEREST_CREATIVE_FORMATS = [
  'hero-pin',
  'pattern-guide',
  'editorial-story',
  'ai-chooses',
] as const;
export type PinterestCreativeFormat = (typeof PINTEREST_CREATIVE_FORMATS)[number];

export const PINTEREST_STRATEGIES = ['ai-recommends', 'balanced', 'manual'] as const;
export type PinterestStrategy = (typeof PINTEREST_STRATEGIES)[number];

// `none` disables the element entirely: it is not generated, not rendered and
// not persisted (see isIntegratedTextEnabled in lib/validations/pinterest.ts).
export const PINTEREST_TEXT_IMPORTANCE = ['high', 'medium', 'low', 'none'] as const;
export type PinterestTextImportance = (typeof PINTEREST_TEXT_IMPORTANCE)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
};

// Quick presets of the "Pins" select. Any whole number between PINS_MIN and
// PINS_MAX is accepted (custom value) — the presets are only shortcuts.
export const PINS_OPTIONS = [1, 3, 5, 7, 8, 10, 20, 30] as const;
export type PinsOption = (typeof PINS_OPTIONS)[number];
export const PINS_MIN = 1;
export const PINS_MAX = 30;
/** Default batch size of the keyword flow. */
export const DEFAULT_PINS_REQUESTED = 10;
/** Default batch size when generating from a WordPress article. */
export const DEFAULT_ARTICLE_PINS_REQUESTED = 5;

export interface GenerateRequest {
  projectId: string;
  keyword: string;
  language: SupportedLanguage;
  pinsRequested: PinsOption;
}

export interface GeneratedPin {
  angle: PinterestAngle;
  title: string;
  description: string;
  keywords: string;
  board: string;
  image_prompt: string;
}

export interface OpenRouterPinsResponse {
  pins: GeneratedPin[];
}
