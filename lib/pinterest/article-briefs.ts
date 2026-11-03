import {
  cleanArticleText,
  extractVisualAttributes,
  findSection,
  findTerms,
  mergeVisualAttributes,
  normalizeForMatch,
  subjectSections,
  type ArticleSection,
  type ArticleSourceType,
  type AttributeCategory,
  type VisualAttributes,
  type WordPressArticleContext,
  VISUAL_LEXICON,
} from '@/lib/wordpress/article-context';
import type { PinterestStrategyIssue, PinterestSubjectReport } from '@/lib/pinterest/strategy';
import {
  absentHomeFurniture,
  checkHomeDecorSubject,
  describeHomeAnchors,
  findHomeAnchors,
  findUngroundedHomeTerms,
  sectionHomeFurniture,
} from '@/lib/pinterest/home-decor-anchors';
import {
  findSubjectConcepts,
  isCuratedSubjectConcept,
  resolveHeadingSubject,
  subjectConcept,
  subjectNicheOf,
  type SubjectNiche,
} from '@/lib/pinterest/subject-concepts';
import { findNicheProfile } from '@/lib/niche/resolve';
import { ARTICLE_SOURCE_METADATA_KEY } from '@/lib/social/pin-display';
import {
  formatArchetypeLines,
  isPinVisualArchetype,
  planVisualArchetypes,
  type PinVisualArchetype,
  type PinterestVisualStyle,
} from '@/lib/pinterest/visual-archetypes';
import {
  COMPOSER_TEMPLATE_LABELS,
  composerEligibility,
  planComposerTemplates,
  type ComposerEligibility,
  type OfferedTemplateType,
} from '@/lib/pinterest/composer/content';
import { checkTipImage, type ArticleKind } from '@/lib/pinterest/article-kind';
import {
  listicleProjectSections,
  planListicleSectionAssignments,
  validateSectionAssignments,
  type ArticleSectionAssignment,
} from '@/lib/pinterest/section-assignment';

/**
 * Article-grounded Pins (Volet B). Before the text model runs, every Pin is
 * assigned a real section of the article (a pattern, a project, an idea) and
 * gets a visual brief built only from what that section — and its photo —
 * actually shows. The brief reaches the text prompt, is stored on the Pin
 * (pins.image_analysis, no migration) and is appended to the image prompt.
 */

const MAX_DETAILS_PER_BRIEF = 5;
const MAX_DETAIL_LENGTH = 240;

export interface PinVisualBrief {
  sectionId: string;
  articleSubject: string;
  sourceSection: string;
  represented: string;
  materials: string[];
  colors: string[];
  techniques: string[];
  patterns: string[];
  shape: string[];
  texture: string[];
  visualDetails: string[];
  allowedElements: string[];
  forbiddenElements: string[];
  /** Absent on briefs stored before the contract existed: the former checks apply. */
  subjectContract?: VisualSubjectContract;
  /** Auto variety (TASK-078): this Pin's composition family. Absent = classic brief. */
  archetype?: PinVisualArchetype;
  /** TASK-FIX-089: a tips_guide section — the image shows the tip / action, not a project. Absent = project brief. */
  focus?: 'tip';
  /**
   * TASK-FIX-090: a project_listicle section that names no project of its own
   * ("4. Speckled Stoneware Look") inherits the H1's global subject ("air-dry
   * clay pumpkin painting", anchor "pumpkin"). Absent = former checks.
   */
  globalSubject?: ArticleGlobalSubject;
}

/** The subject every section of a project gallery shares, read from its H1 (English only). */
export interface ArticleGlobalSubject {
  /** "air-dry clay pumpkin painting" — the H1 without its count, gallery word and audience clause. */
  label: string;
  /** Object words the image prompt must show ("pumpkin"). */
  anchors: string[];
}

/**
 * What a Pin image must show, independent of the article language: one
 * canonical concept (subject-concepts.ts) taken from the section heading,
 * else — a step section that names no project — inherited from the H1.
 * Supporting elements come from this section only and never replace the
 * primary subject.
 */
export interface VisualSubjectContract {
  primarySubjectId: string;
  /** Heading or H1 text in the article language (data, never sent as an instruction). */
  primarySubjectLabel: string;
  /** Normalized English anchors the image prompt must contain ("amigurumi crochet toy"). */
  requiredImageAnchors: string[];
  /** Concepts this section names beside the primary subject (hat on an amigurumi). */
  allowedSupportingElements: string[];
  /** Concepts other sections name but this one never does. */
  forbiddenElements: string[];
  sourceSectionId: string;
  /** True when a step section inherits the H1's subject. */
  inheritedFromTitle: boolean;
  /** Fixed-template provenance: where the primary subject was read. */
  evidence: string[];
}

/** Text-only description of a section's photo (alt/caption or Vision). */
export interface SectionImageDescription {
  source: 'alt' | 'vision';
  text: string;
}

/**
 * How a Pin's image is checked against its section: `project` (Crochet,
 * Clay, any other niche — the section's project noun) or `home-decor`
 * (Home Organization & Decor — room, furniture, palette, material, style).
 */
export type ArticleSubjectCheck = 'project' | 'home-decor';

export function subjectCheckForNiche(niche: string | null | undefined): ArticleSubjectCheck {
  return findNicheProfile(niche)?.slug === 'home-decor' ? 'home-decor' : 'project';
}

export interface ArticleGrounding {
  sourceType: ArticleSourceType;
  /** Section id per Pin, in Pin order. */
  sectionPlan: string[];
  briefs: Record<string, PinVisualBrief>;
  /** Everything the article says or shows — what an image prompt may use. */
  evidence: string;
  /** The vocabulary check only runs on English articles (the lexicon is English). */
  enforceVocabulary: boolean;
  subjectCheck: ArticleSubjectCheck;
  /** Article language — selects the German spellings of the Home Decor vocabulary. */
  language: string;
  /** Planned section text (heading, body, photo text) for the Home Decor check; the brief is used otherwise. */
  sectionTexts?: Record<string, string>;
  /** Auto variety (TASK-078): one archetype per planned Pin, in Pin order. Absent in classic mode. */
  pinArchetypes?: (PinVisualArchetype | null)[];
  /** TASK-079: the composed template of each planned Pin (null = classic rendering). Absent in classic mode. */
  pinTemplates?: (OfferedTemplateType | null)[];
  /** TASK-079: which composer formats the article proves. Absent in classic mode. */
  composerEligibility?: ComposerEligibility;
  /** TASK-FIX-089: the article kind the briefs were built for. Absent = project briefs (former behavior). */
  articleKind?: ArticleKind;
  /**
   * TASK-FIX-096: project_listicle only — OmniFlow's fixed section per Pin
   * slot (id, list number, title). Each Pin must echo its slot's id; the
   * duplicate-section check always applies. Absent = former behavior.
   */
  sectionAssignments?: ArticleSectionAssignment[];
}

