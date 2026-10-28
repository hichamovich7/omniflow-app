import { VISUAL_LEXICON, normalizeForMatch } from '@/lib/wordpress/article-context';

/**
 * Language-independent subjects of a Pin image (concepts). An article heading
 * in English, German, French or Spanish is reduced to one canonical concept
 * id ("amigurumi"); the image prompt — always English — must then name that
 * concept with one of its English spellings. Nothing is translated freely:
 * a concept exists only when the text really contains one of its spellings.
 *
 * - `aliases`: spellings that name the concept, in a heading and in an image
 *   prompt ("amigurumi", "Häkeltier", "peluche au crochet").
 * - `headingHints`: words that only point to the concept in a heading of its
 *   niche ("Christmas Cat" in a Crochet article → amigurumi). Never proof in
 *   an image prompt: "a tabby cat wearing a hat" is a real cat.
 * - `supporting`: concepts that may appear beside it, never instead of it.
 * - `ambiguous`: spellings that never count as this concept.
 * Generic words (object, item, craft, decoration, clothing…) are never a
 * concept: GENERIC_SUBJECT_TERMS, checked by the tests.
 */

export type SubjectNiche = 'crochet' | 'clay-crafts-diy' | 'home-decor' | 'recipes';
export type SubjectLanguage = 'en' | 'de' | 'fr' | 'es';

/**
 * project: the finished make (amigurumi, cardigan, vase);
 * form: what a project is used as (ornament, bauble) — loses to a project
 *   named in the same clause;
 * accessory: worn or added by another subject (hat, scarf on a figure) —
 *   loses to both.
 */
export type SubjectRole = 'project' | 'form' | 'accessory';

type Spellings = Partial<Record<SubjectLanguage, readonly string[]>>;

export interface SubjectConcept {
  id: string;
  niches: readonly SubjectNiche[];
  role: SubjectRole;
  /** Normalized English anchor written into the image prompt ("amigurumi crochet toy"). */
  imageAnchor: string;
  aliases: Spellings;
  headingHints?: Spellings;
  supporting?: readonly string[];
  ambiguous?: readonly string[];
}

export const GENERIC_SUBJECT_TERMS: readonly string[] = [
  'object', 'item', 'thing', 'piece', 'craft', 'crafts', 'project', 'decoration', 'decor', 'clothing', 'clothes', 'outfit',
  'fashion', 'garment', 'accessory', 'product', 'toy', 'gift',
  'objet', 'article', 'décoration', 'vêtement', 'tenue', 'mode', 'cadeau', 'jouet',
  'gegenstand', 'artikel', 'dekoration', 'deko', 'kleidung', 'outfit', 'mode', 'geschenk', 'spielzeug',
  'objeto', 'artículo', 'decoración', 'ropa', 'prenda', 'moda', 'regalo', 'juguete',
];

const CROCHET_ANIMALS = [
  'cat', 'kitten', 'kitty', 'bear', 'teddy bear', 'bunny', 'rabbit', 'dog', 'puppy', 'fox', 'owl', 'octopus', 'unicorn', 'dinosaur',
  'elephant', 'penguin', 'mouse', 'frog', 'turtle', 'whale', 'giraffe', 'lion', 'monkey', 'reindeer', 'snowman', 'gnome', 'doll',
];

