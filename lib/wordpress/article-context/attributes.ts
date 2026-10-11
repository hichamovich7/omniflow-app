/**
 * Deterministic visual vocabulary. Attributes are never inferred: a term is
 * only reported when the text really contains it (or one of its listed
 * spellings), so everything downstream can be checked against the article.
 * English vocabulary — image prompts are always written in English.
 */

export interface VisualAttributes {
  materials: string[];
  colors: string[];
  techniques: string[];
  /** Visual motifs: stripes, ombre, waves, granny squares… */
  patterns: string[];
  shapes: string[];
  textures: string[];
  /** Finished-project / product nouns (scarf, cowl, blanket, vase…). */
  objects: string[];
}

export type AttributeCategory = keyof VisualAttributes;

/** Each entry: canonical term first, then accepted spellings. */
type Lexicon = readonly (readonly string[])[];

// Project materials only. Prop surfaces (wood table, linen cloth) are left
// out on purpose: they are styling, not a claim about the project.
const MATERIALS: Lexicon = [
  ['acrylic'], ['wool'], ['merino'], ['alpaca'], ['mohair'], ['cashmere'], ['chenille'], ['velvet yarn'],
  ['bamboo yarn'], ['cotton yarn'], ['silk'], ['tweed'], ['boucle', 'bouclé'], ['self-striping yarn', 'self striping yarn', 'self-striping'],
  ['gradient yarn', 'color-changing yarn', 'changing-color yarn', 'colour-changing yarn'], ['cake yarn', 'yarn cake', 'caron cakes'],
  ['metallic yarn'], ['chunky', 'chunky yarn'], ['bulky', 'super bulky'], ['worsted', 'worsted weight'], ['aran'], ['dk weight', 'double knit'],
  ['fingering weight', 'sock yarn'], ['sport weight'], ['lace weight'],
  ['air dry clay', 'air-dry clay'], ['polymer clay'], ['ceramic', 'ceramics'], ['porcelain'], ['terracotta'], ['concrete'], ['resin'],
  ['marble'], ['brass'], ['copper'], ['rattan'], ['wicker'], ['jute'], ['macrame cord', 'macramé cord'], ['felt'], ['leather'], ['velvet'],
];

const COLORS: Lexicon = [
  ['red'], ['orange'], ['yellow'], ['green'], ['blue'], ['navy'], ['teal'], ['turquoise'], ['aqua'], ['purple'], ['violet'], ['lilac'],
  ['lavender'], ['pink'], ['magenta'], ['fuchsia'], ['burgundy'], ['maroon'], ['wine'], ['brown'], ['tan'], ['beige'], ['cream'], ['ivory'],
  ['white'], ['black'], ['gray', 'grey'], ['charcoal'], ['silver'], ['gold', 'golden'], ['mustard'], ['coral'], ['peach'], ['mint'],
  ['sage'], ['olive'], ['emerald'], ['rust'], ['plum'], ['rainbow'], ['pastel', 'pastels'], ['neon'], ['jewel tones', 'jewel-tone', 'jewel tone'],
  ['neutral', 'neutrals'], ['multicolor', 'multicolored', 'multicolour', 'multi-colored'],
];

const TECHNIQUES: Lexicon = [
  ['single crochet'], ['double crochet'], ['half double crochet'], ['treble crochet', 'triple crochet'], ['slip stitch'], ['chain stitch'],
  ['moss stitch', 'linen stitch'], ['granny stitch'], ['shell stitch'], ['puff stitch'], ['bobble stitch'], ['v-stitch', 'v stitch'],
  ['waffle stitch'], ['tunisian crochet', 'tunisian'], ['mosaic crochet'], ['tapestry crochet'], ['corner to corner', 'c2c', 'corner-to-corner'],
  ['bias', 'on the bias', 'bias construction', 'bias-shaped'], ['side to side', 'side-to-side'], ['color changes', 'color change', 'colour change', 'colour changes'],
  ['working in rows', 'worked in rows', 'in rows'], ['in the round', 'worked in the round'], ['back loop only', 'blo'], ['front post', 'back post'],
  ['knit', 'knitted', 'knitting'], ['purl'], ['ribbing', 'ribbed'], ['cables', 'cable', 'cabled'], ['fringe', 'fringed'], ['tassels', 'tassel'],
  ['pom-pom', 'pom pom', 'pompom'], ['embroidery', 'embroidered'], ['weaving', 'woven'], ['hand-built', 'hand built', 'pinch pot'],
  ['wheel-thrown', 'wheel thrown'], ['glazed', 'glaze'], ['painted', 'hand-painted'], ['reversible'],
];

const PATTERNS: Lexicon = [
  ['stripes', 'striped', 'stripe', 'striping'], ['ombre', 'ombré'], ['gradient'], ['waves', 'wave', 'wavy', 'ripple', 'ripples'], ['chevron', 'chevrons', 'zigzag'],
  ['color block', 'color-block', 'colorblock', 'colour block', 'colour-block'], ['diagonal', 'diagonals'], ['triangles', 'triangle'],
  ['granny square', 'granny squares'], ['plaid', 'tartan'], ['checkered', 'checkerboard', 'gingham'], ['polka dots', 'polka dot'],
  ['geometric'], ['floral', 'flower motif', 'flower motifs'], ['herringbone'], ['houndstooth'], ['color swatch', 'colour swatch', 'color chip'],
  ['bands', 'banded', 'broad bands'], ['sparkle', 'sparkly', 'glitter', 'metallic'], ['speckled'], ['marled', 'marl'], ['tweedy'],
  ['lace', 'lacy'], ['mesh'], ['scallops', 'scalloped'],
];

