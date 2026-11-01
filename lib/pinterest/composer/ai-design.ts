import sharp from 'sharp';
import { LANGUAGE_LABELS, type SupportedLanguage } from '@/types/pinterest';
import type { ImageReference } from '@/lib/ai/services/image';
import type { ListicleV2Metadata } from './content';

/**
 * TASK-088 — "AI-generated design" of a numbered Pin (the default since v3.3.0). The
 * article photo goes to the image model as a reference; the model draws the
 * whole Pin, text included, and OmniFlow adds no overlay afterwards. The
 * Pinterest title, description and keywords stay the official text: what the
 * model writes in the image is not checked (`aiTextUnverified`).
 */

/** Longest side of the reference sent to the model (re-encoded JPEG, no metadata). */
export const AI_DESIGN_REFERENCE_MAX_SIDE = 1536;

/** The article photo re-encoded by OmniFlow: EXIF orientation applied, metadata dropped, ≤ 1536 px. */
export async function prepareAiDesignReference(photo: Buffer): Promise<ImageReference> {
  try {
    const buffer = await sharp(photo)
      .rotate()
      .resize({ width: AI_DESIGN_REFERENCE_MAX_SIDE, height: AI_DESIGN_REFERENCE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { buffer, mimeType: 'image/jpeg' };
  } catch {
    throw new Error('The article photo could not be read');
  }
}

function quote(text: string): string {
  return `"${text.replace(/"/g, "'")}"`;
}

/**
 * The image prompt, from the Pin's validated contract only: the visual title,
 * the article's number, its language, the niche, the section subject and the
 * CTA (already null without a Destination URL — metadataForRender()).
 */
export function buildListicleAiDesignPrompt(input: {
  metadata: ListicleV2Metadata;
  niche: string | null;
}): string {
  const { metadata } = input;
  const { displayTitle, number, cta } = metadata.text;
  const language = LANGUAGE_LABELS[metadata.language as SupportedLanguage] ?? metadata.language;
  const subject = metadata.sourceHeadings[0]?.replace(/^\s*\d+\s*[.)]\s*/, '').trim() || displayTitle;
  const niche = input.niche?.trim();

  return [
    'Design one finished vertical Pinterest Pin, 2:3 portrait (1000×1500), as a single image.',
    `Context: one idea from a${niche ? ` ${niche}` : 'n'} article that lists ${number} ideas. This Pin shows the idea: ${quote(subject)}.`,
    'REFERENCE PHOTO: use the attached photo as the main image. Keep its exact subject recognizable — the same object, shape, colours, materials and details. Do not replace it with another object, do not redraw it as a different design, do not add objects, props, ingredients or decorations that are not in the photo. You may reframe it for 2:3, extend its own background and adjust light for a premium look.',
    'The photo must dominate the Pin. Keep all text in one calm area (no more than about a third of the height) and never over the subject.',
    'Style: premium editorial Pinterest design, clean and modern, typography integrated naturally into the composition, excellent readability on a phone.',
    `Content language: ${language}. Reproduce the text below exactly, letter by letter — do not translate, rephrase or add words.`,
    `Number: show ${quote(number)} in digits, prominently (for example a bold numeral or badge). It is the article's real number of ideas.`,
    `Title: ${quote(displayTitle)} — the largest words, on two or three short lines at most.`,
    cta
      ? `Call to action: ${quote(cta)} — small and discreet, optional if it does not fit cleanly.`
      : 'No call to action, no button.',
    'STRICT TEXT CONSTRAINT: no other text anywhere — no list, no steps, no extra numbers, no captions, no claims, no prices, no URL, no hashtag, no logo, no watermark, no brand name. Do not copy any text that may appear in the reference photo.',
    'Output a polished final image: no mockup, no frame, no border, no collage, no split screen, no screenshot.',
  ].join('\n\n');
}
