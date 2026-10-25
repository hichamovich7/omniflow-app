/**
 * Home Organization & Decor subject check (TASK-067). A Home Decor section
 * presents a room, furniture, a palette, materials or a style — not a
 * "project" — and the article may be German while the image prompt is always
 * English. Both sides are reduced to the canonical English terms of this
 * controlled vocabulary: nothing is translated freely, a term exists only
 * when the article (or the prompt) really contains one of its spellings.
 *
 * German spellings are written in the German normalization (ä→ae, ö→oe,
 * ü→ue, ß→ss, lowercase) and match:
 * - "stem"  → the word, an inflected form (grüne, Schränken) or the head of a
 *   compound when the stem has 4+ letters (Salbeigrün, Eichenholz);
 * - "stem*" → also the first part of a compound (Küchenschrank, Messinggriff);
 * - "=stem" → the word or an inflected form only (rot, Rost ≠ Frost).
 */

export type HomeAnchorCategory = 'room' | 'furniture' | 'color' | 'material' | 'style' | 'mood';

interface HomeAnchor {
  term: string;
  category: HomeAnchorCategory;
  en: readonly string[];
  de: readonly string[];
  /** Checked against the article: shown in the image but absent from the article = invented. */
  checked?: boolean;
}

function anchors(category: HomeAnchorCategory, entries: Array<[string, string[], string[], boolean?]>): HomeAnchor[] {
  return entries.map(([term, en, de, checked]) => ({ term, category, en: [term, ...en], de, checked: checked ?? false }));
}

const ROOMS = anchors('room', [
  ['kitchen', ['kitchens', 'kitchenette'], ['kueche*', 'kochnische', 'kochbereich']],
  ['living room', ['lounge', 'family room', 'sitting room'], ['wohnzimmer*', 'wohnbereich', 'wohnraum', 'wohnraeume']],
  ['bedroom', ['bedrooms', 'master bedroom'], ['schlafzimmer*', 'schlafbereich']],
  ['bathroom', ['bathrooms', 'powder room', 'ensuite'], ['badezimmer*', '=bad', 'gaestebad', 'duschbad']],
  ['dining room', ['dining area', 'dining nook'], ['esszimmer*', 'essbereich', 'essecke']],
  ['home office', ['office', 'study', 'workspace'], ['arbeitszimmer*', 'homeoffice', 'buero', 'arbeitsecke']],
  ['kids room', ['kids room', 'nursery', 'children s room', 'childrens room', 'playroom'], ['kinderzimmer*', 'babyzimmer', 'spielzimmer']],
  ['entryway', ['hallway', 'foyer', 'mudroom', 'entrance hall'], ['flur*', 'eingangsbereich', 'diele']],
  ['balcony', ['patio', 'terrace'], ['balkon*', 'terrasse']],
  ['laundry room', ['laundry'], ['waschkueche', 'hauswirtschaftsraum', 'waschraum']],
  ['pantry', [], ['speisekammer', 'vorratsraum']],
]);

