import { ARTICLE_SIZE_CONFIG, DEFAULT_WORDS_RANGE, type ARTICLE_SIZES } from '@/lib/validations/wordpress';
import type { SupportedLanguage } from '@/types/pinterest';

/**
 * WordPress Article Quality Gate V1 (TASK-FIX-045). Pure, deterministic
 * checks run on a generated article before review/export — no AI call, no
 * database. The report is logged and returned by the generation routes; it
 * is not persisted yet (that needs a migration).
 */

export type QualityStatus = 'passed' | 'warning' | 'failed';

export interface QualityCheck {
  key: string;
  status: QualityStatus;
  message: string;
}

export interface ArticleQualityReport {
  status: QualityStatus;
  /** Messages of the failed checks. */
  qualityIssues: string[];
  /** Messages of the warning checks. */
  warnings: string[];
  checks: QualityCheck[];
}

export interface ArticleQualityInput {
  title: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  /** Final Markdown, as stored (FAQ rendered, link inserted, image markers resolved). */
  content: string;
  /**
   * Markdown before image marker resolution — where the {{IMAGE_N}} markers
   * written by the model can still be counted.
   */
  contentBeforeImages: string;
  language: SupportedLanguage;
  articleSize?: (typeof ARTICLE_SIZES)[number] | null;
  /** The outline's H2 section headings, in order. */
  expectedH2Headings: string[];
  /** Placement markers the outline planned, e.g. ["IMAGE_1", "IMAGE_2"]. */
  expectedImageMarkers: string[];
  includeH3?: boolean | null;
  /** True when the outline planned FAQ questions (includeFaq not "Non"). */
  faqExpected: boolean;
  includeKeyTakeaways?: boolean | null;
  includeConclusion?: boolean | null;
  includeTables?: boolean | null;
  includeQuotes?: boolean | null;
  /** Links the article may contain: manual URLs + the verified external source. */
  allowedUrls: string[];
  /** finish_reason of every text call (outline, article); null when not reported. */
  finishReasons: (string | null)[];
}

// ------------------------------------------------------------------ limits

// Kept in sync with the outline prompt ("around 60", trimmed at 70) and
// applyOutlineTextLimits() (lib/wordpress/generate-article.ts).
const META_TITLE_TARGET = 60;
const META_TITLE_MAX = 70;
const META_DESCRIPTION_MIN = 150;
const META_DESCRIPTION_WARN_MIN = 120;
const META_DESCRIPTION_MAX = 160;
const SLUG_MAX = 100;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Share of the word range tolerated outside [min, max] before it is a failure.
const WORD_COUNT_TOLERANCE = 0.15;
const REPEATED_SENTENCE_MIN_WORDS = 6;
const REPEATED_SENTENCES_FAIL = 3;
const TITLE_SIMILARITY_WARN = 0.8;
const LANGUAGE_MIN_WORDS = 40;
const LANGUAGE_MARGIN = 1.5;

// --------------------------------------------------------- language tables

