import { findTerms, subjectSections, type WordPressArticleContext } from '@/lib/wordpress/article-context';
import { resolveHeadingSubject, subjectLanguage, type SubjectLanguage } from '@/lib/pinterest/subject-concepts';
import { detectListicleNumber } from '@/lib/pinterest/listicle';
import type { PinterestSubjectReport } from '@/lib/pinterest/strategy';
import type { ArticleKind } from '@/types/pinterest';

export { ARTICLE_KIND_LABELS, type ArticleKind } from '@/types/pinterest';

/**
 * What kind of article a Pin batch is built from (TASK-FIX-089), decided
 * before any visual format: a gallery of distinct projects
 * (`project_listicle` — the only kind whose numbered Pins are composed on
 * the article's photos), a guide of tips / techniques (`tips_guide` — AI
 * Integrated images that show each tip, no project required) or anything
 * else (`generic_article`). A number in the title alone never makes a
 * project gallery. Deterministic, pure and offline.
 */

const MIN_PROJECT_SECTIONS = 3;

// Advice words (EN / FR / DE / ES). German compounds ("Häkeltipps", "Anfängerfehler") match by their ending.
const TIPS_TITLE = new RegExp(
  [
    '\\b(?:tips?|tricks?|hacks?|mistakes?|techniques?|advice|secrets?|dos and donts|ways to (?:improve|get better|avoid|fix|prevent))\\b',
    '\\b(?:conseils?|astuces?|erreurs?|techniques?)\\b',
    '(?:tipps?|tricks|fehler|techniken|ratschlage)\\b',
    '\\b(?:consejos?|trucos?|errores|tecnicas?)\\b',
  ].join('|')
);
// Project-gallery words (EN / FR / DE / ES): "Ideas", "Projects", "Patterns", "Häkeldecken-Ideen", "Bastelideen".
const PROJECT_TITLE = new RegExp(
  [
    '\\b(?:ideas?|projects?|patterns?|crafts?|designs?|makes|diys?|gifts?|inspirations?)\\b',
    '\\b(?:idees?|projets?|modeles?|creations?|bricolages?)\\b',
    '(?:ideen|projekte|anleitungen|vorlagen|muster)\\b',
    '\\b(?:proyectos?|patrones|manualidades|disenos)\\b',
  ].join('|')
);