// What the image prompt check looks for. Only claims about the project:
// props and backdrops (wood table, linen cloth, a vase) are styling.
const CHECKED_TERMS: Partial<Record<AttributeCategory, readonly string[]>> = {
  objects: [
    'scarf', 'cowl', 'shawl', 'poncho', 'infinity scarf', 'hat', 'beanie', 'headband', 'mittens', 'gloves', 'socks', 'slippers',
    'blanket', 'baby blanket', 'sweater', 'cardigan', 'tank top', 'crop top', 'dress', 'vest', 'bag', 'amigurumi', 'coaster',
    'placemat', 'rug', 'garland', 'bandana', 'dishcloth',
  ],
  materials: [
    'acrylic', 'wool', 'merino', 'alpaca', 'mohair', 'cashmere', 'chenille', 'velvet yarn', 'bamboo yarn', 'cotton yarn', 'tweed',
    'boucle', 'self-striping yarn', 'gradient yarn', 'cake yarn', 'metallic yarn', 'chunky', 'bulky', 'worsted', 'aran', 'dk weight',
    'fingering weight', 'sport weight', 'lace weight', 'air dry clay', 'polymer clay',
  ],
  patterns: [
    'stripes', 'ombre', 'gradient', 'waves', 'chevron', 'color block', 'triangles', 'granny square', 'plaid', 'checkered', 'polka dots',
    'floral', 'herringbone', 'houndstooth', 'color swatch', 'speckled', 'marled',
  ],
  techniques: [
    'cables', 'fringe', 'tassels', 'pom-pom', 'bobble stitch', 'puff stitch', 'shell stitch', 'granny stitch', 'tunisian crochet',
    'mosaic crochet', 'tapestry crochet', 'corner to corner', 'embroidery', 'ribbing', 'knit',
  ],
  // Chromatic colors only: neutral backdrops (white, cream, gray, wood) are allowed.
  colors: [
    'red', 'orange', 'yellow', 'green', 'blue', 'navy', 'teal', 'turquoise', 'aqua', 'purple', 'violet', 'lilac', 'lavender', 'pink',
    'magenta', 'fuchsia', 'burgundy', 'maroon', 'coral', 'peach', 'mint', 'sage', 'olive', 'emerald', 'rust', 'plum', 'rainbow',
    'mustard', 'neon', 'jewel tones', 'pastel',
  ],
};

// Frequent inventions for handmade / textile subjects, listed as forbidden
// when the article never mentions them.
const COMMON_INVENTIONS = ['chunky', 'bulky', 'fringe', 'tassels', 'pom-pom', 'cables', 'granny square', 'knit', 'cowl', 'infinity scarf', 'hat', 'blanket'];

const FIXED_FORBIDDEN = [
  'colors, yarns, stitches, measurements or construction details that are not listed in this brief',
  'a different project than the one represented',
  'text, letters, numbers, logos, brand names, labels or packaging',
  'a pattern page, chart, diagram or written instructions',
];

/**
 * TASK-FIX-090 — documented synonyms of a checked term. A term in an image
 * prompt is grounded when the source contains one of its `source` spellings
 * ("floral" ← "wildflowers"); the prompt-side vocabulary is unchanged, so a
 * synonym never counts without proof in the article.
 */
const DOCUMENTED_SYNONYMS: ReadonlyArray<{ term: string; category: AttributeCategory; source: readonly string[]; prompt: readonly string[] }> = [
  {
    term: 'floral',
    category: 'patterns',
    source: ['floral', 'florals', 'wildflower', 'wildflowers', 'flower detail', 'flower details', 'flower motif', 'flower motifs'],
    prompt: ['floral', 'florals', 'wildflower', 'wildflowers', 'flower', 'flowers', 'flower detail', 'flower details', 'flower motif', 'flower motifs'],
  },
];

function hasSpellingIn(normalizedText: string, spelling: string): boolean {
  const needle = normalizeForMatch(spelling);
  return needle.trim().length > 0 && normalizedText.includes(needle);
}

/** Checked terms of `category` the text proves through a documented synonym. */
function documentedSynonymTerms(text: string, category: AttributeCategory): string[] {
  const normalized = normalizeForMatch(text);
  return DOCUMENTED_SYNONYMS.filter((group) => group.category === category && group.source.some((spelling) => hasSpellingIn(normalized, spelling))).map(
    (group) => group.term
  );
}

// Words of an H1 that are not the object itself: materials, crafts, audiences, seasons, sizes.
const GLOBAL_SUBJECT_STOP_WORDS = new Set([
  'air', 'dry', 'clay', 'polymer', 'ceramic', 'ceramics', 'pottery', 'crochet', 'crocheted', 'knit', 'knitted', 'knitting', 'sewing', 'sewn',
  'painting', 'painted', 'paint', 'sculpting', 'sculpted', 'handmade', 'homemade', 'easy', 'cute', 'simple', 'mini', 'small', 'tiny', 'big',
  'cozy', 'cosy', 'best', 'beginner', 'beginners', 'free', 'quick', 'modern', 'rustic', 'boho', 'fall', 'autumn', 'winter', 'spring', 'summer',
  'christmas', 'halloween', 'holiday', 'festive', 'diy', 'decor', 'decorating', 'decoration', 'decorations', 'home', 'kids', 'gift', 'gifts',
  'top', 'new', 'unique', 'creative', 'beautiful', 'pretty', 'stylish', 'look', 'looks', 'style', 'styles', 'finish', 'finishes',
]);
const GALLERY_WORDS = /\b(?:ideas?|projects?|patterns?|crafts?|designs?|makes|inspirations?|diys?)\b/gi;

/**
 * The H1's global subject: "10 Air-Dry Clay Pumpkin Painting Ideas for Cozy
 * Fall Decor" → "air-dry clay pumpkin painting", anchor "pumpkin". Null for a
 * non-English article or when no object word is left ("12 Green Air-Dry
 * Clay Ideas") — the former checks then apply.
 */