const FURNITURE = anchors('furniture', [
  ['sofa', ['couch', 'sectional', 'loveseat'], ['sofa*', 'couch'], true],
  ['chair', ['armchair', 'armchairs', 'accent chair', 'lounge chair'], ['stuhl', 'stuehl', 'sessel*'], true],
  ['bar stool', ['stool', 'barstool', 'counter stool'], ['barhocker', 'hocker'], true],
  ['table', ['coffee table', 'side table', 'dining table', 'console table'], ['=tisch', 'couchtisch', 'esstisch', 'beistelltisch', 'sofatisch', 'kuechentisch', 'holztisch', 'konsolentisch']],
  ['desk', [], ['schreibtisch'], true],
  ['bed', ['headboard', 'bed frame'], ['bett*', 'kopfteil'], true],
  ['cabinets', ['cabinet', 'cabinetry', 'cupboard', 'cupboards'], ['schrank*', 'schraenk', 'oberschrank', 'unterschrank']],
  ['kitchen island', ['island', 'peninsula'], ['kuecheninsel', 'insel'], true],
  ['countertop', ['countertops', 'worktop', 'counter', 'counters'], ['arbeitsplatte']],
  ['shelves', ['shelf', 'shelving', 'bookshelf', 'bookcase', 'open shelves'], ['regal*', 'wandboard'], true],
  ['wardrobe', ['armoire'], ['kleiderschrank'], true],
  ['dresser', ['chest of drawers'], ['kommode'], true],
  ['sideboard', ['credenza'], ['sideboard', 'anrichte'], true],
  ['bathtub', ['tub', 'freestanding tub'], ['badewanne', 'wanne'], true],
  ['sink', ['basin', 'vanity'], ['waschbecken', 'spuele', 'waschtisch']],
  ['tiles', ['tile', 'backsplash'], ['fliese*', 'kacheln']],
  ['fireplace', ['mantel'], ['kamin*'], true],
  ['bench', [], ['sitzbank'], true],
  ['rug', ['rugs', 'carpet'], ['teppich*']],
  ['curtains', ['curtain', 'drapes'], ['vorhang', 'vorhaeng', 'gardine']],
  ['cushions', ['cushion', 'pillow', 'pillows', 'throw pillows'], ['kissen', 'zierkissen']],
  ['throw blanket', ['blanket', 'blankets', 'throw'], ['wolldecke', 'kuscheldecke', 'tagesdecke', 'plaid']],
  ['lamp', ['lamps', 'lighting', 'pendant light', 'pendant lights', 'pendant', 'chandelier', 'sconce', 'floor lamp'], ['lampe*', 'leuchte', 'kronleuchter']],
  ['mirror', ['mirrors'], ['spiegel*']],
  ['plants', ['plant', 'houseplant', 'houseplants', 'greenery'], ['pflanze*']],
  ['vase', ['vases'], ['vase*']],
  ['wall art', ['artwork', 'art print', 'gallery wall', 'framed print', 'poster'], ['wandbild', 'kunstdruck', 'bilderwand', 'poster']],
  ['baskets', ['basket'], ['korb*', 'koerbe']],
  ['storage bins', ['storage bin', 'storage box', 'storage boxes', 'bins', 'organizer', 'organizers', 'containers'], ['aufbewahrung*', 'kiste', 'behaelter']],
  ['drawers', ['drawer'], ['schublade*']],
  ['coat rack', ['coat hooks', 'hooks'], ['garderobe', 'haken']],
  ['bedding', ['bed linen', 'duvet'], ['bettwaesche']],
  ['candles', ['candle'], ['kerze*']],
  ['wallpaper', [], ['tapete*']],
]);

// Neutral colors stay unchecked: they are backdrops (white wall, gray floor).
// Color words that are often a plant, a food or a prop (olive tree, mint
// leaves, terracotta pot, lavender sprig) are also left unchecked.
const COLORS = anchors('color', [
  ['red', ['reds'], ['=rot', 'weinrot', 'rostrot', 'knallrot'], true],
  ['orange', [], ['orange', 'orangen', 'orangefarben', 'rostorange'], true],
  ['yellow', [], ['gelb'], true],
  ['mustard', ['mustard yellow', 'ochre', 'ocher'], ['senf*', '=ocker', 'ockergelb'], true],
  ['green', ['greens'], ['gruen'], true],
  ['sage', ['sage green'], ['salbei*']],
  ['olive', ['olive green'], ['oliv*']],
  ['emerald', [], ['smaragd*'], true],
  ['mint', [], ['mint*']],
  ['blue', ['blues'], ['blau'], true],
  ['navy', ['navy blue', 'midnight blue'], ['marineblau', 'navy', 'nachtblau'], true],
  ['teal', ['petrol'], ['petrol'], true],
  ['turquoise', ['aqua'], ['tuerkis'], true],
  ['pink', ['blush'], ['rosa*', 'pink'], true],
  ['purple', ['violet', 'aubergine'], ['lila*', 'violett'], true],
  ['lavender', ['lilac'], ['lavendel*', 'flieder']],
  ['terracotta', ['terra cotta'], ['terrakotta*', 'terracotta']],
  ['rust', ['burnt orange'], ['=rost', 'rostrot', 'rostorange'], true],
  ['burgundy', ['wine red', 'oxblood', 'maroon'], ['bordeaux', 'weinrot', 'burgunder'], true],
  ['coral', [], ['koralle*'], true],
  ['peach', ['apricot'], ['pfirsich*', 'apricot', 'aprikose']],
  ['brown', ['chocolate', 'caramel', 'cognac'], ['braun', 'cognac', 'karamell']],
  ['beige', ['sand', 'taupe', 'greige'], ['beige', '=sand', 'taupe']],
  ['white', ['off white', 'ivory'], ['weiss']],
  ['cream', [], ['creme*', 'cremeweiss']],
  ['gray', ['grey', 'charcoal', 'anthracite'], ['grau', 'anthrazit']],
  ['black', [], ['schwarz']],
  ['gold', ['golden'], ['gold', 'golden']],
]);