const FAQ_HEADING = /^(faq\b|frequently asked questions|häufig gestellte fragen|preguntas frecuentes|questions fréquentes|foire aux questions)/i;
const KEY_TAKEAWAYS_HEADING = /^(key takeaways|das wichtigste|wichtigste erkenntnisse|puntos clave|conclusiones clave|points clés|à retenir|l'essentiel)/i;
const CONCLUSION_HEADING = /^(conclusion|fazit|schlussfolgerung|conclusión|en conclusion)/i;

const GENERIC_PHRASES: Record<SupportedLanguage, string[]> = {
  en: [
    "in today's world",
    "in today's fast-paced world",
    'in the ever-evolving',
    'more popular than ever',
    "whether you're a beginner or",
    'whether you are a beginner or',
    'it is important to note that',
    "it's important to note that",
    'in conclusion, it is clear',
    'look no further',
    'without further ado',
    'as we have seen',
    'when it comes to',
    'dive into',
  ],
  de: [
    'in der heutigen zeit',
    'in der heutigen schnelllebigen',
    'beliebter denn je',
    'ob anfänger oder profi',
    'es ist wichtig zu beachten',
    'zusammenfassend lässt sich sagen',
    'wie wir gesehen haben',
    'wenn es um',
  ],
  es: [
    'en el mundo actual',
    'en la actualidad',
    'más popular que nunca',
    'tanto si eres principiante como',
    'es importante tener en cuenta que',
    'es importante destacar que',
    'en conclusión, está claro',
    'como hemos visto',
    'cuando se trata de',
  ],
  fr: [
    "dans le monde d'aujourd'hui",
    'de nos jours',
    'plus populaire que jamais',
    'que vous soyez débutant ou',
    'il est important de noter que',
    'en conclusion, il est clair',
    'comme nous avons pu le voir',
    'lorsqu’il s’agit de',
    "lorsqu'il s'agit de",
  ],
};

const STOPWORDS: Record<SupportedLanguage, string[]> = {
  en: ['the', 'and', 'is', 'of', 'to', 'with', 'for', 'you', 'that', 'this', 'are', 'your', 'it', 'on', 'can', 'be', 'or', 'from', 'when', 'which'],
  de: ['der', 'die', 'und', 'ist', 'nicht', 'mit', 'für', 'das', 'sie', 'ein', 'eine', 'auf', 'auch', 'sich', 'dem', 'den', 'oder', 'wenn', 'wird', 'bei'],
  es: ['el', 'la', 'los', 'las', 'que', 'y', 'es', 'para', 'con', 'por', 'una', 'del', 'como', 'más', 'pero', 'su', 'sus', 'se', 'al', 'lo'],
  fr: ['le', 'la', 'les', 'et', 'est', 'des', 'pour', 'avec', 'une', 'dans', 'que', 'qui', 'sur', 'pas', 'vous', 'du', 'au', 'aux', 'ou', 'votre'],
};

// ---------------------------------------------------------------- helpers

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

/** Headings with their level, text stripped of a leading "1." numbering. */
function headings(content: string): { level: number; text: string }[] {
  return content
    .split('\n')
    .map((line) => line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ level: m[1].length, text: m[2].replace(/^\d+[.)]\s*/, '').trim() }));
}

/** Removes the rendered FAQ section (from its H2 to the next H2 or the end). */
function withoutFaqSection(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let inFaq = false;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) inFaq = FAQ_HEADING.test(h2[1].trim());
    if (!inFaq) out.push(line);
  }
  return out.join('\n');
}

/** Visible prose only: no headings, images, table separators or link targets. */
function proseText(content: string): string {
  return content
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\|?\s*:?-{3,}:?\s*\|/g, ' ');
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let common = 0;
  for (const w of setA) if (setB.has(w)) common += 1;
  return common / (setA.size + setB.size - common);
}

function check(key: string, status: QualityStatus, message: string): QualityCheck {
  return { key, status, message };
}

// ----------------------------------------------------------------- checks

function checkWordCount(input: ArticleQualityInput): QualityCheck {
  const range = input.articleSize ? ARTICLE_SIZE_CONFIG[input.articleSize] : DEFAULT_WORDS_RANGE;
  const count = words(proseText(withoutFaqSection(input.content))).length;
  const label = `${count} words (target ${range.minWords}-${range.maxWords}${input.articleSize ? `, size ${input.articleSize}` : ''}, FAQ excluded)`;
  if (count >= range.minWords && count <= range.maxWords) return check('word_count', 'passed', label);
  const tolerance = (range.maxWords - range.minWords) * WORD_COUNT_TOLERANCE;
  const withinTolerance = count >= range.minWords - tolerance && count <= range.maxWords + tolerance;
  return check('word_count', withinTolerance ? 'warning' : 'failed', `${count < range.minWords ? 'Too short' : 'Too long'}: ${label}`);
}

function checkTitle(input: ArticleQualityInput): QualityCheck {
  const h1s = headings(input.content).filter((h) => h.level === 1);
  if (!input.title.trim()) return check('title', 'failed', 'The article has no title.');
  if (h1s.length === 0) return check('title', 'failed', 'The article body has no H1 title.');
  if (h1s.length > 1) return check('title', 'failed', `The article body has ${h1s.length} H1 headings instead of one.`);
  if (normalize(h1s[0].text) !== normalize(input.title)) {
    return check('title', 'warning', `The H1 "${h1s[0].text}" differs from the title "${input.title}".`);
  }
  return check('title', 'passed', 'Title present as the single H1.');
}

