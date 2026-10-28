import type { ArticleSection, WordPressArticleContext } from '@/lib/wordpress/article-context';
import { findNicheProfile } from '@/lib/niche/resolve';
import type { PinVisualBrief } from '@/lib/pinterest/article-briefs';

/**
 * Visual archetypes (TASK-078, Phase A). With "Auto variety", every Pin of
 * an article batch gets a composition family (tutorial steps, materials,
 * collage…) so a batch does not look like seven copies of one photo. The
 * archetype only changes the layout: the article stays the source of truth,
 * the visual subject contract and every safeguard stay in force, and an
 * archetype is never picked when the article does not support it.
 *
 * Deterministic: same article, niche and Pin count → same plan. No AI call,
 * no reference image, no text rendered by the image model.
 */

export { PINTEREST_VISUAL_STYLES, type PinterestVisualStyle } from '@/types/pinterest';

export const VISUAL_ARCHETYPE_IDS = [
  'hero_lifestyle',
  'tutorial_steps',
  'materials_and_tools',
  'collage_grid',
  'hands_in_action',
  'finished_project',
  'variation_showcase',
  'problem_solution',
  'product_showcase',
  'minimal_editorial',
  'recipe_card',
  'before_after',
] as const;
export type VisualArchetypeId = (typeof VISUAL_ARCHETYPE_IDS)[number];

/** Resolved archetype of one Pin — fixed templates plus article data only. Stored in the Pin's brief. */
export interface PinVisualArchetype {
  id: VisualArchetypeId;
  label: string;
  composition: string;
  /** What the layout may add, each item backed by the article. */
  elements: string[];
}

type ArchetypeNiche = 'crochet' | 'clay' | 'home-decor' | 'recipes' | 'default';

interface ArchetypeInput {
  niche: ArchetypeNiche;
  context: WordPressArticleContext;
  section: ArticleSection;
  brief: PinVisualBrief;
  /** Heading of the article's materials / ingredients section, any supported language. */
  materialsHeading: string | null;
}

interface ArchetypeDefinition {
  label: string;
  eligible: (input: ArchetypeInput) => boolean;
  composition: (subject: string) => string;
  elements: (input: ArchetypeInput, subject: string) => string[];
  /** The archetype shows more than "one or two styling props" (materials laid out, panels). */
  replacesProps?: boolean;
}