// Wood and linen are the usual neutral surfaces of a styled photo: positive
// anchors only, never "invented".
const MATERIALS = anchors('material', [
  ['wood', ['wooden', 'oak', 'walnut', 'pine', 'timber', 'teak', 'birch'], ['holz*', 'eiche*', 'nussbaum', '=kiefer', 'teak', 'birke']],
  ['metal', ['steel', 'iron', 'wrought iron', 'aluminum', 'aluminium'], ['metall*', 'stahl', 'eisen', 'edelstahl'], true],
  ['brass', [], ['messing*'], true],
  ['copper', [], ['kupfer*'], true],
  ['marble', [], ['marmor*'], true],
  ['travertine', [], ['travertin*'], true],
  ['stone', ['natural stone', 'granite'], ['stein', 'naturstein', 'granit'], true],
  ['concrete', ['cement'], ['beton*'], true],
  ['glass', [], ['glas']],
  ['rattan', ['wicker'], ['rattan*', 'korbgeflecht', 'geflecht'], true],
  ['jute', ['sisal', 'seagrass'], ['jute*', 'sisal', 'seegras'], true],
  ['linen', [], ['leinen*']],
  ['velvet', [], ['=samt', 'samtsofa', 'samtsessel', 'samtvorhang', 'samtvorhaeng', 'samtig'], true],
  ['boucle', [], ['boucle'], true],
  ['leather', [], ['leder*'], true],
  ['ceramic', ['ceramics', 'stoneware', 'porcelain'], ['keramik*', 'steingut', 'porzellan']],
  ['limewash', ['lime wash', 'plaster'], ['kalkfarbe', 'kalkputz', 'lehmputz']],
]);

const STYLES = anchors('style', [
  ['scandinavian', ['scandi', 'nordic', 'hygge'], ['skandinavisch*', 'skandi', 'nordisch*', 'hygge']],
  ['boho', ['bohemian'], ['boho*', 'bohemian']],
  ['industrial', [], ['industrial', 'industrie*', 'industriell*']],
  ['mid century', ['mid century modern', 'midcentury', 'retro'], ['mid century', 'midcentury', 'retro']],
  ['vintage', ['antique'], ['vintage', 'antik*']],
  ['minimalist', ['minimal', 'minimalism'], ['minimalistisch*', 'minimalismus']],
  ['modern', ['contemporary'], ['modern*']],
  ['farmhouse', ['rustic', 'country', 'cottage', 'cottagecore'], ['landhaus*', 'rustikal*', 'cottage']],
  ['japandi', ['wabi sabi'], ['japandi', 'wabi sabi']],
  ['coastal', ['beach house', 'nautical'], ['maritim*']],
  ['eclectic', ['maximalist'], ['eklektisch*', 'maximalistisch*']],
  ['art deco', [], ['art deco']],
]);