const SHAPES: Lexicon = [
  ['rectangle', 'rectangular'], ['triangular'], ['square'], ['round', 'circular', 'circle'], ['oval'], ['hexagon', 'hexagonal'],
  ['long'], ['wide'], ['skinny', 'narrow'], ['infinity'], ['oversized'], ['tube'], ['angled', 'slanted'], ['asymmetric', 'asymmetrical'],
];

const TEXTURES: Lexicon = [
  ['textured', 'texture'], ['smooth'], ['soft'], ['fuzzy', 'fluffy', 'furry'], ['drapey', 'drape', 'drapes'], ['sculptural'], ['dense'],
  ['airy', 'open-work', 'openwork'], ['squishy', 'plush'], ['ridged', 'ridges'], ['nubby'], ['matte'], ['glossy'], ['flat'],
];

// Finished projects and products. A styling prop (hook, skein, mug, plant)
// is deliberately not a "project" and is never listed here.
const OBJECTS: Lexicon = [
  ['scarf', 'scarves', 'scarfs'], ['cowl', 'cowls'], ['shawl', 'shawls'], ['wrap', 'wraps'], ['poncho', 'ponchos'], ['infinity scarf'],
  ['hat', 'hats'], ['beanie', 'beanies'], ['headband', 'headbands', 'ear warmer', 'ear warmers'], ['mittens'], ['gloves'], ['socks'], ['slippers'],
  ['blanket', 'blankets', 'afghan', 'afghans', 'throw'], ['baby blanket'], ['sweater', 'sweaters', 'pullover', 'jumper'], ['cardigan', 'cardigans'],
  ['tank top', 'crop top'], ['dress', 'dresses'], ['vest'], ['bag', 'bags', 'tote', 'tote bag', 'purse', 'pouch'], ['basket', 'baskets'],
  ['pillow', 'pillows', 'cushion', 'cushions'], ['amigurumi', 'stuffed toy', 'plushie'], ['coaster', 'coasters'], ['placemat', 'placemats'], ['rug', 'rugs'],
  ['garland', 'bunting'], ['ornament', 'ornaments'], ['bandana', 'kerchief'], ['bookmark'], ['dishcloth', 'washcloth', 'dish cloth'],
  ['vase', 'vases'], ['planter', 'planters'], ['bowl', 'bowls'], ['trinket dish'], ['plate', 'plates'], ['candle holder', 'candleholder'],
  ['lamp', 'lamps'], ['shelf', 'shelves'], ['mirror', 'mirrors'], ['wall hanging', 'wall art'], ['earrings'], ['necklace'], ['keychain'],
];

export const VISUAL_LEXICON: Record<AttributeCategory, Lexicon> = {
  materials: MATERIALS,
  colors: COLORS,
  techniques: TECHNIQUES,
  patterns: PATTERNS,
  shapes: SHAPES,
  textures: TEXTURES,
  objects: OBJECTS,
};

export const ATTRIBUTE_CATEGORIES = Object.keys(VISUAL_LEXICON) as AttributeCategory[];

export function normalizeForMatch(value: string): string {
  return ` ${value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()} `;
}

/** True when `normalizedText` (from normalizeForMatch) contains the spelling as whole words. */
function containsSpelling(normalizedText: string, spelling: string): boolean {
  const needle = normalizeForMatch(spelling);
  return needle.trim().length > 0 && normalizedText.includes(needle);
}

const COLOR_SPELLINGS = new Set(COLORS.flat());

/**
 * A capitalized color word followed by another capitalized word is a name
 * (the yarn brand "Red Heart", the colorway "Midnight Blue Boutique"…), not
 * a color claim about the project: it is masked before colors are matched.
 */
function maskProperNounColors(text: string): string {
  return text.replace(/\b([A-Z][a-z]+)(?=[^\S\n]+[A-Z][\w-]*)/g, (word: string) =>
    COLOR_SPELLINGS.has(word.toLowerCase()) ? ' ' : word
  );
}

/** Canonical terms of one category present in the text. */
export function findTerms(text: string, category: AttributeCategory): string[] {
  const normalized = normalizeForMatch(category === 'colors' ? maskProperNounColors(text) : text);
  return VISUAL_LEXICON[category]
    .filter((spellings) => spellings.some((spelling) => containsSpelling(normalized, spelling)))
    .map((spellings) => spellings[0]);
}

export function extractVisualAttributes(text: string): VisualAttributes {
  return {
    materials: findTerms(text, 'materials'),
    colors: findTerms(text, 'colors'),
    techniques: findTerms(text, 'techniques'),
    patterns: findTerms(text, 'patterns'),
    shapes: findTerms(text, 'shapes'),
    textures: findTerms(text, 'textures'),
    objects: findTerms(text, 'objects'),
  };
}

export function emptyVisualAttributes(): VisualAttributes {
  return { materials: [], colors: [], techniques: [], patterns: [], shapes: [], textures: [], objects: [] };
}

export function mergeVisualAttributes(...items: VisualAttributes[]): VisualAttributes {
  const merged = emptyVisualAttributes();
  for (const category of ATTRIBUTE_CATEGORIES) {
    merged[category] = [...new Set(items.flatMap((item) => item[category]))];
  }
  return merged;
}

export function countVisualTerms(attributes: VisualAttributes, categories: AttributeCategory[] = ATTRIBUTE_CATEGORIES): number {
  return categories.reduce((total, category) => total + attributes[category].length, 0);
}