function checkH2(input: ArticleQualityInput): QualityCheck {
  const h2s = new Set(headings(input.content).filter((h) => h.level === 2).map((h) => normalize(h.text)));
  const missing = input.expectedH2Headings.filter((heading) => !h2s.has(normalize(heading.replace(/^\d+[.)]\s*/, ''))));
  if (missing.length === 0) return check('h2_sections', 'passed', `All ${input.expectedH2Headings.length} planned H2 sections present.`);
  const presentShare = 1 - missing.length / Math.max(1, input.expectedH2Headings.length);
  return check(
    'h2_sections',
    presentShare >= 0.8 ? 'warning' : 'failed',
    `${missing.length} planned H2 section(s) missing or renamed: ${missing.map((h) => `"${h}"`).join(', ')}.`
  );
}

function checkH3(input: ArticleQualityInput): QualityCheck {
  const h3Count = headings(input.content).filter((h) => h.level >= 3).length;
  if (input.includeH3 === false) {
    return h3Count > 0
      ? check('h3', 'failed', `H3 disabled but ${h3Count} H3 (or deeper) heading(s) found.`)
      : check('h3', 'passed', 'No H3, as requested.');
  }
  if (input.includeH3 === true) {
    return h3Count > 0
      ? check('h3', 'passed', `${h3Count} H3 heading(s), as requested.`)
      : check('h3', 'warning', 'H3 requested but none found.');
  }
  return check('h3', 'passed', `H3 not constrained (${h3Count} found).`);
}

function checkFaq(input: ArticleQualityInput): QualityCheck {
  const faqHeadings = headings(input.content).filter((h) => h.level === 2 && FAQ_HEADING.test(h.text));
  if (input.faqExpected) {
    if (faqHeadings.length === 0) return check('faq', 'failed', 'FAQ enabled but no FAQ section in the article.');
    if (faqHeadings.length > 1) return check('faq', 'failed', `${faqHeadings.length} FAQ sections instead of one.`);
    return check('faq', 'passed', 'One FAQ section present.');
  }
  return faqHeadings.length > 0
    ? check('faq', 'failed', 'FAQ disabled but an FAQ section is present.')
    : check('faq', 'passed', 'No FAQ, as requested.');
}

function checkUnresolvedMarkers(input: ArticleQualityInput): QualityCheck {
  const markers = input.content.match(/\{\{[^{}\n]{1,40}\}\}/g) ?? [];
  return markers.length > 0
    ? check('unresolved_markers', 'failed', `Unreplaced marker(s) left in the article: ${[...new Set(markers)].join(', ')}.`)
    : check('unresolved_markers', 'passed', 'No unreplaced marker.');
}

function checkFirstSentence(input: ArticleQualityInput): QualityCheck {
  const bodyLine = input.content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith('!') && !/^\{\{.*\}\}$/.test(line));
  if (!bodyLine) return check('first_sentence', 'failed', 'The article has no body text.');
  const first = sentences(proseText(bodyLine))[0] ?? '';
  const firstWords = words(first);
  const titleWords = words(input.title);
  if (normalize(first) === normalize(input.title) || normalize(first).startsWith(normalize(input.title))) {
    return check('first_sentence', 'failed', 'The first sentence repeats the title.');
  }
  if (jaccard(firstWords, titleWords) >= TITLE_SIMILARITY_WARN) {
    return check('first_sentence', 'warning', 'The first sentence is almost identical to the title.');
  }
  return check('first_sentence', 'passed', 'The first sentence differs from the title.');
}