const MOODS = anchors('mood', [
  ['cozy', ['cosy', 'snug'], ['gemuetlich*', 'kuschelig*', 'behaglich*']],
  ['bright', ['airy', 'light filled', 'sunlit'], ['=hell', 'lichtdurchflutet*']],
  ['moody', ['dark', 'dramatic'], ['dunkel*', 'dramatisch*']],
  ['calm', ['serene', 'relaxing', 'tranquil', 'peaceful'], ['ruhig*', 'entspannt*', 'harmonisch*']],
  ['colorful', ['colourful', 'bold', 'vibrant', 'playful'], ['bunt*', 'farbenfroh*', 'mutig*']],
  ['elegant', ['luxurious', 'luxury'], ['elegant*', 'luxurioes*']],
]);

const HOME_ANCHORS: readonly HomeAnchor[] = [...ROOMS, ...FURNITURE, ...COLORS, ...MATERIALS, ...STYLES, ...MOODS];
const CATEGORY_ORDER: HomeAnchorCategory[] = ['room', 'furniture', 'color', 'material', 'style', 'mood'];
const CORE_CATEGORIES: ReadonlySet<HomeAnchorCategory> = new Set(['room', 'furniture', 'color', 'material', 'style']);
const BY_TERM = new Map(HOME_ANCHORS.map((anchor) => [anchor.term, anchor]));

/** German inflection endings accepted after a stem (grün → grüne, grünen, grüner…). */
const INFLECTIONS = ['', 'e', 'n', 'en', 'er', 'es', 'em', 'ern', 's'];

/** Lowercase, ä→ae ö→oe ü→ue ß→ss, other accents dropped, punctuation → space. */
export function normalizeGerman(value: string): string {
  return ` ${value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()} `;
}

function normalizeEnglish(value: string): string {
  return ` ${value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()} `;
}

/** Whole words, with a simple English plural on the last word. */
function containsEnglish(normalized: string, spelling: string): boolean {
  const needle = normalizeEnglish(spelling).trim();
  if (!needle) return false;
  return ['', 's', 'es'].some((plural) => normalized.includes(` ${needle}${plural} `));
}

function matchesGermanToken(token: string, stem: string, compoundHead: boolean, compoundModifier: boolean): boolean {
  if (INFLECTIONS.some((ending) => token === stem + ending)) return true;
  if (compoundHead && stem.length >= 4 && INFLECTIONS.some((ending) => token.length > stem.length + ending.length && token.endsWith(stem + ending))) return true;
  return compoundModifier && token.length > stem.length && token.startsWith(stem);
}

function containsGerman(normalized: string, tokens: string[], spelling: string): boolean {
  const exactOnly = spelling.startsWith('=');
  const modifier = spelling.endsWith('*');
  const stem = spelling.replace(/^=|\*$/g, '');
  // Multi-word German spellings ("mid century") are matched as a phrase.
  if (stem.includes(' ')) return normalized.includes(` ${stem} `);
  return tokens.some((token) => matchesGermanToken(token, stem, !exactOnly, modifier));
}

/** Canonical anchors present in the text. German spellings are only used for German text. */
export function findHomeAnchors(text: string, language = 'en'): string[] {
  const english = normalizeEnglish(text);
  const german = language.toLowerCase().startsWith('de') ? normalizeGerman(text) : null;
  const tokens = german ? german.trim().split(' ') : [];
  return HOME_ANCHORS.filter(
    (anchor) =>
      anchor.en.some((spelling) => containsEnglish(english, spelling)) ||
      (german !== null && anchor.de.some((spelling) => containsGerman(german, tokens, spelling)))
  ).map((anchor) => anchor.term);
}

function categoryOf(term: string): HomeAnchorCategory {
  return BY_TERM.get(term)?.category ?? 'mood';
}

function byCategory(terms: string[], category: HomeAnchorCategory): string[] {
  return terms.filter((term) => categoryOf(term) === category);
}