/** Lowercase, no diacritics, apostrophes dropped ("don't" → "dont"), other punctuation → spaces. */
function plain(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/['’]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

export function isTipsTitle(title: string): boolean {
  return TIPS_TITLE.test(plain(title));
}

export function isProjectTitle(title: string): boolean {
  return PROJECT_TITLE.test(plain(title));
}

/** Subject sections whose heading names a project or object (a concept, or an English lexicon object). */
function projectSectionCount(context: WordPressArticleContext): number {
  return subjectSections(context).filter(
    (section) => resolveHeadingSubject(section.subject, { language: context.language }) !== null || findTerms(section.subject, 'objects').length > 0
  ).length;
}

/**
 * - `tips_guide`: the title promises tips, tricks, mistakes or techniques —
 *   unless it also promises ideas / projects and at least 3 sections name a
 *   distinct project ("15 Clay Ideas with Tips");
 * - `project_listicle`: a stated count (H1 or numbered list) and several
 *   distinct visual projects — the title says ideas / projects / patterns,
 *   or at least 3 section headings name an object;
 * - `generic_article`: everything else (a number alone is not enough).
 */
export function classifyArticleKind(context: WordPressArticleContext): ArticleKind {
  const projectTitle = isProjectTitle(context.title);
  const projectSections = projectSectionCount(context);
  if (isTipsTitle(context.title) && !(projectTitle && projectSections >= MIN_PROJECT_SECTIONS)) return 'tips_guide';
  if (detectListicleNumber(context) && (projectTitle || projectSections >= MIN_PROJECT_SECTIONS)) return 'project_listicle';
  return 'generic_article';
}

// ── What a tip image must show ─────────────────────────────────────────────

interface TipAction {
  /** English id, also what an (English) image prompt may say. */
  id: string;
  /** English words an image prompt shows the action with. */
  en: readonly string[];
  /** Article-language spellings that name the action in a heading. */
  other: Record<Exclude<SubjectLanguage, 'en'>, readonly string[]>;
}

// Fixed vocabulary of crafts actions and techniques. Words match whole, with plurals / -ing forms.
const TIP_ACTIONS: readonly TipAction[] = [
  { id: 'knead', en: ['knead', 'kneading', 'kneaded', 'condition', 'conditioning', 'wedge', 'wedging'], other: { fr: ['petrir', 'petrissez', 'malaxer', 'malaxez'], de: ['kneten', 'knete', 'durchkneten'], es: ['amasar', 'amasa', 'amasado'] } },
  { id: 'smooth', en: ['smooth', 'smoothing', 'smoothed', 'sand', 'sanding', 'sanded', 'sandpaper', 'polish', 'polishing', 'burnish'], other: { fr: ['lisser', 'lissez', 'lisse', 'poncer', 'poncez', 'poncage', 'polir'], de: ['glatten', 'glattstreichen', 'schleifen', 'schleift', 'polieren'], es: ['alisar', 'alisa', 'lijar', 'lija', 'pulir'] } },
  { id: 'crack', en: ['crack', 'cracks', 'cracked', 'cracking', 'repair', 'repairing', 'fix', 'fixing', 'mend', 'mending', 'fill', 'filling'], other: { fr: ['fissure', 'fissures', 'craquelure', 'craquelures', 'reparer', 'reparez', 'reparation', 'combler'], de: ['riss', 'risse', 'reparieren', 'ausbessern', 'flicken'], es: ['grieta', 'grietas', 'reparar', 'repara', 'arreglar', 'rellenar'] } },
  { id: 'paint', en: ['paint', 'painting', 'painted', 'color', 'colors', 'colour', 'colours', 'swatch', 'swatches', 'test', 'testing', 'primer'], other: { fr: ['peinture', 'peindre', 'peignez', 'couleur', 'couleurs', 'tester', 'testez', 'essai'], de: ['farbe', 'farben', 'malen', 'bemalen', 'testen', 'grundierung'], es: ['pintura', 'pintar', 'pinta', 'color', 'colores', 'probar', 'prueba'] } },
  { id: 'varnish', en: ['varnish', 'varnishing', 'seal', 'sealing', 'sealant', 'sealer', 'glaze', 'glazing', 'coat', 'coats', 'topcoat'], other: { fr: ['vernis', 'vernir', 'vernissez', 'scellant', 'finition', 'couche', 'couches'], de: ['lack', 'lackieren', 'versiegeln', 'firnis', 'schicht', 'schichten'], es: ['barniz', 'barnizar', 'sellar', 'sellador', 'acabado', 'capa', 'capas'] } },
  { id: 'thickness', en: ['thickness', 'thick', 'thin', 'roll', 'rolling', 'rolled', 'slab', 'slabs', 'even', 'evenly', 'rolling pin'], other: { fr: ['epaisseur', 'epais', 'fin', 'etaler', 'etalez', 'rouleau', 'plaque'], de: ['dicke', 'dick', 'dunn', 'ausrollen', 'rollen', 'nudelholz', 'platte'], es: ['grosor', 'espesor', 'grueso', 'fino', 'estirar', 'rodillo', 'plancha'] } },
  { id: 'dry', en: ['dry', 'drying', 'dried', 'dries', 'cure', 'curing', 'wire rack', 'rack'], other: { fr: ['secher', 'sechez', 'sechage', 'seche'], de: ['trocknen', 'trocknet', 'trocknung', 'trocken'], es: ['secar', 'seca', 'secado'] } },
  { id: 'join', en: ['join', 'joining', 'joined', 'attach', 'attaching', 'score', 'scoring', 'slip', 'seam', 'seams', 'glue', 'gluing'], other: { fr: ['assembler', 'assemblez', 'joindre', 'coller', 'collez', 'barbotine', 'jointure'], de: ['verbinden', 'zusammenfugen', 'kleben', 'schlicker', 'naht'], es: ['unir', 'une', 'pegar', 'barbotina', 'union'] } },
  { id: 'moisture', en: ['water', 'damp', 'moist', 'wet', 'store', 'storing', 'storage', 'airtight', 'wrap', 'wrapped', 'cover', 'covered'], other: { fr: ['eau', 'humide', 'humidifier', 'conserver', 'conservez', 'hermetique', 'couvrir'], de: ['wasser', 'feucht', 'aufbewahren', 'luftdicht', 'abdecken'], es: ['agua', 'humedo', 'humeda', 'guardar', 'hermetico', 'cubrir'] } },
  { id: 'shape', en: ['shape', 'shaping', 'sculpt', 'sculpting', 'mold', 'molding', 'mould', 'pinch', 'coil', 'coils', 'armature', 'cut', 'cutting'], other: { fr: ['modeler', 'modelez', 'faconner', 'sculpter', 'moule', 'mouler', 'armature', 'couper', 'decouper'], de: ['formen', 'modellieren', 'form', 'drahtgerust', 'schneiden', 'ausstechen'], es: ['moldear', 'modelar', 'molde', 'esculpir', 'armadura', 'cortar'] } },
  { id: 'texture', en: ['texture', 'textures', 'textured', 'stamp', 'stamps', 'stamping', 'imprint', 'imprints', 'emboss'], other: { fr: ['texture', 'textures', 'tampon', 'empreinte', 'empreintes'], de: ['textur', 'strukturen', 'struktur', 'stempel', 'abdruck'], es: ['textura', 'texturas', 'sello', 'sellos', 'huella'] } },
  { id: 'tools', en: ['tool', 'tools', 'brush', 'brushes', 'knife', 'cutter', 'cutters', 'needle tool', 'sponge'], other: { fr: ['outil', 'outils', 'pinceau', 'pinceaux', 'couteau', 'eponge'], de: ['werkzeug', 'werkzeuge', 'pinsel', 'messer', 'schwamm'], es: ['herramienta', 'herramientas', 'pincel', 'pinceles', 'cuchillo', 'esponja'] } },
  { id: 'tension', en: ['tension', 'gauge', 'stitch count', 'count', 'counting', 'marker', 'markers', 'blocking', 'block'], other: { fr: ['tension', 'echantillon', 'compter', 'marqueur', 'marqueurs', 'bloquer', 'blocage'], de: ['spannung', 'maschenprobe', 'zahlen', 'markierer', 'spannen'], es: ['tension', 'muestra', 'contar', 'marcador', 'marcadores', 'bloquear', 'bloqueo'] } },
];

// Words that say nothing about the action ("Use", "your", "before", "start").
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'always', 'avoid', 'before', 'better', 'beginner', 'beginners', 'doing', 'dont', 'each', 'easy', 'every', 'from',
  'good', 'have', 'into', 'just', 'keep', 'know', 'learn', 'make', 'more', 'most', 'much', 'need', 'never', 'only', 'other', 'over',
  'right', 'start', 'step', 'still', 'take', 'than', 'that', 'them', 'then', 'these', 'they', 'this', 'tips', 'tip', 'trick', 'tricks',
  'very', 'want', 'when', 'what', 'where', 'which', 'while', 'will', 'with', 'without', 'work', 'your', 'yours', 'using', 'well', 'first',
  'clay', 'yarn', 'piece', 'pieces', 'project', 'projects',
]);