function checkUrls(input: ArticleQualityInput): QualityCheck {
  const withoutImages = input.content.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  const linkUrls = [...withoutImages.matchAll(/\]\((\S+?)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]);
  const bareUrls = withoutImages.replace(/\]\([^)]*\)/g, ' ').match(/https?:\/\/[^\s)>\]]+/g) ?? [];
  const allowed = new Set(input.allowedUrls.map((u) => u.trim()));
  const unauthorized = [...new Set([...linkUrls, ...bareUrls])].filter((url) => !allowed.has(url));
  return unauthorized.length > 0
    ? check('unauthorized_urls', 'failed', `URL(s) not provided by the user or the verified source: ${unauthorized.join(', ')}.`)
    : check('unauthorized_urls', 'passed', `${linkUrls.length + bareUrls.length} link(s), all authorized.`);
}

function checkMetaTitle(input: ArticleQualityInput): QualityCheck {
  const length = input.metaTitle.trim().length;
  if (length === 0) return check('meta_title', 'failed', 'Meta title is empty.');
  if (length > META_TITLE_MAX) return check('meta_title', 'failed', `Meta title is ${length} characters (max ${META_TITLE_MAX}).`);
  if (length > META_TITLE_TARGET) return check('meta_title', 'warning', `Meta title is ${length} characters (target ≤ ${META_TITLE_TARGET}).`);
  return check('meta_title', 'passed', `Meta title is ${length} characters.`);
}

function checkMetaDescription(input: ArticleQualityInput): QualityCheck {
  const length = input.metaDescription.trim().length;
  if (length === 0) return check('meta_description', 'failed', 'Meta description is empty.');
  if (length > META_DESCRIPTION_MAX) {
    return check('meta_description', 'failed', `Meta description is ${length} characters (max ${META_DESCRIPTION_MAX}).`);
  }
  if (length < META_DESCRIPTION_MIN) {
    return check(
      'meta_description',
      length < META_DESCRIPTION_WARN_MIN ? 'failed' : 'warning',
      `Meta description is ${length} characters (target ${META_DESCRIPTION_MIN}-${META_DESCRIPTION_MAX}).`
    );
  }
  return check('meta_description', 'passed', `Meta description is ${length} characters.`);
}

function checkSlug(input: ArticleQualityInput): QualityCheck {
  if (!SLUG_PATTERN.test(input.slug)) {
    return check('slug', 'failed', `Slug "${input.slug}" is not lowercase ASCII words separated by single hyphens.`);
  }
  if (input.slug.length > SLUG_MAX) return check('slug', 'failed', `Slug is ${input.slug.length} characters (max ${SLUG_MAX}).`);
  return check('slug', 'passed', 'Slug is valid.');
}

function checkTruncation(input: ArticleQualityInput): QualityCheck {
  if (input.finishReasons.some((reason) => reason === 'length')) {
    return check('truncation', 'failed', 'A generation step stopped at the token limit (finish_reason "length").');
  }
  if (input.finishReasons.length === 0 || input.finishReasons.some((reason) => reason === null)) {
    return check('truncation', 'warning', 'finish_reason was not reported for every step.');
  }
  return check('truncation', 'passed', 'No step was truncated.');
}

function checkGenericPhrases(input: ArticleQualityInput): QualityCheck {
  const text = input.content.toLowerCase().replace(/’/g, "'");
  const found = GENERIC_PHRASES[input.language].filter((phrase) => text.includes(phrase.replace(/’/g, "'")));
  return found.length > 0
    ? check('generic_phrases', 'warning', `Generic phrasing found: ${found.map((p) => `"${p}"`).join(', ')}.`)
    : check('generic_phrases', 'passed', 'No obvious generic phrasing.');
}