/** "kitchen, cabinets, green and orange palette, wood" — fixed-vocabulary terms only. */
export function describeHomeAnchors(terms: string[], max = 6): string[] {
  const parts: string[] = [];
  for (const category of CATEGORY_ORDER) {
    const found = byCategory(terms, category);
    if (found.length === 0) continue;
    if (category === 'color' && found.length >= 2) {
      parts.push(`${found.slice(0, -1).join(', ')} and ${found[found.length - 1]} palette`);
    } else {
      parts.push(...found);
    }
  }
  return parts.slice(0, max);
}

export interface HomeSubjectCheck {
  ok: boolean;
  /** Anchors the section supports (canonical English terms). */
  expected: string[];
  /** Anchors found in the image prompt. */
  detected: string[];
  /** Expected core anchors the image prompt does not show. */
  missing: string[];
}

/**
 * Does the (English) image prompt clearly represent the section?
 * - the section names a room → the prompt must show that room (a living
 *   room is not a kitchen);
 * - at least two of the section's core anchors (room, furniture, color,
 *   material, style) — or all of them when it has fewer;
 * - a section without any core anchor still needs two core anchors from
 *   the article: a generic interior never passes.
 */
export function checkHomeDecorSubject(imagePrompt: string, sectionText: string, articleEvidence: string, language: string): HomeSubjectCheck {
  const expected = findHomeAnchors(sectionText, language);
  const detected = findHomeAnchors(imagePrompt, 'en');
  const detectedSet = new Set(detected);
  const expectedCore = expected.filter((term) => CORE_CATEGORIES.has(categoryOf(term)));
  const missing = expectedCore.filter((term) => !detectedSet.has(term));

  const rooms = byCategory(expected, 'room');
  const roomOk = rooms.length === 0 || rooms.some((room) => detectedSet.has(room));

  let anchorsOk: boolean;
  if (expectedCore.length > 0) {
    const matched = expectedCore.filter((term) => detectedSet.has(term)).length;
    anchorsOk = matched >= Math.min(2, expectedCore.length);
  } else {
    const inArticle = new Set(findHomeAnchors(articleEvidence, language));
    anchorsOk = detected.filter((term) => CORE_CATEGORIES.has(categoryOf(term)) && inArticle.has(term)).length >= 2;
  }

  return { ok: roomOk && anchorsOk, expected, detected, missing };
}

/** Furniture and decor the section names — the only pieces its image may show. */
export function sectionHomeFurniture(sectionText: string, language: string): string[] {
  return byCategory(findHomeAnchors(sectionText, language), 'furniture');
}

/** Checked furniture the section never mentions: named in the prompt so the model does not add it (shelves in a curtain Pin). */
export function absentHomeFurniture(sectionText: string, language: string): string[] {
  const inSection = new Set(findHomeAnchors(sectionText, language));
  return FURNITURE.filter((anchor) => anchor.checked && !inSection.has(anchor.term)).map((anchor) => anchor.term);
}

/**
 * Checked furniture, materials and chromatic colors the image shows but the
 * source never mentions. With `sectionText`, furniture must come from the
 * Pin's own section: a bar cart's shelves elsewhere in the article do not
 * allow shelves in a curtain Pin. Colors and materials stay article-wide.
 */
export function findUngroundedHomeTerms(imagePrompt: string, articleEvidence: string, language: string, sectionText?: string): string[] {
  const inArticle = new Set(findHomeAnchors(articleEvidence, language));
  const inSection = sectionText === undefined ? inArticle : new Set(findHomeAnchors(sectionText, language));
  // "green plants" are plants, not a green palette claim.
  const prompt = imagePrompt.replace(/\bgreen (?:plants?|leaves|foliage)\b/gi, 'plants');
  return findHomeAnchors(prompt, 'en').filter((term) => {
    if (!BY_TERM.get(term)?.checked) return false;
    return categoryOf(term) === 'furniture' ? !inSection.has(term) : !inArticle.has(term);
  });
}