// Curated concepts. Lexicon objects without an entry here still become a
// basic English concept (see CONCEPTS below), so nothing the article
// vocabulary already knows is lost.
const CURATED: readonly SubjectConcept[] = [
  // Crochet
  {
    id: 'amigurumi', niches: ['crochet'], role: 'project', imageAnchor: 'amigurumi crochet toy',
    aliases: {
      en: ['amigurumi', 'amigurumis', 'stuffed toy', 'stuffed toys', 'plushie', 'plushies', 'crochet toy', 'crochet toys', 'crocheted toy', 'crocheted toys', 'crochet plush', 'crocheted plush', 'stuffed crochet animal', 'crochet stuffed animal'],
      de: ['amigurumi', 'häkeltier', 'häkeltiere', 'häkelfigur', 'häkelfiguren', 'gehäkeltes kuscheltier', 'gehäkelte kuscheltiere', 'kuscheltier', 'kuscheltiere'],
      fr: ['amigurumi', 'amigurumis', 'peluche au crochet', 'peluches au crochet', 'doudou au crochet', 'animal au crochet', 'animaux au crochet', 'jouet au crochet'],
      es: ['amigurumi', 'amigurumis', 'muñeco de crochet', 'muñecos de crochet', 'muñeco de ganchillo', 'muñecos de ganchillo', 'peluche de crochet', 'peluche de ganchillo'],
    },
    headingHints: {
      en: CROCHET_ANIMALS,
      de: ['katze', 'kätzchen', 'bär', 'teddybär', 'hase', 'hund', 'fuchs', 'eule', 'krake', 'einhorn', 'dinosaurier', 'elefant', 'pinguin', 'maus', 'frosch', 'schildkröte', 'wal', 'giraffe', 'löwe', 'affe', 'rentier', 'schneemann', 'wichtel', 'puppe'],
      fr: ['chat', 'chaton', 'ours', 'ourson', 'lapin', 'chien', 'chiot', 'renard', 'hibou', 'chouette', 'pieuvre', 'licorne', 'dinosaure', 'éléphant', 'pingouin', 'souris', 'grenouille', 'tortue', 'baleine', 'girafe', 'lion', 'singe', 'renne', 'bonhomme de neige', 'lutin', 'poupée'],
      es: ['gato', 'gatito', 'oso', 'osito', 'conejo', 'perro', 'perrito', 'zorro', 'búho', 'pulpo', 'unicornio', 'dinosaurio', 'elefante', 'pingüino', 'ratón', 'rana', 'tortuga', 'ballena', 'jirafa', 'león', 'mono', 'reno', 'muñeco de nieve', 'gnomo', 'muñeca'],
    },
    supporting: ['hat', 'scarf', 'ornament'],
    ambiguous: ['toy', 'plush'],
  },
  {
    id: 'cardigan', niches: ['crochet'], role: 'project', imageAnchor: 'crochet cardigan',
    aliases: {
      en: ['cardigan', 'cardigans', 'coatigan', 'coatigans'],
      de: ['cardigan', 'strickjacke', 'häkeljacke', 'häkeljacken'],
      fr: ['cardigan', 'gilet', 'gilet au crochet'],
      es: ['cárdigan', 'cardigan', 'chaqueta de punto', 'rebeca'],
    },
    supporting: ['bag', 'scarf'],
  },
  {
    id: 'scarf', niches: ['crochet'], role: 'project', imageAnchor: 'crochet scarf',
    aliases: {
      en: ['scarf', 'scarves', 'scarfs'],
      de: ['schal', 'schals', 'häkelschal'],
      fr: ['écharpe', 'écharpes'],
      es: ['bufanda', 'bufandas'],
    },
  },
  {
    id: 'sweater', niches: ['crochet'], role: 'project', imageAnchor: 'crochet sweater',
    aliases: {
      en: ['sweater', 'sweaters', 'pullover', 'jumper'],
      de: ['pullover', 'pulli', 'häkelpullover'],
      fr: ['pull', 'pulls', 'pull au crochet'],
      es: ['suéter', 'jersey', 'jerséis'],
    },
  },
  {
    id: 'hat', niches: ['crochet'], role: 'accessory', imageAnchor: 'crochet hat',
    aliases: {
      en: ['hat', 'hats', 'santa hat', 'santa hats'],
      de: ['mütze', 'mützen', 'weihnachtsmütze', 'hut'],
      fr: ['bonnet', 'bonnets', 'chapeau', 'bonnet de noël'],
      es: ['gorro', 'gorros', 'sombrero', 'gorro de papá noel'],
    },
  },
  {
    id: 'ornament', niches: ['crochet', 'clay-crafts-diy'], role: 'form', imageAnchor: 'crochet ornament',
    aliases: {
      en: ['ornament', 'ornaments', 'bauble', 'baubles', 'tree ornament', 'christmas ornament'],
      de: ['christbaumschmuck', 'baumschmuck', 'baumanhänger', 'weihnachtsanhänger', 'christbaumkugel'],
      fr: ['ornement', 'ornements', 'suspension de noël', 'boule de noël'],
      es: ['adorno', 'adornos', 'adorno navideño', 'adornos navideños', 'colgante navideño'],
    },
  },
  // Clay
  {
    id: 'vase', niches: ['clay-crafts-diy', 'home-decor'], role: 'project', imageAnchor: 'clay vase',
    aliases: { en: ['vase', 'vases', 'bud vase'], de: ['vase', 'vasen'], fr: ['vase', 'vases'], es: ['jarrón', 'jarrones', 'florero'] },
  },
  {
    id: 'trinket dish', niches: ['clay-crafts-diy'], role: 'project', imageAnchor: 'clay trinket dish',
    aliases: {
      en: ['trinket dish', 'trinket dishes', 'ring dish', 'jewelry dish'],
      de: ['schmuckschale', 'schmuckschalen', 'ringschale'],
      fr: ['vide-poche', 'vide poche', 'coupelle à bijoux'],
      es: ['joyero de arcilla', 'platito para joyas', 'bandeja para joyas'],
    },
  },
  {
    id: 'coaster', niches: ['clay-crafts-diy', 'crochet'], role: 'project', imageAnchor: 'clay coaster',
    aliases: { en: ['coaster', 'coasters'], de: ['untersetzer'], fr: ['dessous de verre'], es: ['posavasos'] },
  },
  {
    id: 'charm', niches: ['clay-crafts-diy'], role: 'project', imageAnchor: 'clay charm',
    aliases: { en: ['charm', 'charms', 'clay charm', 'clay charms'], de: ['anhänger', 'charm'], fr: ['breloque', 'breloques'], es: ['dije', 'dijes', 'colgante'] },
  },
  // Home Decor
  {
    id: 'sofa', niches: ['home-decor'], role: 'project', imageAnchor: 'sofa',
    aliases: { en: ['sofa', 'sofas', 'couch', 'sectional', 'loveseat'], de: ['sofa', 'couch'], fr: ['canapé', 'canapés', 'sofa'], es: ['sofá', 'sofás'] },
    supporting: ['cushions', 'throw blanket', 'coffee table'],
  },
  {
    id: 'curtains', niches: ['home-decor'], role: 'project', imageAnchor: 'curtains',
    aliases: { en: ['curtains', 'curtain', 'drapes'], de: ['vorhang', 'vorhänge', 'gardine', 'gardinen'], fr: ['rideau', 'rideaux'], es: ['cortina', 'cortinas'] },
  },
  {
    id: 'bar cart', niches: ['home-decor'], role: 'project', imageAnchor: 'bar cart',
    aliases: { en: ['bar cart', 'bar carts', 'drinks trolley'], de: ['barwagen', 'servierwagen'], fr: ['chariot de bar', 'desserte de bar'], es: ['carrito de bar', 'carritos de bar'] },
  },
  {
    id: 'coffee table', niches: ['home-decor'], role: 'project', imageAnchor: 'coffee table',
    aliases: { en: ['coffee table', 'coffee tables'], de: ['couchtisch', 'couchtische', 'sofatisch'], fr: ['table basse', 'tables basses'], es: ['mesa de centro', 'mesas de centro'] },
  },
  // Recipes — extensible: one entry per dish, ingredients as supporting terms.
  {
    id: 'banana bread', niches: ['recipes'], role: 'project', imageAnchor: 'loaf of banana bread',
    aliases: { en: ['banana bread'], de: ['bananenbrot'], fr: ['pain à la banane', 'banana bread'], es: ['pan de plátano', 'pan de banana'] },
    supporting: ['banana', 'walnuts'],
  },
  {
    id: 'lasagna', niches: ['recipes'], role: 'project', imageAnchor: 'baked lasagna',
    aliases: { en: ['lasagna', 'lasagne'], de: ['lasagne'], fr: ['lasagnes', 'lasagne'], es: ['lasaña', 'lasañas'] },
    supporting: ['tomato sauce', 'basil'],
  },
  {
    id: 'chocolate chip cookies', niches: ['recipes'], role: 'project', imageAnchor: 'chocolate chip cookies',
    aliases: { en: ['chocolate chip cookies', 'chocolate chip cookie'], de: ['schokoladenkekse', 'schoko cookies'], fr: ['cookies aux pépites de chocolat'], es: ['galletas con chispas de chocolate'] },
  },
  {
    id: 'soup', niches: ['recipes'], role: 'project', imageAnchor: 'bowl of soup',
    aliases: { en: ['soup', 'soups'], de: ['suppe', 'suppen'], fr: ['soupe', 'soupes', 'velouté'], es: ['sopa', 'sopas', 'crema'] },
  },
];

