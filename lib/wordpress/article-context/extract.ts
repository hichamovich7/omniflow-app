import { marked } from 'marked';
import { htmlToEvents } from './html';
import { cleanArticleText } from './sanitize';
import {
  countVisualTerms,
  extractVisualAttributes,
  mergeVisualAttributes,
  type VisualAttributes,
} from './attributes';
import type {
  ArticleImage,
  ArticleSection,
  ArticleSectionKind,
  ArticleSourceType,
  WordPressArticleContext,
} from './types';

/** Hard ceiling on the HTML parsed per article (characters). */
export const ARTICLE_HTML_MAX_LENGTH = 600_000;
const MAX_VISUAL_DETAILS = 12;
const MAX_IMAGES = 40;

const NUMBERED_HEADING = /^\s*#?\s*(\d{1,3})\s*[.):\-–—]\s*(?=\S)/;
const NAVIGATION_HEADING =
  /^(?:explore|discover|more\b|related|you (?:may|might) also|read (?:next|more|also)|see also|keep reading|further reading|similar|popular|recommended|also on|more from|à lire|lire aussi|découvr|articles? similaires|voir aussi|weitere|ähnlich|das könnte|más\b|relacionad|también te puede)/i;
const FAQ_HEADING = /^(?:faqs?\b|frequently asked|questions\b|q\s*&\s*a|preguntas|fragen|questions fréquentes)/i;
const NON_SUBJECT_HEADING =
  /^(?:conclusion|final thoughts|summary|wrap(?:ping)? up|introduction|intro\b|how to (?:get|use|download|read|choose|pick|plan|start)|tips?\b|notes?\b|about\b|why\b|what you(?:'ll| will)? need|materials needed|supplies|tools\b|abbreviations|before you (?:start|begin)|getting started|plan\b|resources)/i;

export interface ArticleContextInput {
  sourceType: ArticleSourceType;
  /** Rendered article body (HTML). Use buildArticleContextFromMarkdown for Markdown. */
  html: string;
  title: string;
  excerpt?: string | null;
  language: string;
  siteId?: string | null;
  wordpressPostId?: number | null;
  omniflowArticleId?: string | null;
  featuredImage?: { url: string; alt?: string | null; caption?: string | null } | null;
  categories?: string[];
  tags?: string[];
  permalink?: string | null;
}

interface DraftSection {
  level: 1 | 2 | 3;
  heading: string;
  paragraphs: string[];
  images: Array<{ url: string; alt: string; caption: string }>;
  navigation: boolean;
}

function subjectOf(heading: string): string {
  return heading.replace(NUMBERED_HEADING, '').trim();
}

function classify(draft: DraftSection, index: number, listicle: boolean): ArticleSectionKind {
  if (index === 0) return 'intro';
  const heading = draft.heading.trim();
  if (heading.endsWith('?') || FAQ_HEADING.test(heading)) return 'faq';
  if (listicle) return NUMBERED_HEADING.test(heading) ? 'subject' : 'support';
  if (NON_SUBJECT_HEADING.test(heading)) return 'support';
  const textLength = draft.paragraphs.join(' ').length;
  return textLength >= 80 || draft.images.length > 0 ? 'subject' : 'support';
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Descriptive sentences: at least two visual terms beyond the project noun. */
function descriptiveSentences(text: string): string[] {
  return sentencesOf(text).filter((sentence) => {
    if (sentence.length < 30 || sentence.length > 260) return false;
    return countVisualTerms(extractVisualAttributes(sentence), ['materials', 'colors', 'techniques', 'patterns', 'shapes', 'textures']) >= 2;
  });
}

/**
 * Builds the shared article model from rendered HTML. Pure: no I/O. Text is
 * cleaned (no URL, no instruction-like sentence, no angle bracket) before it
 * is stored, so any consumer can put it in a prompt as data.
 */
export function buildWordPressArticleContext(input: ArticleContextInput): WordPressArticleContext {
  const events = htmlToEvents(input.html.slice(0, ARTICLE_HTML_MAX_LENGTH));

  const title = cleanArticleText(input.title);
  const drafts: DraftSection[] = [{ level: 1, heading: title, paragraphs: [], images: [], navigation: false }];
  let current = drafts[0];

  for (const event of events) {
    if (event.kind === 'heading') {
      const heading = cleanArticleText(event.text);
      if (!heading) continue;
      // An H1 in the body is the article title: it does not open a section.
      if (event.level === 1 && drafts.length === 1 && current.paragraphs.length === 0) continue;
      current = { level: event.level, heading, paragraphs: [], images: [], navigation: NAVIGATION_HEADING.test(heading) };
      drafts.push(current);
    } else if (event.kind === 'text') {
      const text = cleanArticleText(event.text);
      if (text) current.paragraphs.push(text);
    } else if (event.kind === 'image') {
      current.images.push({ url: event.src, alt: cleanArticleText(event.alt), caption: '' });
    } else if (event.kind === 'caption') {
      const caption = cleanArticleText(event.text);
      const last = current.images[current.images.length - 1];
      if (last && !last.caption) last.caption = caption;
      else if (caption) current.paragraphs.push(caption);
    }
  }

  // Related-post / "explore more" blocks are links to other articles: their
  // words must never count as something this article presents.
  const kept = drafts.filter((draft, index) => index === 0 || !draft.navigation);
  const numbered = kept.filter((draft, index) => index > 0 && NUMBERED_HEADING.test(draft.heading)).length;
  const isListicle = numbered >= 3;

  // The featured image often is also a section's photo: it stays attached to
  // that section (only duplicates inside the body are dropped).
  const seenImages = new Set<string>();
  const featuredUrl = input.featuredImage?.url ?? null;

  const sections: ArticleSection[] = kept
    .map((draft, index) => {
      const id = `s${index}`;
      const images: ArticleImage[] = [];
      for (const image of draft.images) {
        if (seenImages.has(image.url) || seenImages.size >= MAX_IMAGES) continue;
        seenImages.add(image.url);
        images.push({ ...image, sectionId: id });
      }
      const text = draft.paragraphs.join('\n');
      const attributeSource = [draft.heading, text, ...images.flatMap((image) => [image.alt, image.caption])].join('\n');
      return {
        id,
        level: draft.level,
        heading: draft.heading,
        subject: subjectOf(draft.heading) || draft.heading,
        kind: classify(draft, index, isListicle),
        text,
        images,
        attributes: extractVisualAttributes(attributeSource),
      };
    })
    .filter((section) => section.kind !== 'intro' || section.text.length > 0 || section.images.length > 0);

  // No identifiable subject: the article as a whole is the subject.
  if (!sections.some((section) => section.kind === 'subject')) {
    const fallback = sections.find((section) => section.kind === 'intro') ?? sections[0];
    if (fallback) fallback.kind = 'subject';
  }

  const editorial = sections.filter((section) => section.kind === 'intro' || section.kind === 'subject');
  const all: VisualAttributes = sections.length
    ? mergeVisualAttributes(...sections.map((section) => section.attributes), extractVisualAttributes(title))
    : extractVisualAttributes(title);

  const internalImages = sections.flatMap((section) => section.images);
  const featuredImage: ArticleImage | null = featuredUrl
    ? {
        url: featuredUrl,
        alt: cleanArticleText(input.featuredImage?.alt ?? ''),
        caption: cleanArticleText(input.featuredImage?.caption ?? ''),
        sectionId: null,
      }
    : null;

  const plainText = sections.map((section) => [section.id === 's0' ? '' : section.heading, section.text].filter(Boolean).join('\n')).join('\n\n');
  const intro = sections.find((section) => section.kind === 'intro')?.text ?? '';
  const excerptSource = cleanArticleText(input.excerpt ?? '') || intro;

  return {
    sourceType: input.sourceType,
    siteId: input.siteId ?? null,
    wordpressPostId: input.wordpressPostId ?? null,
    omniflowArticleId: input.omniflowArticleId ?? null,
    title,
    excerpt: excerptSource.length > 320 ? `${excerptSource.slice(0, 320).trimEnd()}…` : excerptSource,
    plainText,
    headings: sections.filter((section) => section.id !== 's0').map((section) => ({ level: section.level, text: section.heading })),
    sections,
    isListicle,
    ...all,
    visualDetails: [...new Set(editorial.flatMap((section) => descriptiveSentences(section.text)))].slice(0, MAX_VISUAL_DETAILS),
    featuredImage,
    internalImages,
    imageAltTexts: [featuredImage, ...internalImages].flatMap((image) => (image?.alt ? [image.alt] : [])),
    categories: (input.categories ?? []).map(cleanArticleText).filter(Boolean),
    tags: (input.tags ?? []).map(cleanArticleText).filter(Boolean),
    language: input.language,
    permalink: input.permalink ?? null,
  };
}

/** Same model from an OmniFlow article body (Markdown). */
export function buildArticleContextFromMarkdown(
  markdown: string,
  input: Omit<ArticleContextInput, 'html'>
): WordPressArticleContext {
  const html = marked.parse(markdown, { async: false }) as string;
  return buildWordPressArticleContext({ ...input, html });
}

export function subjectSections(context: WordPressArticleContext): ArticleSection[] {
  return context.sections.filter((section) => section.kind === 'subject');
}

export function findSection(context: WordPressArticleContext, sectionId: string): ArticleSection | null {
  return context.sections.find((section) => section.id === sectionId) ?? null;
}