// Multilingual markers (EN, DE, FR, ES). Structure only — never copied into a prompt.
const STEP_MARKER = /\b(?:step|schritt|étape|etape|paso|round|rnd|row|runde|reihe|rang|tour|vuelta|fila)\s*\d+/gi;
const MATERIALS_HEADING =
  /^(?:materials?|supplies|tools|what you(?:'ll| will)? need|you will need|ingredients|materialien|material\b|was du brauchst|was sie brauchen|benötigt|zutaten|werkzeug|matériel|matériaux|fournitures|il vous faut|ingrédients|outils|materiales|lo que necesitas|herramientas|ingredientes|necesitarás)/i;
const PROBLEM_HEADING =
  /\b(?:mistakes?|problems?|fix(?:es|ing)?|troubleshoot\w*|avoid|fehler|probleme?|lösung\w*|vermeiden|erreurs?|problèmes?|solutions?|éviter|errores|problemas?|soluci\w+|evitar)\b/i;
const BEFORE_AFTER = /\b(?:before and after|before & after|before\/after|vorher[- ]nachher|vorher und nachher|avant[- ]après|avant et après|antes y después|antes y despues)\b/i;
const CRAFT_NICHES: readonly ArchetypeNiche[] = ['crochet', 'clay', 'default'];

function stepCount(text: string): number {
  return new Set((text.match(STEP_MARKER) ?? []).map((marker) => marker.toLowerCase().replace(/\s+/g, ''))).size;
}

/** A step section (TASK-073 inheritance) or a section that walks through at least two numbered steps. */
function isStepSection({ section, brief }: ArchetypeInput): boolean {
  return Boolean(brief.subjectContract?.inheritedFromTitle) || stepCount(section.text) >= 2;
}

function sectionText({ section }: ArchetypeInput): string {
  return `${section.heading}\n${section.text}`;
}

// One word ("chunky") is not a materials list: a flat-lay needs at least two.
const MIN_LISTED_MATERIALS = 2;

/** A materials section, or at least two materials named in the article. */
function hasMaterials({ context, materialsHeading }: ArchetypeInput): boolean {
  return context.materials.length >= MIN_LISTED_MATERIALS || materialsHeading !== null;
}

function materialsElement({ context, materialsHeading }: ArchetypeInput, subject: string): string {
  if (context.materials.length >= MIN_LISTED_MATERIALS || !materialsHeading) {
    return `only the article's own materials laid out neatly beside the ${subject}: ${context.materials.join(', ')} — no other material, brand, label or tool the article does not name`;
  }
  return `only the materials or ingredients the article lists in its section "${materialsHeading}", laid out neatly beside the ${subject} — nothing that section does not name, no brand, label or packaging`;
}

const ARCHETYPES: Record<VisualArchetypeId, ArchetypeDefinition> = {
  hero_lifestyle: {
    label: 'Lifestyle hero',
    eligible: () => true,
    composition: (subject) => `one large vertical lifestyle photo: the ${subject} shown in a natural, lived-in setting that suits it, filling most of the frame`,
    elements: () => ['a softly blurred, uncluttered real-life background that does not compete with the subject'],
  },
  tutorial_steps: {
    label: 'Step-by-step tutorial',
    eligible: (input) => input.niche !== 'home-decor' && isStepSection(input),
    composition: (subject) =>
      `vertical layout of 2 to 4 stacked photo panels showing the stages this section describes, in order, with the ${subject} visible in every panel`,
    elements: (_input, subject) => [`the ${subject} at successive stages described in this section (work in progress, then closer to finished)`],
    replacesProps: true,
  },
  materials_and_tools: {
    label: 'Materials & tools',
    eligible: (input) => input.niche !== 'home-decor' && hasMaterials(input),
    composition: (subject) => `overhead flat-lay: the ${subject} in the upper part of the frame, its materials arranged in a tidy row or grid below it`,
    elements: (input, subject) => [materialsElement(input, subject)],
    replacesProps: true,
  },
  collage_grid: {
    label: 'Collage grid',
    eligible: ({ brief }) => brief.visualDetails.length >= 2 || brief.colors.length + brief.patterns.length + brief.texture.length >= 2,
    composition: (subject) => `vertical grid of 2 to 4 photo panels showing the same ${subject} from different angles and distances (whole piece, close detail, in use)`,
    elements: (_input, subject) => [`several views of the same ${subject} only, as described in this section — never a different project`],
    replacesProps: true,
  },
  hands_in_action: {
    label: 'Hands in action',
    eligible: (input) =>
      (CRAFT_NICHES.includes(input.niche) && (isStepSection(input) || input.section.attributes.techniques.length > 0)) ||
      (input.niche === 'recipes' && isStepSection(input)),
    composition: (subject) => `close-up of a pair of hands working on the ${subject}, the subject sharp and dominant, hands cropped at the wrists`,
    elements: () => ['a pair of hands (no face, no jewelry, no visible brand), using only tools or materials this section names'],
  },
  finished_project: {
    label: 'Finished project',
    eligible: ({ niche }) => niche !== 'home-decor',
    composition: (subject) => `the finished ${subject} alone, centered, photographed from its most flattering angle on a plain backdrop`,
    elements: () => [],
  },
  variation_showcase: {
    label: 'Variations',
    eligible: ({ brief }) => brief.colors.length >= 2,
    composition: (subject) => `two or three versions of the ${subject} side by side, each in one of the colors this section names`,
    elements: ({ brief }, subject) => [`versions of the ${subject} only in these colors from the article: ${brief.colors.join(', ')}`],
    replacesProps: true,
  },
  problem_solution: {
    label: 'Problem / solution',
    eligible: (input) => PROBLEM_HEADING.test(input.section.heading),
    composition: (subject) => `vertical split: a close detail of the ${subject} illustrating the issue this section discusses (upper part), the corrected result (lower part)`,
    elements: (_input, subject) => [`only the issue and the fix this section describes, shown on the ${subject}`],
    replacesProps: true,
  },
  product_showcase: {
    label: 'Product showcase',
    eligible: ({ niche }) => niche !== 'recipes',
    composition: (subject) => `clean studio presentation: the ${subject} on a seamless backdrop with a soft shadow, generous empty space around it`,
    elements: () => [],
  },
  minimal_editorial: {
    label: 'Minimal editorial',
    eligible: () => true,
    composition: (subject) => `minimal editorial photo: the ${subject} small to medium in the frame, a calm single-color background, large quiet negative space`,
    elements: () => [],
  },
  recipe_card: {
    label: 'Recipe card',
    eligible: (input) => input.niche === 'recipes' && (input.materialsHeading !== null || isStepSection(input)),
    composition: (subject) => `editorial recipe layout: the finished ${subject} in a large top photo, smaller photo panels of its ingredients or stages below — no written text`,
    elements: (input, subject) => (input.materialsHeading ? [materialsElement(input, subject)] : [`the ${subject} at the stages this section describes`]),
    replacesProps: true,
  },
  before_after: {
    label: 'Before / after',
    eligible: (input) => BEFORE_AFTER.test(sectionText(input)),
    composition: (subject) => `vertical before/after split of the same ${subject} and the same viewpoint: the state before (upper part), the result after (lower part)`,
    elements: (_input, subject) => [`only the change this section describes, on the same ${subject}`],
    replacesProps: true,
  },
};

/** Recommended order per niche: the planner takes the first eligible archetype not used yet. */
export const NICHE_ARCHETYPE_ORDER: Record<ArchetypeNiche, readonly VisualArchetypeId[]> = {
  crochet: ['finished_project', 'tutorial_steps', 'materials_and_tools', 'hands_in_action', 'variation_showcase', 'collage_grid', 'hero_lifestyle', 'product_showcase', 'minimal_editorial', 'problem_solution', 'before_after'],
  clay: ['finished_project', 'tutorial_steps', 'materials_and_tools', 'hands_in_action', 'before_after', 'variation_showcase', 'collage_grid', 'hero_lifestyle', 'product_showcase', 'minimal_editorial', 'problem_solution'],
  'home-decor': ['hero_lifestyle', 'collage_grid', 'before_after', 'product_showcase', 'variation_showcase', 'minimal_editorial', 'problem_solution'],
  recipes: ['finished_project', 'materials_and_tools', 'recipe_card', 'tutorial_steps', 'hands_in_action', 'collage_grid', 'hero_lifestyle', 'minimal_editorial', 'variation_showcase', 'before_after'],
  default: ['hero_lifestyle', 'finished_project', 'tutorial_steps', 'materials_and_tools', 'collage_grid', 'variation_showcase', 'hands_in_action', 'product_showcase', 'minimal_editorial', 'problem_solution', 'before_after'],
};

export function archetypeNicheOf(niche: string | null | undefined): ArchetypeNiche {
  switch (findNicheProfile(niche)?.slug) {
    case 'crochet':
      return 'crochet';
    case 'clay-crafts-diy':
      return 'clay';
    case 'home-decor':
      return 'home-decor';
    case 'recipes':
      return 'recipes';
    default:
      return 'default';
  }
}

export function findMaterialsHeading(context: WordPressArticleContext): string | null {
  return context.sections.find((section) => section.kind !== 'intro' && MATERIALS_HEADING.test(section.heading.trim()))?.heading ?? null;
}

/** What the image must keep as its main subject — the contract anchor first, the brief's project otherwise. */
function subjectOf(brief: PinVisualBrief): string {
  return brief.subjectContract?.primarySubjectId ?? brief.represented;
}

/** Archetypes this section can support, in the niche's order. */
export function eligibleArchetypes(
  context: WordPressArticleContext,
  section: ArticleSection,
  brief: PinVisualBrief,
  niche: string | null | undefined
): VisualArchetypeId[] {
  const input: ArchetypeInput = { niche: archetypeNicheOf(niche), context, section, brief, materialsHeading: findMaterialsHeading(context) };
  return NICHE_ARCHETYPE_ORDER[input.niche].filter((id) => ARCHETYPES[id].eligible(input));
}

export function resolveArchetype(
  id: VisualArchetypeId,
  context: WordPressArticleContext,
  section: ArticleSection,
  brief: PinVisualBrief,
  niche: string | null | undefined
): PinVisualArchetype {
  const input: ArchetypeInput = { niche: archetypeNicheOf(niche), context, section, brief, materialsHeading: findMaterialsHeading(context) };
  const definition = ARCHETYPES[id];
  const subject = subjectOf(brief);
  return { id, label: definition.label, composition: definition.composition(subject), elements: definition.elements(input, subject) };
}

/**
 * One archetype per Pin, in Pin order. Each Pin takes the first archetype of
 * the niche order that its section supports and the batch has not used yet;
 * once every eligible one is used, the least used one (never the previous
 * Pin's when another exists). A Pin whose section supports none gets null
 * and keeps the classic brief.
 */
export function planVisualArchetypes(
  context: WordPressArticleContext,
  sectionPlan: string[],
  briefs: Record<string, PinVisualBrief>,
  niche: string | null | undefined
): (PinVisualArchetype | null)[] {
  const usage = new Map<VisualArchetypeId, number>();
  let previous: VisualArchetypeId | null = null;
  return sectionPlan.map((sectionId) => {
    const section = context.sections.find((item) => item.id === sectionId);
    const brief = briefs[sectionId];
    if (!section || !brief) {
      previous = null;
      return null;
    }
    const candidates = eligibleArchetypes(context, section, brief, niche);
    if (candidates.length === 0) {
      previous = null;
      return null;
    }
    const unused = candidates.find((id) => !usage.has(id));
    const pick =
      unused ??
      [...candidates]
        .filter((id) => id !== previous || candidates.length === 1)
        .sort((a, b) => (usage.get(a) ?? 0) - (usage.get(b) ?? 0))[0];
    usage.set(pick, (usage.get(pick) ?? 0) + 1);
    previous = pick;
    return resolveArchetype(pick, context, section, brief, niche);
  });
}

/**
 * The archetype of each returned Pin. The plan is in Pin order; a Pin whose
 * section differs from its planned slot takes the first unclaimed slot of
 * its own section, else none (classic brief).
 */
export function assignPinArchetypes(
  sectionPlan: string[],
  archetypes: (PinVisualArchetype | null)[],
  pinSectionIds: (string | undefined)[]
): (PinVisualArchetype | null)[] {
  const claimed = new Set<number>();
  return pinSectionIds.map((raw, index) => {
    const sectionId = raw?.trim();
    if (!sectionId) return null;
    const slot = sectionPlan[index] === sectionId && !claimed.has(index)
      ? index
      : sectionPlan.findIndex((planned, i) => planned === sectionId && !claimed.has(i));
    if (slot < 0) return null;
    claimed.add(slot);
    return archetypes[slot] ?? null;
  });
}

/** The brief with this Pin's archetype: the props allowance is replaced only by layouts that need more. */
export function withVisualArchetype(brief: PinVisualBrief, archetype: PinVisualArchetype | null): PinVisualBrief {
  if (!archetype) return brief;
  const replacesProps = ARCHETYPES[archetype.id].replacesProps === true;
  return {
    ...brief,
    allowedElements: [
      ...brief.allowedElements.filter((element) => !(replacesProps && element.startsWith('at most one or two'))),
      ...archetype.elements,
    ],
    archetype,
  };
}

/** Brief lines, placed after the subject contract: the archetype never outranks it. */
export function formatArchetypeLines(archetype: PinVisualArchetype): string[] {
  return [
    `Visual archetype: ${archetype.label} (${archetype.id})`,
    `Composition: ${archetype.composition}`,
    'Archetype rule: the archetype changes the layout only — the required subject stays the visible, dominant main subject, and every element still comes from the article. No written step text, numbers, labels or lists inside the image.',
  ];
}

export function isVisualArchetypeId(value: unknown): value is VisualArchetypeId {
  return typeof value === 'string' && (VISUAL_ARCHETYPE_IDS as readonly string[]).includes(value);
}

/** Shape check for an archetype read back from pins.image_analysis. */
export function isPinVisualArchetype(value: unknown): value is PinVisualArchetype {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PinVisualArchetype>;
  return (
    isVisualArchetypeId(candidate.id) &&
    typeof candidate.label === 'string' &&
    typeof candidate.composition === 'string' &&
    Array.isArray(candidate.elements) &&
    candidate.elements.every((element) => typeof element === 'string')
  );
}