const ALL_NICHES: readonly SubjectNiche[] = ['crochet', 'clay-crafts-diy', 'home-decor', 'recipes'];

/** Curated concepts plus a basic English concept for every other article-lexicon object. */
export const SUBJECT_CONCEPTS: readonly SubjectConcept[] = (() => {
  const curated = new Set(CURATED.map((concept) => concept.id));
  const fromLexicon: SubjectConcept[] = VISUAL_LEXICON.objects
    .filter((spellings) => !curated.has(spellings[0]))
    .map((spellings) => ({ id: spellings[0], niches: ALL_NICHES, role: 'project', imageAnchor: spellings[0], aliases: { en: spellings } }));
  return [...CURATED, ...fromLexicon];
})();

const BY_ID = new Map(SUBJECT_CONCEPTS.map((concept) => [concept.id, concept]));
const CURATED_IDS = new Set(CURATED.map((concept) => concept.id));

/** True for a hand-written concept (aliases in four languages), false for a basic lexicon one. */
export function isCuratedSubjectConcept(id: string): boolean {
  return CURATED_IDS.has(id);
}

export function subjectConcept(id: string): SubjectConcept | null {
  return BY_ID.get(id) ?? null;
}

export function subjectLanguage(language: string | null | undefined): SubjectLanguage {
  const code = (language ?? 'en').toLowerCase().slice(0, 2);
  return code === 'de' || code === 'fr' || code === 'es' ? code : 'en';
}

