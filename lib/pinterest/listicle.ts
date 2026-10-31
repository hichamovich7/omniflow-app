import { findSection, type ArticleImage, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import { isAllowedReferenceImage } from '@/lib/pinterest/article-vision';
import { resolveSourceAssetKey } from '@/lib/wordpress/media-source';
import { LISTICLE_CROP_VARIANTS } from '@/lib/pinterest/composer/content';
import type { PinterestStrategyIssue } from '@/lib/pinterest/strategy';
import type { PinterestAngle } from '@/types/pinterest';

/**
 * Number-aware listicle Pins (TASK-083). When an article promises an exact
 * count ("15 Cozy Crochet Blanket Ideas"), at least half of its Pins carry
 * that number in their title (Listicle or Article Promise angle) and are
 * composed by OmniFlow on a real photo of the article. The number is only
 * ever read from the article — H1 first, then a reliable numbered list —
 * never guessed. Without one, nothing here applies. Pure and offline.
 */

export type ListicleNumberSource = 'title' | 'list';

export interface ListicleNumber {
  /** Digits only, exactly as the article writes them ("15"). */
  value: string;
  source: ListicleNumberSource;
}

const MIN_LIST_COUNT = 3;
const MAX_LIST_COUNT = 500;

// Same shape as the extractor's numbered heading ("3. Neapolitan Scarf").
const NUMBERED_HEADING = /^\s*#?\s*(\d{1,3})\s*[.):\-–—]\s*(?=\S)/;

// A number followed by one of these is a measure, a duration, a price or a
// date — not a list count ("20 minutos", "5 mm", "3 Stunden", "2 ans").
const UNIT_WORDS = new Set([
  'x', 'mm', 'cm', 'm', 'km', 'in', 'inch', 'inches', 'ft', 'g', 'gr', 'kg', 'lb', 'lbs', 'oz', 'ml', 'cl', 'dl', 'l',
  'min', 'mins', 'minute', 'minutes', 'minuten', 'minuto', 'minutos', 'h', 'hr', 'hrs', 'hour', 'hours', 'stunde', 'stunden',
  'heure', 'heures', 'hora', 'horas', 'sec', 'second', 'seconds', 'sekunden', 'secondes', 'segundos',
  'day', 'days', 'tag', 'tage', 'tagen', 'jour', 'jours', 'dia', 'dias', 'día', 'días',
  'week', 'weeks', 'woche', 'wochen', 'semaine', 'semaines', 'semana', 'semanas',
  'month', 'months', 'monat', 'monate', 'monaten', 'mois', 'mes', 'meses',
  'year', 'years', 'jahr', 'jahre', 'jahren', 'an', 'ans', 'año', 'años', 'ano', 'anos',
  'euro', 'euros', 'dollar', 'dollars', 'percent', 'prozent',
  'stitches', 'maschen', 'mailles', 'puntos', 'rows', 'reihen', 'rangs', 'vueltas', 'rounds', 'runden', 'tours',
  'k', 'eme', 'ème', 'º', 'ª',
]);
// Attached or next symbol: "10%", "10 €", "3 x 4", "10+" (an open count is not exact), "1/2".
const UNIT_SYMBOL = /^\s*[%‰°€$£×+\-–—/:]/;

// Words that make the number a position, not a count ("Step 3", "Teil 2", "Size 10").
const POSITION_WORDS = new Set([
  'step', 'schritt', 'etape', 'étape', 'paso', 'part', 'teil', 'partie', 'parte', 'no', 'nr', 'n°', 'vol', 'volume',
  'band', 'tome', 'chapter', 'kapitel', 'chapitre', 'capitulo', 'capítulo', 'day', 'tag', 'jour', 'dia', 'día',
  'size', 'grösse', 'größe', 'groesse', 'taille', 'talla', 'round', 'runde', 'row', 'reihe', 'rang', 'vuelta', 'level',
]);

// A tutorial's numbered headings are steps, not a count of ideas.
const HOW_TO_TITLE =
  /^(?:how\s+to|how\s+do|wie\s|anleitung|so\s+(?:häkelst|machst|nähst)|comment\s|tuto(?:riel)?\b|c[oó]mo\s|paso\s+a\s+paso|step[\s-]+by[\s-]+step|schritt\s+für\s+schritt|[ée]tape\s+par\s+[ée]tape)/i;

function lowerWord(value: string): string {
  return value.toLocaleLowerCase('en').replace(/[.,;:!?'"’)]+$/, '');
}

/**
 * The single list count a title states, or null. Years, measures, durations,
 * prices, ordinals and positions ("Step 3") are ignored; two different
 * counts ("5 Hats and 3 Scarves") are ambiguous and give null.
 */
export function titleListCount(title: string): string | null {
  const found = new Set<string>();
  for (const match of title.matchAll(/(?<![\p{L}\p{N}.,])(\d{1,4})(?![\p{N}])/gu)) {
    const digits = match[1];
    const value = Number(digits);
    if (value < MIN_LIST_COUNT || value > MAX_LIST_COUNT || digits.startsWith('0')) continue;
    const index = match.index ?? 0;
    const after = title.slice(index + digits.length);
    // "5mm", "2nd", "1er", "3,5", "3.5", "10%", "10+" — a measure, ordinal or decimal.
    if (/^[\p{L}]/u.test(after) || /^[.,]\d/.test(after) || UNIT_SYMBOL.test(after)) continue;
    const nextWord = after.match(/^\s+([\p{L}º°ª]+)/u)?.[1];
    if (nextWord && UNIT_WORDS.has(lowerWord(nextWord))) continue;
    const before = title.slice(0, index).trimEnd();
    const previousWord = before.match(/([\p{L}°#.]+)$/u)?.[1];
    if (before.endsWith('#') || (previousWord && POSITION_WORDS.has(lowerWord(previousWord).replace(/\.$/, '')))) continue;
    found.add(String(value));
  }
  return found.size === 1 ? [...found][0] : null;
}

/** N when the article's numbered headings run 1, 2, … N without gap (N ≥ 3); null otherwise. */
export function numberedListCount(context: WordPressArticleContext): string | null {
  const numbers = context.sections
    .filter((section) => section.kind !== 'intro')
    .map((section) => NUMBERED_HEADING.exec(section.heading)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  if (numbers.length < MIN_LIST_COUNT) return null;
  const contiguous = numbers.every((value, index) => value === index + 1);
  return contiguous ? String(numbers.length) : null;
}

/** The title's main clause: before the first ":", "|" or spaced dash ("Cardigan: Size Guide…" → "Cardigan"). */
function headClause(title: string): string {
  return title.split(/\s*[:|]\s*|\s+[–—-]\s+/)[0] ?? title;
}

/**
 * The count a listicle article states. An H1 count is the article's promise
 * when it is in the H1's main clause ("15 Cozy Blanket Ideas…", even when
 * the list shown is shorter); a count only in a subtitle ("Cardigan: Size
 * Guide, Steps & 6 Color Ideas") counts only when the numbered list has
 * exactly that many items. Without an H1 count, a reliable numbered list is
 * used unless the article is a tutorial.
 */
export function detectListicleNumber(context: WordPressArticleContext): ListicleNumber | null {
  const fromTitle = titleListCount(context.title);
  const fromList = numberedListCount(context);
  if (fromTitle) {
    const enoughSubjects = context.isListicle || context.sections.filter((section) => section.kind === 'subject').length >= MIN_LIST_COUNT;
    const inHead = titleListCount(headClause(context.title)) === fromTitle;
    return enoughSubjects && (inHead || fromList === fromTitle) ? { value: fromTitle, source: 'title' } : null;
  }
  if (HOW_TO_TITLE.test(context.title.trim()) || !context.isListicle) return null;
  return fromList ? { value: fromList, source: 'list' } : null;
}

// ── Angle plan ───────────────────────────────────────────────────────────

/** The two angles a numbered title belongs to. */
export const NUMBERED_ANGLES = ['listicle', 'article-promise'] as const satisfies readonly PinterestAngle[];
const OTHER_ANGLES = ['curiosity', 'discovery', 'problem-solution'] as const satisfies readonly PinterestAngle[];

export function isNumberedAngle(angle: PinterestAngle): boolean {
  return (NUMBERED_ANGLES as readonly PinterestAngle[]).includes(angle);
}

/** At least half of the batch, rounded up: 3 → 2, 5 → 3, 7 → 4. */
export function numberedPinCount(pinsRequested: number): number {
  return Math.ceil(Math.max(0, Math.floor(pinsRequested)) / 2);
}

/**
 * Numbered Pins on every other slot (Listicle, then Article Promise), the
 * others rotate Curiosity, Discovery, Problem → Solution. Below five Pins no
 * angle repeats, as in the balanced plan.
 */
export function buildListicleAnglePlan(pinsRequested: number): PinterestAngle[] {
  const size = Math.max(0, Math.floor(pinsRequested));
  let numbered = 0;
  let other = 0;
  return Array.from({ length: size }, (_, index) =>
    index % 2 === 0 ? NUMBERED_ANGLES[numbered++ % NUMBERED_ANGLES.length] : OTHER_ANGLES[other++ % OTHER_ANGLES.length]
  );
}

// ── Validation ───────────────────────────────────────────────────────────

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

function numbersIn(value: string): Set<string> {
  return new Set((value.match(/\p{Number}+/gu) ?? []).map((digits) => String(Number(digits))));
}

export function titleHasNumber(title: string, number: string): boolean {
  return numbersIn(title).has(number);
}

// Promises a count does not prove: "best", "viral", "most popular" (EN/DE/FR/ES).
const HYPE_TOKENS = [
  'best', 'viral', 'popular', 'beste', 'besten', 'bester', 'bestes', 'beliebteste', 'beliebtesten', 'virale', 'viralen',
  'meilleur', 'meilleure', 'meilleurs', 'meilleures', 'populaire', 'populaires', 'mejor', 'mejores', 'virales', 'populares',
];

function hypeTokens(value: string): string[] {
  const words = new Set(normalizeText(value).split(' ').filter(Boolean));
  return HYPE_TOKENS.filter((token) => words.has(token));
}

interface ListiclePinCandidate {
  angle: PinterestAngle;
  title: string;
  description: string;
}

/**
 * The listicle batch contract: the angle counts of the plan, the article's
 * exact number in every Listicle / Article Promise title, and no "best /
 * viral / popular" promise the article does not make. Runs instead of the
 * balanced-angle check; every other safeguard still runs.
 */
export function validateListicleBatch(
  pins: ListiclePinCandidate[],
  plan: readonly PinterestAngle[],
  number: string,
  sourceEvidence: string
): PinterestStrategyIssue[] {
  const issues: PinterestStrategyIssue[] = [];
  if (pins.length === plan.length && plan.length > 0) {
    const count = (list: readonly PinterestAngle[]) =>
      list.reduce((counts, angle) => counts.set(angle, (counts.get(angle) ?? 0) + 1), new Map<PinterestAngle, number>());
    const expected = count(plan);
    const found = count(pins.map((pin) => pin.angle));
    const angles = [...new Set([...expected.keys(), ...found.keys()])];
    if (angles.some((angle) => (expected.get(angle) ?? 0) !== (found.get(angle) ?? 0))) {
      issues.push({
        code: 'angle-coverage',
        message: `Listicle plan expects ${angles.map((angle) => `${angle}=${expected.get(angle) ?? 0}`).join(', ')}`,
        reason: 'LISTICLE_ANGLE_PLAN',
        field: 'angle',
        details: [
          angles.map((angle) => `${angle}=${expected.get(angle) ?? 0}`).join(', '),
          ...angles.map((angle) => `${angle}=${found.get(angle) ?? 0}`),
        ],
      });
    }
  }

  const evidenceHype = new Set(hypeTokens(sourceEvidence));
  pins.forEach((pin, index) => {
    if (isNumberedAngle(pin.angle) && !titleHasNumber(pin.title, number)) {
      issues.push({
        code: 'unsupported-claim',
        message: `Pin ${index + 1} (${pin.angle}) does not carry the article's number ${number} in its title`,
        reason: 'LIST_NUMBER_MISSING',
        pinIndex: index,
        field: 'title',
        details: [number],
      });
    }
    const unsupported = hypeTokens(`${pin.title}\n${pin.description}`).filter((token) => !evidenceHype.has(token));
    if (unsupported.length > 0) {
      issues.push({
        code: 'unsupported-claim',
        message: `Pin ${index + 1} promises "${unsupported.join(', ')}" without support in the article`,
        reason: 'UNSUPPORTED_CLAIM',
        pinIndex: index,
        field: hypeTokens(pin.title).length ? 'title' : 'description',
        details: ['best/viral/popular'],
      });
    }
  });
  return issues;
}

// ── Article image of a numbered Pin ──────────────────────────────────────

export interface ListicleImageSource {
  /** The article's own image URL (never modified, never sent to an image model). */
  imageUrl: string;
  /** Storage-independent key (`storage:` / `url:`) of that image. */
  imageKey: string | null;
  origin: 'section' | 'featured';
  sectionId: string | null;
  /** The featured image, tried when the section image cannot be read at render time. */
  fallbackUrl: string | null;
  /** Crop / layout variant: two Pins sharing one photo never get the same composition. */
  crop: number;
}

function usableImage(image: ArticleImage | null | undefined, allowedHosts: readonly string[]): image is ArticleImage {
  if (!image?.url) return false;
  if (/\.svg(?:$|[?#])/i.test(image.url)) return false;
  return isAllowedReferenceImage(image.url, allowedHosts);
}

/**
 * One article image per numbered Pin, in Pin order: the image of the Pin's
 * own section, else the featured image; a photo already used by an earlier
 * Pin gets the next crop variant. Null when the article has no usable image
 * (that Pin then keeps the existing image path).
 */
export function planListicleImageSources(
  context: WordPressArticleContext,
  sectionIds: readonly (string | null | undefined)[],
  allowedHosts: readonly string[]
): (ListicleImageSource | null)[] {
  const featured = usableImage(context.featuredImage, allowedHosts) ? context.featuredImage : null;
  const uses = new Map<string, number>();
  return sectionIds.map((sectionId) => {
    const section = sectionId ? findSection(context, sectionId) : null;
    const own = section?.images.find((image) => usableImage(image, allowedHosts)) ?? null;
    const image = own ?? featured;
    if (!image) return null;
    const used = uses.get(image.url) ?? 0;
    uses.set(image.url, used + 1);
    return {
      imageUrl: image.url,
      imageKey: resolveSourceAssetKey(image.url),
      origin: own ? 'section' : 'featured',
      sectionId: own && section ? section.id : null,
      fallbackUrl: own && featured && featured.url !== own.url ? featured.url : null,
      crop: used % LISTICLE_CROP_VARIANTS,
    };
  });
}

/** Every image URL the article itself shows (featured + in-body). */
export function articleImageUrls(context: WordPressArticleContext): Set<string> {
  return new Set(
    [context.featuredImage?.url, ...context.internalImages.map((image) => image.url), ...context.sections.flatMap((section) => section.images.map((image) => image.url))].filter(
      (url): url is string => Boolean(url)
    )
  );
}