export function articleGlobalSubject(title: string, language: string | null | undefined): ArticleGlobalSubject | null {
  if ((language ?? 'en').toLowerCase().slice(0, 2) !== 'en') return null;
  const head = (title.split(/\s*[:|]\s*|\s+[–—-]\s+/)[0] ?? title).split(/\s+(?:for|to|with|that|you|from|in|on|of|this|your|and)\s+/i)[0] ?? '';
  const label = head
    .replace(/^\s*(?:top\s+)?\d+\s+/i, '')
    .replace(GALLERY_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en');
  if (!label) return null;
  const anchors = uniq(
    normalizeForMatch(label)
      .trim()
      .split(' ')
      .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !GLOBAL_SUBJECT_STOP_WORDS.has(word))
      .filter((word) => findTerms(word, 'colors').length === 0 && findTerms(word, 'materials').length === 0)
  );
  return anchors.length ? { label, anchors } : null;
}

// Heading words that describe nothing visible on their own.
const VARIATION_STOP_WORDS = new Set(['look', 'looks', 'style', 'styled', 'details', 'detail', 'finish', 'idea', 'ideas', 'with', 'and', 'the', 'for', 'from', 'into', 'your', 'this']);

function promptWordShows(promptWords: readonly string[], word: string): boolean {
  return promptWords.some(
    (candidate) => candidate === word || candidate === `${word}s` || candidate === `${word}es` || (candidate.length >= 5 && word.length >= 5 && candidate.slice(0, 5) === word.slice(0, 5))
  );
}

/**
 * The global-subject check (TASK-FIX-090): the image prompt shows the H1's
 * object ("pumpkin") and this section's variation — a word of its heading
 * ("speckled", "stoneware"), or a documented synonym the section itself
 * names ("floral" for "Wildflower Details"). Another object is not enough.
 */
export function checkGlobalSubject(imagePrompt: string, brief: PinVisualBrief, sectionText: string): PinterestSubjectReport & { ok: boolean } {
  const global = brief.globalSubject!;
  const promptWords = normalizeForMatch(imagePrompt).trim().split(' ');
  const anchorsShown = global.anchors.filter((anchor) => promptWordShows(promptWords, anchor));
  const heading = brief.sourceSection.replace(/^\s*\d+\s*[.):\-–—]\s*/, '');
  const variation = uniq(
    normalizeForMatch(heading)
      .trim()
      .split(' ')
      .filter((word) => word.length >= 4 && !VARIATION_STOP_WORDS.has(word) && !global.anchors.includes(word))
  );
  const shown = variation.filter((word) => promptWordShows(promptWords, word));
  const normalizedSection = normalizeForMatch(sectionText);
  const normalizedPrompt = normalizeForMatch(imagePrompt);
  const synonyms = DOCUMENTED_SYNONYMS.filter(
    (group) =>
      group.source.some((spelling) => hasSpellingIn(normalizedSection, spelling)) &&
      group.prompt.some((spelling) => hasSpellingIn(normalizedPrompt, spelling))
  ).map((group) => group.term);
  const variationOk = variation.length === 0 || shown.length > 0 || synonyms.length > 0;
  const ok = anchorsShown.length > 0 && variationOk;
  const detected = uniq([...anchorsShown, ...shown, ...synonyms]);
  return {
    ok,
    expected: [global.anchors[0], ...variation],
    detected: detected.length ? detected : ['no recognizable project'],
    missing: [...(anchorsShown.length ? [] : [global.anchors[0]]), ...(variationOk ? [] : variation)],
    required: global.anchors[0],
  };
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function clip(value: string, max = MAX_DETAIL_LENGTH): string {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25);
}

/**
 * Section photo text worth using as-is: at least two visual facts beyond the
 * project's own name (an alt that only repeats "Gradient Sparkle Scarf" does
 * not describe the photo).
 */
export function isDescriptiveImageText(text: string, projectName = ''): boolean {
  const name = projectName.trim().toLowerCase();
  const described = name ? text.toLowerCase().split(name).join(' ') : text;
  const attributes = extractVisualAttributes(described);
  const visualFacts = attributes.colors.length + attributes.patterns.length + attributes.materials.length + attributes.textures.length + attributes.shapes.length;
  return text.trim().split(/\s+/).length >= 5 && visualFacts >= 2;
}

/**
 * Which section each Pin is built from. With fewer Pins than subjects the
 * picks are spread across the article (5 of 10 → 1st, 3rd, 5th, 7th, 9th);
 * with more, subjects are reused in order. Deterministic: same article and
 * count → same plan.
 */
export function planArticlePinSections(
  context: WordPressArticleContext,
  pinsRequested: number,
  options: { articleKind?: ArticleKind | null } = {}
): string[] {
  // TASK-FIX-096: a project gallery gets one distinct real project per Pin.
  // More Pins than projects is refused by the route before any AI call; here
  // the projects are reused so the (always enforced) duplicate check fails closed.
  if (options.articleKind === 'project_listicle') {
    const plan = planListicleSectionAssignments(context, pinsRequested);
    if (plan.ok) return plan.assignments.map((assignment) => assignment.sourceSectionId);
    const projects = listicleProjectSections(context);
    return projects.length ? Array.from({ length: Math.max(0, pinsRequested) }, (_, index) => projects[index % projects.length].id) : [];
  }
  const subjects = subjectSections(context);
  if (subjects.length === 0 || pinsRequested < 1) return [];
  if (pinsRequested <= subjects.length) {
    return Array.from({ length: pinsRequested }, (_, index) => subjects[Math.floor((index * subjects.length) / pinsRequested)].id);
  }
  return Array.from({ length: pinsRequested }, (_, index) => subjects[index % subjects.length].id);
}