function wordsOf(value: string): string[] {
  return plain(value).split(' ').filter(Boolean);
}

/** True when `words` contains `spelling` (one or two words) as whole words, plural / -ing / -ed tolerated. */
function hasSpelling(words: readonly string[], spelling: string): boolean {
  const parts = wordsOf(spelling);
  if (parts.length === 0) return false;
  const matches = (word: string, part: string) =>
    word === part || word === `${part}s` || word === `${part}es` || word === `${part}ing` || word === `${part}ed` || word === `${part}d` || (part.endsWith('e') && word === `${part.slice(0, -1)}ing`);
  return words.some((_, index) => parts.every((part, offset) => words[index + offset] !== undefined && matches(words[index + offset], part)));
}

/** Tip actions a heading names, in the article language (English words always count). */
export function tipActionsOf(text: string, language: string | null | undefined): string[] {
  const words = wordsOf(text);
  const lang = subjectLanguage(language);
  return TIP_ACTIONS.filter((action) => [...action.en, ...(lang === 'en' ? [] : action.other[lang])].some((spelling) => hasSpelling(words, spelling))).map(
    (action) => action.id
  );
}

/** Tip actions an English image prompt shows. */
function promptActions(prompt: string): string[] {
  const words = wordsOf(prompt);
  return TIP_ACTIONS.filter((action) => action.en.some((spelling) => hasSpelling(words, spelling))).map((action) => action.id);
}

/** Content words of an English heading ("Seal before painting" → seal, painting). */
function keyWords(heading: string): string[] {
  return [...new Set(wordsOf(heading).filter((word) => word.length >= 4 && !STOP_WORDS.has(word) && !/^\d+$/.test(word)))];
}

const NO_TIP_SHOWN = 'no recognizable tip or action';

/**
 * The tips_guide check, instead of "a recognizable project": the image
 * prompt must clearly represent the tip, action or technique of its section.
 * A heading naming a known action (fixed vocabulary, four languages) needs
 * that action in the prompt; an English heading without one needs one of
 * its content words. A non-English heading that names no known action
 * cannot be checked deterministically and is accepted (the invented-element
 * check still runs).
 */
export function checkTipImage(imagePrompt: string, heading: string, language: string | null | undefined): PinterestSubjectReport & { ok: boolean } {
  const expectedActions = tipActionsOf(heading, language);
  const shownActions = promptActions(imagePrompt);
  if (expectedActions.length > 0) {
    const shownExpected = expectedActions.filter((action) => shownActions.includes(action));
    if (shownExpected.length > 0) return { ok: true, expected: expectedActions, detected: shownExpected, missing: [] };
  }
  const english = subjectLanguage(language) === 'en';
  const words = english ? keyWords(heading) : [];
  const promptWords = wordsOf(imagePrompt);
  const shownWords = words.filter((word) => hasSpelling(promptWords, word) || promptWords.some((candidate) => candidate.length >= 5 && word.startsWith(candidate.slice(0, 5)) && candidate.startsWith(word.slice(0, 5))));
  if (shownWords.length > 0) return { ok: true, expected: words, detected: shownWords, missing: [] };
  if (expectedActions.length === 0 && words.length === 0) return { ok: true, expected: [], detected: shownActions, missing: [] };
  const expected = expectedActions.length ? expectedActions : words.slice(0, 6);
  return { ok: false, expected, detected: shownActions.length ? shownActions : [NO_TIP_SHOWN], missing: expected };
}