function checkRepetition(input: ArticleQualityInput): QualityCheck {
  const counts = new Map<string, number>();
  for (const sentence of sentences(proseText(input.content))) {
    const key = normalize(sentence);
    if (key.split(' ').length < REPEATED_SENTENCE_MIN_WORDS) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = [...counts.values()].filter((n) => n > 1).length;
  if (repeated === 0) return check('repetition', 'passed', 'No repeated sentence.');
  return check(
    'repetition',
    repeated >= REPEATED_SENTENCES_FAIL ? 'failed' : 'warning',
    `${repeated} sentence(s) repeated verbatim in the article.`
  );
}

function checkImageMarkers(input: ArticleQualityInput): QualityCheck {
  const missing = input.expectedImageMarkers.filter((marker) => !input.contentBeforeImages.includes(`{{${marker}}}`));
  return missing.length > 0
    ? check('image_markers', 'warning', `Image marker(s) not placed by the article: ${missing.join(', ')} — those images are not shown.`)
    : check('image_markers', 'passed', `All ${input.expectedImageMarkers.length} image marker(s) placed.`);
}

function checkDisabledBlocks(input: ArticleQualityInput): QualityCheck {
  const h2s = headings(input.content).filter((h) => h.level === 2).map((h) => h.text);
  const found: string[] = [];
  if (input.includeKeyTakeaways === false && h2s.some((h) => KEY_TAKEAWAYS_HEADING.test(h))) found.push('Key Takeaways');
  if (input.includeConclusion === false && h2s.some((h) => CONCLUSION_HEADING.test(h))) found.push('Conclusion');
  if (input.includeTables === false && /^\s*\|?\s*:?-{3,}:?\s*\|/m.test(input.content)) found.push('table');
  if (input.includeQuotes === false && /^\s*>\s/m.test(input.content)) found.push('blockquote');
  return found.length > 0
    ? check('disabled_blocks', 'failed', `Disabled block(s) present: ${found.join(', ')}.`)
    : check('disabled_blocks', 'passed', 'No disabled block present.');
}

function checkLanguage(input: ArticleQualityInput): QualityCheck {
  const tokens = proseText(input.content)
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  if (tokens.length < LANGUAGE_MIN_WORDS) return check('language', 'warning', 'Too little text to verify the language.');
  const scores = (Object.keys(STOPWORDS) as SupportedLanguage[]).map((lang) => {
    const set = new Set(STOPWORDS[lang]);
    return { lang, score: tokens.filter((t) => set.has(t)).length };
  });
  scores.sort((a, b) => b.score - a.score);
  const requested = scores.find((s) => s.lang === input.language)?.score ?? 0;
  const [best, second] = scores;
  if (best.lang === input.language) {
    return best.score >= second.score * LANGUAGE_MARGIN
      ? check('language', 'passed', `Text matches the requested language (${input.language}).`)
      : check('language', 'warning', `Language unclear: ${input.language} barely ahead of ${second.lang}.`);
  }
  return best.score >= requested * LANGUAGE_MARGIN
    ? check('language', 'failed', `Text looks like ${best.lang}, not the requested ${input.language}.`)
    : check('language', 'warning', `Language unclear: ${best.lang} slightly ahead of the requested ${input.language}.`);
}

// ------------------------------------------------------------------- main

export function runArticleQualityCheck(input: ArticleQualityInput): ArticleQualityReport {
  const checks = [
    checkWordCount(input),
    checkTitle(input),
    checkH2(input),
    checkH3(input),
    checkFaq(input),
    checkUnresolvedMarkers(input),
    checkFirstSentence(input),
    checkUrls(input),
    checkMetaTitle(input),
    checkMetaDescription(input),
    checkSlug(input),
    checkTruncation(input),
    checkGenericPhrases(input),
    checkRepetition(input),
    checkImageMarkers(input),
    checkDisabledBlocks(input),
    checkLanguage(input),
  ];
  const qualityIssues = checks.filter((c) => c.status === 'failed').map((c) => c.message);
  const warnings = checks.filter((c) => c.status === 'warning').map((c) => c.message);
  const status: QualityStatus = qualityIssues.length > 0 ? 'failed' : warnings.length > 0 ? 'warning' : 'passed';
  return { status, qualityIssues, warnings, checks };
}

/** Server log line — keys and statuses only, never article text. */
export function logArticleQuality(logTag: string, report: ArticleQualityReport): void {
  const flagged = report.checks.filter((c) => c.status !== 'passed').map((c) => `${c.key}=${c.status}`);
  const line = `[${logTag}] quality gate: ${report.status}${flagged.length > 0 ? ` (${flagged.join(', ')})` : ''}`;
  if (report.status === 'passed') console.info(line);
  else console.warn(line);
}