/** Everything the article says or shows, as one block of text. */
export function buildArticleEvidence(context: WordPressArticleContext, imageDescriptions: Record<string, SectionImageDescription[]> = {}): string {
  return [
    context.title,
    context.excerpt,
    context.plainText,
    ...context.imageAltTexts,
    ...context.internalImages.map((image) => image.caption),
    ...Object.values(imageDescriptions).flatMap((items) => items.map((item) => item.text)),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Elements the brief forbids. Objects (projects, accessories) must come from
 * the Pin's own section (`objectEvidence`): a hat in another section never
 * allows a hat here. Materials, motifs and techniques stay article-wide.
 */
function forbiddenFor(evidence: string, objectEvidence = evidence): string[] {
  const present = new Set(
    (['materials', 'patterns', 'techniques'] as const).flatMap((category) => findTerms(evidence, category))
  );
  const presentObjects = new Set(findTerms(objectEvidence, 'objects'));
  const isPresent = (term: string) => present.has(term) || presentObjects.has(term);
  const absentProjects = (CHECKED_TERMS.objects ?? []).filter((term) => !presentObjects.has(term));
  const absentInventions = COMMON_INVENTIONS.filter((term) => !isPresent(term));
  return uniq([...absentInventions, ...absentProjects.slice(0, 12)]);
}

/**
 * The article's main project (H1 "Autumn Brioche Crochet Cardigan: Size
 * Guide…" → `cardigan`), resolved by concept (subject-concepts.ts): a
 * project named in the head of the title wins over a form or an accessory
 * ("…Cat Patterns for Ornaments, Amigurumi & Gifts" → `amigurumi`), and an
 * accessory named later ("…with a tote bag") never replaces it.
 */
export function mainArticleObject(title: string, options: { language?: string; niche?: SubjectNiche | null } = {}): string | null {
  const resolved = resolveHeadingSubject(title, options);
  if (resolved) return resolved;
  // Former rule, for objects no concept covers: the object named first.
  const normalized = normalizeForMatch(title);
  let best: { term: string; position: number } | null = null;
  for (const spellings of VISUAL_LEXICON.objects) {
    for (const spelling of spellings) {
      const position = normalized.indexOf(normalizeForMatch(spelling));
      if (position >= 0 && (!best || position < best.position)) best = { term: spellings[0], position };
    }
  }
  return best?.term ?? null;
}

interface ContractInput {
  context: WordPressArticleContext;
  section: ArticleSection;
  sectionText: string;
  subjectCheck: ArticleSubjectCheck;
  niche: SubjectNiche | null;
}

/**
 * The section's visual subject contract, or null when neither the section
 * nor the H1 names a concept (the former step-word check then applies).
 * Home Decor only uses its curated concepts (sofa, curtains, bar cart…) and
 * never inherits the H1: a room section is not "the article's sofa".
 */
export function buildVisualSubjectContract({ context, section, sectionText, subjectCheck, niche }: ContractInput): VisualSubjectContract | null {
  const options = { language: context.language, niche };
  const homeDecor = subjectCheck === 'home-decor';
  const usable = (id: string | null) => (id && (!homeDecor || isCuratedSubjectConcept(id)) ? id : null);
  const heading = section.kind === 'intro' ? context.title : section.subject;
  const own = usable(resolveHeadingSubject(heading, options));
  const inherited = !own && !homeDecor && section.kind !== 'intro' ? usable(mainArticleObject(context.title, options)) : null;
  const primary = own ?? inherited;
  const concept = primary ? subjectConcept(primary) : null;
  if (!primary || !concept) return null;

  const inSection = new Set(findSubjectConcepts(sectionText, options));
  const inArticle = findSubjectConcepts(buildArticleEvidence(context), options);
  return {
    primarySubjectId: primary,
    primarySubjectLabel: heading,
    requiredImageAnchors: [concept.imageAnchor],
    allowedSupportingElements: [...inSection].filter((id) => id !== primary),
    forbiddenElements: inArticle.filter((id) => id !== primary && !inSection.has(id)),
    sourceSectionId: section.id,
    inheritedFromTitle: Boolean(inherited),
    evidence: [inherited ? 'inherited from the article title (H1)' : section.kind === 'intro' ? 'article title (H1)' : 'section heading'],
  };
}

/**
 * Project nouns the image prompt must show: the contract's primary subject,
 * else (briefs stored before the contract) the section's own (heading), else
 * — a step section such as "1. Measure yourself and select a size" — the
 * article's main project. Empty when neither names one.
 */
function expectedProjectObjects(brief: PinVisualBrief): string[] {
  if (brief.subjectContract) return [brief.subjectContract.primarySubjectId];
  const fromSection = findTerms(`${brief.represented}\n${brief.sourceSection}`, 'objects');
  if (fromSection.length > 0) return fromSection;
  const main = mainArticleObject(brief.articleSubject);
  return main ? [main] : [];
}

function articleStepRepresented(object: string, step: string): string {
  return `${object} of this article — step: ${step}`;
}

/** The H1 project of a step brief (project check only), else null — Home Decor and headed sections never have one. */
function articleStepObject(brief: PinVisualBrief): string | null {
  if (brief.subjectContract) return brief.subjectContract.inheritedFromTitle ? brief.subjectContract.primarySubjectId : null;
  const main = mainArticleObject(brief.articleSubject);
  return main && brief.represented.startsWith(articleStepRepresented(main, '')) ? main : null;
}

export function buildPinVisualBrief(
  context: WordPressArticleContext,
  section: ArticleSection,
  descriptions: SectionImageDescription[] = [],
  evidence = buildArticleEvidence(context),
  options: { subjectCheck?: ArticleSubjectCheck; niche?: string | null; articleKind?: ArticleKind } = {}
): PinVisualBrief {
  const subjectCheck = options.subjectCheck ?? 'project';
  const sectionText = articleSectionText(context, section, descriptions);
  // TASK-FIX-089: a tip section names an action, not a project — no project
  // contract (own or inherited from the H1); the image shows the tip itself.
  // Home Decor keeps its room check.
  const tip = options.articleKind === 'tips_guide' && subjectCheck === 'project' && section.kind !== 'intro';
  const contract = tip ? null : buildVisualSubjectContract({
    context,
    section,
    sectionText,
    subjectCheck,
    niche: subjectNicheOf(findNicheProfile(options.niche)?.slug),
  });
  const described = descriptions.map((item) => cleanArticleText(item.text)).filter(Boolean);
  const attributes: VisualAttributes = mergeVisualAttributes(section.attributes, ...described.map(extractVisualAttributes));
  const sentences = sentencesOf(section.text).filter((sentence) => !/^original photo\b/i.test(sentence));
  const descriptive = sentences.filter((sentence) => {
    const found = extractVisualAttributes(sentence);
    return found.colors.length + found.patterns.length + found.materials.length + found.techniques.length + found.shapes.length + found.textures.length > 0;
  });
  const visualDetails = uniq([...described, ...descriptive, ...(descriptive.length ? [] : sentences.slice(0, 2))])
    .slice(0, MAX_DETAILS_PER_BRIEF)
    .map((detail) => clip(detail));
  // Project check only (never Home Decor): a step heading without a project
  // noun is shown as a step of the article's main project.
  const articleObject = contract?.inheritedFromTitle ? contract.primarySubjectId : null;
  // TASK-FIX-090: a project gallery section without its own project inherits
  // the H1's global subject ("air-dry clay pumpkin painting — Speckled
  // Stoneware Look"). Tips guides and other articles are unchanged.
  const global =
    !tip && !contract && options.articleKind === 'project_listicle' && subjectCheck === 'project' && section.kind === 'subject'
      ? articleGlobalSubject(context.title, context.language)
      : null;
  const represented = section.kind === 'intro'
    ? context.title
    : articleObject
      ? articleStepRepresented(articleObject, section.subject)
      : global
        ? `${global.label} — ${section.subject}`
        : section.subject;
  // Synonyms this section documents itself ("wildflowers" → floral details).
  const documented = global ? documentedSynonymTerms(sectionText, 'patterns') : [];

  return {
    sectionId: section.id,
    articleSubject: context.title,
    sourceSection: section.kind === 'intro' ? 'Introduction' : section.heading,
    represented,
    materials: attributes.materials,
    colors: attributes.colors,
    techniques: attributes.techniques,
    patterns: attributes.patterns,
    shape: attributes.shapes,
    texture: attributes.textures,
    visualDetails,
    allowedElements: uniq([
      tip
        ? `hands, tools and material clearly demonstrating this tip, action or technique: ${represented}`
        : global
          ? `the article's ${global.label} (a ${global.anchors[0]}) as the single main subject, with this section's variation "${section.subject}" shown on it`
          : `the ${represented} as the single main subject, shown as described here`,
      ...documented.map((term) => `${term} details (documented in this section)`),
      ...attributes.objects.map((object) => `${object} (as presented in this section)`),
      'a plain neutral surface or backdrop (white, cream, beige, light gray or natural wood)',
      'soft natural light',
      'at most one or two text-free styling props that do not compete with the project',
    ]),
    forbiddenElements: uniq([
      ...forbiddenFor(evidence, objectEvidenceOf(sectionText, contract)),
      ...FIXED_FORBIDDEN,
      ...(tip ? ['an invented finished project shown instead of the tip'] : []),
    ]),
    ...(contract ? { subjectContract: contract } : {}),
    ...(tip ? { focus: 'tip' as const } : {}),
    ...(global ? { globalSubject: global } : {}),
  };
}

/** What may prove an object in a Pin image: its own section, plus the primary subject a step inherits. */
function objectEvidenceOf(sectionText: string, contract: VisualSubjectContract | null | undefined): string {
  return contract ? `${sectionText}\n${contract.primarySubjectId}` : sectionText;
}

function list(values: string[], empty = 'not specified in the article — keep it plain, do not invent'): string {
  return values.length ? values.join(', ') : empty;
}

/** The brief in the fixed format shared by the text and the image prompts. */
export function formatVisualBrief(brief: PinVisualBrief): string {
  // A step ("Make and measure a gauge swatch") was drawn as a swatch alone:
  // the project itself must stay in the picture.
  const stepObject = articleStepObject(brief);
  const contract = brief.subjectContract;
  return [
    `Article subject: ${brief.articleSubject}`,
    `Source section: ${brief.sourceSection}`,
    ...(brief.focus === 'tip'
      ? [
          `Tip, action or technique represented: ${brief.represented}`,
          'Required subject: the image must clearly represent the tip, action or technique of this section (hands at work, the tool, the material at that stage); it does not need a finished project and must not invent one',
        ]
      : brief.globalSubject
        ? [
            `Article global subject (from the H1): ${brief.globalSubject.label}`,
            `Pattern or project represented: ${brief.represented}`,
            `Required subject: the image description must explicitly mention ${brief.globalSubject.anchors[0]} and must show the article's ${brief.globalSubject.label} — a ${brief.globalSubject.anchors[0]} — as the visible main subject, with this section's variation ("${brief.sourceSection}") on it; another object is not enough`,
          ]
        : [`Pattern or project represented: ${brief.represented}`]),
    ...(brief.focus === 'tip' || brief.globalSubject ? [] : contract ? subjectContractLines(contract) : stepObject
      ? [`Required subject: the image description must explicitly mention ${stepObject} and must show a ${stepObject} — this step may be shown on it (a detail, a work in progress), but a sample, tool or material alone is not enough`]
      : []),
    ...(brief.archetype ? formatArchetypeLines(brief.archetype) : []),
    `Materials: ${list(brief.materials)}`,
    `Colors: ${list(brief.colors)}`,
    `Techniques: ${list(brief.techniques)}`,
    `Shape: ${list(brief.shape)}`,
    `Texture: ${list([...brief.texture, ...brief.patterns])}`,
    `Visual details: ${brief.visualDetails.length ? brief.visualDetails.join(' | ') : 'none beyond the fields above'}`,
    `Allowed elements: ${brief.allowedElements.join('; ')}`,
    `Forbidden elements: ${brief.forbiddenElements.join('; ')}`,
  ].join('\n');
}

/** The contract as brief lines: fixed templates and canonical concept ids only. */
function subjectContractLines(contract: VisualSubjectContract): string[] {
  const id = contract.primarySubjectId;
  const anchors = contract.requiredImageAnchors.map((anchor) => `"${anchor}"`).join(' or ');
  const step = contract.inheritedFromTitle
    ? ' — this step may be shown on it (a detail, a work in progress), but a sample, tool or material alone is not enough'
    : '';
  return [
    `Required subject: the image description must explicitly mention ${id} and must show a ${id} as the visible, dominant main subject (write ${anchors})${step}`,
    `Supporting elements (only beside the ${id}, never instead of it): ${contract.allowedSupportingElements.length ? contract.allowedSupportingElements.join(', ') : 'none named in this section'}`,
    ...(contract.forbiddenElements.length ? [`Not in this section (never show them): ${contract.forbiddenElements.join(', ')}`] : []),
  ];
}

/** What a stored brief says about its section — the Home Decor check's input when the full section is not at hand. */
export function briefSectionText(brief: PinVisualBrief): string {
  return [brief.sourceSection, brief.represented, ...brief.visualDetails, ...brief.colors, ...brief.materials].join('\n');
}

/** What one section says or shows: heading, body, photo alt / caption, photo description. */
export function articleSectionText(context: WordPressArticleContext, section: ArticleSection, descriptions: SectionImageDescription[] = []): string {
  return [
    section.kind === 'intro' ? context.title : section.heading,
    section.text,
    ...section.images.flatMap((image) => [image.alt, image.caption]),
    ...descriptions.map((item) => item.text),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildArticleGrounding(
  context: WordPressArticleContext,
  pinsRequested: number,
  imageDescriptions: Record<string, SectionImageDescription[]> = {},
  options: { niche?: string | null; visualStyle?: PinterestVisualStyle; articleKind?: ArticleKind } = {}
): ArticleGrounding {
  const sectionPlan = planArticlePinSections(context, pinsRequested, { articleKind: options.articleKind });
  const assignmentPlan = options.articleKind === 'project_listicle' ? planListicleSectionAssignments(context, pinsRequested) : null;
  const evidence = buildArticleEvidence(context, imageDescriptions);
  const subjectCheck = subjectCheckForNiche(options.niche);
  const briefs: Record<string, PinVisualBrief> = {};
  const sectionTexts: Record<string, string> = {};
  for (const sectionId of new Set(sectionPlan)) {
    const section = findSection(context, sectionId);
    if (!section) continue;
    briefs[sectionId] = buildPinVisualBrief(context, section, imageDescriptions[sectionId] ?? [], evidence, { subjectCheck, niche: options.niche, articleKind: options.articleKind });
    sectionTexts[sectionId] = articleSectionText(context, section, imageDescriptions[sectionId] ?? []);
  }
  const style = options.visualStyle ?? 'classic';
  const archetypes = style === 'auto-variety' ? planVisualArchetypes(context, sectionPlan, briefs, options.niche) : undefined;
  // TASK-079: a composed slot shows one clean photo, so it drops its prompt archetype.
  const eligibility = style === 'classic' ? undefined : composerEligibility(context);
  const pinTemplates = eligibility ? planComposerTemplates(style, sectionPlan.length, archetypes, eligibility) : undefined;
  return {
    sourceType: context.sourceType,
    sectionPlan,
    briefs,
    evidence,
    enforceVocabulary: context.language === 'en',
    subjectCheck,
    language: context.language,
    sectionTexts,
    ...(archetypes ? { pinArchetypes: archetypes.map((archetype, index) => (pinTemplates?.[index] ? null : archetype)) } : {}),
    ...(eligibility && pinTemplates ? { pinTemplates, composerEligibility: eligibility } : {}),
    ...(options.articleKind ? { articleKind: options.articleKind } : {}),
    ...(assignmentPlan?.ok ? { sectionAssignments: assignmentPlan.assignments } : {}),
  };
}

export function sectionTextOf(grounding: ArticleGrounding, sectionId: string, brief: PinVisualBrief): string {
  return grounding.sectionTexts?.[sectionId] ?? briefSectionText(brief);
}

/** The <pin_plan> block of the text prompt: each Pin's section and visual brief. */
export function formatPinPlanForPrompt(grounding: ArticleGrounding): string {
  const assignments = grounding.sectionPlan.map((sectionId, index) => {
    const brief = grounding.briefs[sectionId];
    const assignment = grounding.sectionAssignments?.find((item) => item.sourceSectionId === sectionId);
    const line = assignment
      ? `Pin ${index + 1} → sourceSectionId "${sectionId}", sourceSectionIndex ${assignment.sourceSectionIndex}, sourceSectionTitle ${JSON.stringify(assignment.sourceSectionTitle)}`
      : `Pin ${index + 1} → sourceSectionId "${sectionId}" (${brief?.sourceSection ?? sectionId})`;
    const template = grounding.pinTemplates?.[index];
    if (template) {
      return [
        line,
        `  Pin ${index + 1} is a composed Pin (format: ${COMPOSER_TEMPLATE_LABELS[template]}): OmniFlow adds its title and lists afterwards.`,
        "  Its image_prompt describes one single photo of the section brief's required subject — no collage, panels, grid, written text, numbers or lists.",
      ].join('\n');
    }
    const archetype = grounding.pinArchetypes?.[index];
    if (!archetype) return line;
    // Per Pin: two Pins of one section may get different layouts.
    return [
      line,
      `  Visual archetype for Pin ${index + 1}: ${archetype.label} (${archetype.id}). Composition: ${archetype.composition}.`,
      ...(archetype.elements.length ? [`  Elements this layout may add (still from the article only): ${archetype.elements.join('; ')}`] : []),
      '  The archetype changes the layout only: the required subject of the section brief stays the dominant main subject; no written text, numbers or lists in the image.',
    ].join('\n');
  });
  const briefs = Object.values(grounding.briefs).map((brief) => {
    const block = `Visual brief for section "${brief.sectionId}":\n${formatVisualBrief(brief)}`;
    if (grounding.subjectCheck !== 'home-decor') return block;
    const sectionText = sectionTextOf(grounding, brief.sectionId, brief);
    const anchors = describeHomeAnchors(findHomeAnchors(sectionText, grounding.language), 8);
    const furniture = sectionHomeFurniture(sectionText, grounding.language);
    const absentFurniture = absentHomeFurniture(sectionText, grounding.language);
    // Home Decor scenes invite filler furniture: only the section's own pieces.
    return [
      block,
      ...(anchors.length ? [`Visual anchors the image prompt must show (English terms taken from this section): ${anchors.join(', ')}`] : []),
      `Furniture and decor allowed in the image prompt: ${furniture.length ? `only ${furniture.join(', ')} (named in this section)` : 'none named in this section — keep the room plain'}. Do not add any other furniture, storage or decorative element this section does not name.`,
      ...(absentFurniture.length ? [`Never show (this section never mentions them): ${absentFurniture.join(', ')}`] : []),
    ].join('\n');
  });
  return [
    '<pin_plan>',
    grounding.sectionAssignments
      ? 'Each Pin is built from one different project of the article. OmniFlow fixed this assignment: write the Pins in this exact order, and for each Pin copy its sourceSectionId, sourceSectionIndex and sourceSectionTitle exactly as given. Never change, swap or reuse an assignment; Pin N is always about the project on its own line:'
      : 'Each Pin is built from one real section of the article. Use exactly this assignment, in this order, and copy the id into sourceSectionId:',
    ...assignments,
    '',
    ...briefs,
    '</pin_plan>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Validation

function withoutNegatedClauses(value: string): string {
  return value.replace(/\b(?:no|without|not|never|avoid|avoiding|excluding|free of)\b[^.,;:\n]*/gi, ' ');
}

/**
 * Project claims in an image prompt that the article never makes. With
 * `objectEvidence` (the Pin's own section), objects must come from it: an
 * accessory of another section is never proof. Other categories stay
 * article-wide.
 */
export function findUngroundedVisualTerms(
  imagePrompt: string,
  evidence: string,
  objectEvidence?: string,
  options: { documentedSynonyms?: boolean } = {}
): string[] {
  const checked = withoutNegatedClauses(imagePrompt);
  const ungrounded: string[] = [];
  for (const [category, terms] of Object.entries(CHECKED_TERMS) as Array<[AttributeCategory, readonly string[]]>) {
    const inPrompt = findTerms(checked, category).filter((term) => terms.includes(term));
    if (inPrompt.length === 0) continue;
    const proof = category === 'objects' && objectEvidence !== undefined ? objectEvidence : evidence;
    // TASK-FIX-090 (project galleries): a documented synonym in the source proves the term ("wildflowers" → floral).
    const inEvidence = new Set([...findTerms(proof, category), ...(options.documentedSynonyms ? documentedSynonymTerms(proof, category) : [])]);
    ungrounded.push(...inPrompt.filter((term) => !inEvidence.has(term)));
  }
  return uniq(ungrounded);
}

/**
 * Text-only regeneration (TASK-076): the same fixed vocabularies, applied to
 * a Pin's title / description / keywords — a material, color, technique,
 * motif, project (or, Home Decor, room / furniture) the article never names.
 */
export function findUngroundedTextTerms(
  text: string,
  grounding: Pick<ArticleGrounding, 'evidence' | 'enforceVocabulary' | 'subjectCheck' | 'language'>
): string[] {
  return uniq([
    ...(grounding.enforceVocabulary ? findUngroundedVisualTerms(text, grounding.evidence) : []),
    ...(grounding.subjectCheck === 'home-decor'
      ? findUngroundedHomeTerms(withoutNegatedClauses(text), grounding.evidence, grounding.language)
      : []),
  ]);
}

/** Concepts an (English) image prompt really shows: negated mentions ("no hat") do not count. */
export function detectedImageSubjects(imagePrompt: string): string[] {
  return findSubjectConcepts(withoutNegatedClauses(imagePrompt), { language: 'en' });
}

/**
 * The contract check: the primary subject must be named. Accessories or
 * forms alone ("a kitten ornament with a Santa hat") never stand in for it.
 */
export function checkSubjectContract(imagePrompt: string, contract: VisualSubjectContract): PinterestSubjectReport & { ok: boolean } {
  const detected = detectedImageSubjects(imagePrompt);
  const ok = detected.includes(contract.primarySubjectId);
  return {
    ok,
    expected: [contract.primarySubjectId],
    detected: detected.length ? detected : ['no recognizable project'],
    missing: ok ? [] : [contract.primarySubjectId],
    required: contract.primarySubjectId,
  };
}

function mentionsSubject(imagePrompt: string, brief: PinVisualBrief): boolean {
  if (brief.subjectContract) return checkSubjectContract(imagePrompt, brief.subjectContract).ok;
  const prompt = normalizeForMatch(imagePrompt);
  const objects = expectedProjectObjects(brief);
  if (objects.length > 0) return objects.some((object) => findTerms(imagePrompt, 'objects').includes(object));
  return normalizeForMatch(brief.represented)
    .trim()
    .split(' ')
    .filter((word) => word.length > 3)
    .some((word) => prompt.includes(` ${word} `));
}

/** Fixed-vocabulary report for the project check (Crochet, Clay…): the section's project nouns. */
function projectSubjectReport(imagePrompt: string, brief: PinVisualBrief): PinterestSubjectReport {
  if (brief.subjectContract) {
    const { expected, detected, missing, required } = checkSubjectContract(imagePrompt, brief.subjectContract);
    return { expected, detected, missing, required };
  }
  const expected = expectedProjectObjects(brief);
  const detected = findTerms(imagePrompt, 'objects');
  return {
    expected,
    detected: detected.length ? detected : ['no recognizable project'],
    missing: expected.filter((term) => !detected.includes(term)),
  };
}

export interface GroundedPinCandidate {
  sourceSectionId?: string;
  /** TASK-FIX-096 (project_listicle): echoed list number of the assigned section. */
  sourceSectionIndex?: number;
  /** TASK-FIX-096 (project_listicle): echoed title — informative, never trusted. */
  sourceSectionTitle?: string;
  image_prompt: string;
}

/**
 * Article flow safeguards: every Pin names a planned section, Pins do not
 * share a section when the article has enough of them, the image prompt
 * shows that section's project and makes no project claim (material, motif,
 * technique, color, other project) absent from the article. Home Decor
 * (subjectCheck 'home-decor') checks the room, furniture, palette, material
 * and style anchors instead, in English or German (home-decor-anchors.ts).
 */
export function validateArticleGroundedPins(pins: GroundedPinCandidate[], grounding: ArticleGrounding): PinterestStrategyIssue[] {
  const issues: PinterestStrategyIssue[] = [];
  const planned = new Set(grounding.sectionPlan);
  // TASK-FIX-096: a project gallery never shares a section, whatever the plan.
  const distinctExpected =
    Boolean(grounding.sectionAssignments) || grounding.articleKind === 'project_listicle' || new Set(grounding.sectionPlan).size === grounding.sectionPlan.length;
  const used = new Map<string, number>();
  if (grounding.sectionAssignments) issues.push(...validateSectionAssignments(pins, grounding.sectionPlan, grounding.sectionAssignments));

  pins.forEach((pin, index) => {
    const sectionId = pin.sourceSectionId?.trim();
    if (!sectionId || !planned.has(sectionId)) {
      issues.push({
        code: 'unsupported-claim',
        message: `Pin ${index + 1} has no planned source section (got ${JSON.stringify(sectionId ?? null)})`,
        reason: 'MISSING_SOURCE_SECTION',
        pinIndex: index,
        field: 'sourceSectionId',
      });
      return;
    }
    const previous = used.get(sectionId);
    if (distinctExpected && previous !== undefined) {
      issues.push({
        code: 'unsupported-claim',
        message: `Pins ${previous + 1} and ${index + 1} use the same source section "${sectionId}"`,
        pinIndexes: [previous, index],
        reason: 'DUPLICATE_SOURCE_SECTION',
        pinIndex: index,
        field: 'sourceSectionId',
      });
    }
    used.set(sectionId, index);

    const brief = grounding.briefs[sectionId];
    const homeDecor = grounding.subjectCheck === 'home-decor';
    // Negated mentions ("no sofa") are not something the image shows.
    const shown = withoutNegatedClauses(pin.image_prompt);
    const sectionText = brief ? sectionTextOf(grounding, sectionId, brief) : '';
    if (brief && homeDecor) {
      const check = checkHomeDecorSubject(shown, sectionText, grounding.evidence, grounding.language);
      // A section about a named piece (bar cart, sofa) must also show that piece.
      const contract = brief.subjectContract ? checkSubjectContract(pin.image_prompt, brief.subjectContract) : null;
      if (contract && !contract.ok) {
        const { expected, detected, missing, required } = contract;
        issues.push({
          code: 'unsupported-claim',
          message: `Pin ${index + 1} image does not show its source section's main piece (expected: ${required})`,
          reason: 'IMAGE_SUBJECT_MISMATCH',
          pinIndex: index,
          field: 'image_prompt',
          subject: { expected, detected, missing, required },
        });
      } else if (!check.ok) {
        const subject: PinterestSubjectReport = {
          expected: describeHomeAnchors(check.expected),
          detected: check.detected.length ? describeHomeAnchors(check.detected) : ['generic interior'],
          missing: check.missing.slice(0, 6),
        };
        issues.push({
          code: 'unsupported-claim',
          message: `Pin ${index + 1} image does not clearly represent its source section (expected: ${subject.expected.join(', ') || 'n/a'}; detected: ${subject.detected.join(', ')})`,
          reason: 'IMAGE_SUBJECT_MISMATCH',
          pinIndex: index,
          field: 'image_prompt',
          subject,
        });
      }
    } else if (brief?.focus === 'tip') {
      // TASK-FIX-089: a tips_guide section is checked on its tip, never on a project.
      const check = checkTipImage(shown, brief.sourceSection, grounding.language);
      if (!check.ok) {
        const { expected, detected, missing } = check;
        issues.push({
          code: 'unsupported-claim',
          message: `Pin ${index + 1} image does not clearly represent the tip, action or technique of its source section`,
          reason: 'IMAGE_SUBJECT_MISMATCH',
          pinIndex: index,
          field: 'image_prompt',
          subject: { expected, detected, missing, tip: true },
        });
      }
    } else if (brief?.globalSubject) {
      // TASK-FIX-090: the H1's object with this section's variation on it.
      const { ok, ...subject } = checkGlobalSubject(shown, brief, sectionText);
      if (!ok) {
        issues.push({
          code: 'unsupported-claim',
          message: `Pin ${index + 1} image does not show its source section's project (the article's ${brief.globalSubject.anchors[0]} with this section's variation)`,
          reason: 'IMAGE_SUBJECT_MISMATCH',
          pinIndex: index,
          field: 'image_prompt',
          subject,
        });
      }
    } else if (brief && !mentionsSubject(pin.image_prompt, brief)) {
      issues.push({
        code: 'unsupported-claim',
        message: `Pin ${index + 1} image does not show its source section's project`,
        reason: 'IMAGE_SUBJECT_MISMATCH',
        pinIndex: index,
        field: 'image_prompt',
        subject: projectSubjectReport(pin.image_prompt, brief),
      });
    }
    const ungrounded = uniq([
      // Objects (projects, accessories) need proof in the Pin's own section; the rest is article-wide.
      ...(grounding.enforceVocabulary
        ? findUngroundedVisualTerms(pin.image_prompt, grounding.evidence, brief ? objectEvidenceOf(sectionText, brief.subjectContract) : undefined, {
            documentedSynonyms: grounding.articleKind === 'project_listicle',
          })
        : []),
      // Home Decor: controlled English/German vocabulary, so German articles are checked too.
      // Furniture is checked against the Pin's own section, not the whole article.
      ...(homeDecor ? findUngroundedHomeTerms(shown, grounding.evidence, grounding.language, brief ? sectionText : undefined) : []),
    ]);
    if (ungrounded.length > 0) {
      issues.push({
        code: 'unsupported-claim',
        message: `Pin ${index + 1} image adds elements absent from the article: ${ungrounded.join(', ')}`,
        reason: 'UNGROUNDED_IMAGE_ELEMENTS',
        pinIndex: index,
        field: 'image_prompt',
        // Fixed-vocabulary terms (CHECKED_TERMS, Home Decor anchors), never free model text.
        details: ungrounded,
      });
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Persistence (pins.image_analysis JSON — same pattern as the strategy angle)

export interface PersistedArticleSource {
  sourceType: ArticleSourceType;
  sectionId: string;
  brief: PinVisualBrief;
}

function parseObject(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function attachArticleSourceMetadata(imageAnalysisJson: string | null, value: PersistedArticleSource): string {
  return JSON.stringify({ ...parseObject(imageAnalysisJson), [ARTICLE_SOURCE_METADATA_KEY]: value });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function readArticleSourceMetadata(imageAnalysisJson: string | null): PersistedArticleSource | null {
  const value = parseObject(imageAnalysisJson)[ARTICLE_SOURCE_METADATA_KEY];
  if (!value || typeof value !== 'object') return null;
  const { sourceType, sectionId, brief } = value as Partial<PersistedArticleSource>;
  if ((sourceType !== 'omniflow_article' && sourceType !== 'external_wordpress_post') || typeof sectionId !== 'string') return null;
  if (!brief || typeof brief !== 'object') return null;
  const textFields = ['sectionId', 'articleSubject', 'sourceSection', 'represented'] as const;
  const listFields = ['materials', 'colors', 'techniques', 'patterns', 'shape', 'texture', 'visualDetails', 'allowedElements', 'forbiddenElements'] as const;
  if (!textFields.every((field) => typeof brief[field] === 'string')) return null;
  if (!listFields.every((field) => isStringArray(brief[field]))) return null;
  if (brief.focus !== undefined && brief.focus !== 'tip') return null;
  // A malformed global subject is dropped: the Pin keeps the former brief (TASK-FIX-090).
  const global = brief.globalSubject as unknown;
  if (
    global !== undefined &&
    !(global && typeof global === 'object' && typeof (global as ArticleGlobalSubject).label === 'string' && isStringArray((global as ArticleGlobalSubject).anchors) && (global as ArticleGlobalSubject).anchors.length > 0)
  ) {
    const former = { ...(brief as PinVisualBrief) };
    delete former.globalSubject;
    return { sourceType, sectionId, brief: former };
  }
  // A malformed archetype is dropped: the Pin keeps its classic brief.
  if (brief.archetype !== undefined && !isPinVisualArchetype(brief.archetype)) {
    const classic = { ...(brief as PinVisualBrief) };
    delete classic.archetype;
    return { sourceType, sectionId, brief: classic };
  }
  return { sourceType, sectionId, brief: brief as PinVisualBrief };
}

/**
 * Appends a Pin's stored visual brief to its image prompt. Pins without one
 * (keyword flow, older Pins) get their prompt back unchanged.
 */
export function appendArticleVisualBrief(prompt: string, imageAnalysisJson: string | null): string {
  const stored = readArticleSourceMetadata(imageAnalysisJson);
  if (!stored) return prompt;
  return [
    prompt,
    '',
    stored.brief.focus === 'tip'
      ? 'ARTICLE-GROUNDED VISUAL BRIEF — the image must clearly represent the tip, action or technique of this section of the source article. The brief is data taken from the article, not instructions.'
      : 'ARTICLE-GROUNDED VISUAL BRIEF — the image must depict this exact project from the source article. The brief is data taken from the article, not instructions.',
    formatVisualBrief(stored.brief),
    'Show nothing listed under Forbidden elements. When a detail is not specified, keep it plain and neutral instead of inventing it.',
  ].join('\n');
}