const GENERIC = new Set(GENERIC_SUBJECT_TERMS.map((term) => normalizeForMatch(term).trim()));

/** True when a spelling is only generic words ("crochet decoration" is not; "decoration" is). */
export function isGenericSubjectTerm(spelling: string): boolean {
  return normalizeForMatch(spelling).trim().split(' ').every((word) => GENERIC.has(word));
}

const PLURALS: Record<SubjectLanguage, readonly string[]> = {
  en: ['', 's', 'es'],
  de: ['', 'e', 'n', 'en', 's', 'er'],
  fr: ['', 's', 'x'],
  es: ['', 's', 'es'],
};

/** First position of a spelling in `normalized` (normalizeForMatch form), or -1. */
function positionOf(normalized: string, spelling: string, language: SubjectLanguage): number {
  const needle = normalizeForMatch(spelling).trim();
  if (!needle || isGenericSubjectTerm(needle)) return -1;
  let best = -1;
  for (const plural of PLURALS[language]) {
    const at = normalized.indexOf(` ${needle}${plural} `);
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  return best;
}

function spellingsFor(entry: Spellings | undefined, language: SubjectLanguage): string[] {
  if (!entry) return [];
  // English spellings always count: blogs in every language say "amigurumi".
  return [...new Set([...(entry.en ?? []), ...(language === 'en' ? [] : entry[language] ?? [])])];
}

function inNiche(concept: SubjectConcept, niche: SubjectNiche | null): boolean {
  return niche === null || concept.niches.includes(niche);
}

interface ConceptMatch {
  id: string;
  role: SubjectRole;
  position: number;
}

function matchConcepts(text: string, language: SubjectLanguage, niche: SubjectNiche | null, kind: 'aliases' | 'headingHints'): ConceptMatch[] {
  const normalized = normalizeForMatch(text);
  const matches: ConceptMatch[] = [];
  for (const concept of SUBJECT_CONCEPTS) {
    if (!inNiche(concept, niche)) continue;
    // Heading hints are niche-specific: without a known niche they never apply.
    if (kind === 'headingHints' && niche === null) continue;
    const ambiguous = new Set((concept.ambiguous ?? []).map((term) => normalizeForMatch(term).trim()));
    const positions = spellingsFor(concept[kind], language)
      .filter((spelling) => !ambiguous.has(normalizeForMatch(spelling).trim()))
      .map((spelling) => positionOf(normalized, spelling, language))
      .filter((position) => position >= 0);
    if (positions.length) matches.push({ id: concept.id, role: concept.role, position: Math.min(...positions) });
  }
  // A longer spelling inside a match ("infinity scarf") wins over the shorter concept at the same place.
  return matches.sort((a, b) => a.position - b.position);
}

/** Concept ids named in a text (aliases only — what an English image prompt shows). */
export function findSubjectConcepts(text: string, options: { language?: string; niche?: SubjectNiche | null } = {}): string[] {
  return matchConcepts(text, subjectLanguage(options.language), options.niche ?? null, 'aliases').map((match) => match.id);
}

const ROLE_RANK: Record<SubjectRole, number> = { project: 0, form: 1, accessory: 2 };

// Words that open a secondary part of a heading: "Cat bauble with a removable
// hat", "Santa hat for a real cat", "Mütze mit Bommel", "chat avec bonnet".
const SECONDARY_MARKERS: Record<SubjectLanguage, readonly string[]> = {
  en: ['with', 'wearing', 'featuring', 'plus', 'for', 'and', 'in'],
  de: ['mit', 'für', 'und', 'im', 'in'],
  fr: ['avec', 'pour', 'et', 'en'],
  es: ['con', 'para', 'y', 'en'],
};

/** Head clauses of a heading: each ":" / " – " part, cut before its first secondary marker. */
function headClauses(heading: string, language: SubjectLanguage): string[] {
  const markers = new Set([...SECONDARY_MARKERS.en, ...(language === 'en' ? [] : SECONDARY_MARKERS[language])]);
  return heading
    .split(/\s*[:|–—]\s*|\s+-\s+/)
    .map((part) => {
      const words = normalizeForMatch(part).trim().split(' ');
      const cut = words.findIndex((word, index) => index > 0 && markers.has(word));
      return (cut > 0 ? words.slice(0, cut) : words).join(' ');
    })
    .filter(Boolean);
}

function pick(matches: ConceptMatch[]): string | null {
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.position - b.position)[0].id;
}

/**
 * The single concept a heading presents, or null. In order:
 * 1. a concept named in a head clause (projects before forms before
 *    accessories): "No-sew cat bauble with a removable hat" → ornament;
 * 2. a heading hint of the niche in a head clause: "Chloe the Christmas Cat:
 *    an interactive ePattern" → amigurumi;
 * 3. a concept named anywhere else in the heading.
 */
export function resolveHeadingSubject(heading: string, options: { language?: string; niche?: SubjectNiche | null } = {}): string | null {
  const language = subjectLanguage(options.language);
  const niche = options.niche ?? null;
  const heads = headClauses(heading, language);
  for (const head of heads) {
    const found = pick(matchConcepts(head, language, niche, 'aliases'));
    if (found) return found;
  }
  for (const head of heads) {
    const found = pick(matchConcepts(head, language, niche, 'headingHints'));
    if (found) return found;
  }
  return pick(matchConcepts(heading, language, niche, 'aliases'));
}

/** NicheProfile slug → concept niche (null: every concept, no heading hint). */
export function subjectNicheOf(slug: string | null | undefined): SubjectNiche | null {
  return slug && (ALL_NICHES as readonly string[]).includes(slug) ? (slug as SubjectNiche) : null;
}
