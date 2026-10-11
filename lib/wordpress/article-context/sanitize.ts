/**
 * Text hygiene shared by every article → AI path. Article text is data: it
 * never carries a URL to the model and can never close or open a prompt
 * delimiter or pose as an instruction.
 */

// Scheme URLs, www. hosts and bare domains with a common TLD. Deliberately
// broad: a destination link is never wanted in the Pin text of this flow.
const URL_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|de|fr|es|uk|info|blog|shop|site)\b(?:\/[^\s<>"')\]]*)?/gi;

/** Removes any URL / domain from a text and tidies the spacing left behind. */
export function stripUrls(value: string): string {
  return value
    .replace(URL_PATTERN, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

export function containsUrl(value: string): boolean {
  return new RegExp(URL_PATTERN.source, 'i').test(value);
}

// Phrases that only make sense as an attempt to steer the model. Matched
// sentence by sentence; the whole sentence is dropped, the rest is kept.
const INSTRUCTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override)\b[^.!?\n]{0,40}\b(?:previous|prior|above|earlier|all|any|system)\b[^.!?\n]{0,30}\b(?:instructions?|prompts?|rules?|messages?)\b/i,
  /\b(?:new|updated|real|actual)\s+(?:system\s+)?instructions?\s*:/i,
  /\byou\s+are\s+now\b/i,
  /\b(?:system|assistant|developer)\s*(?:prompt|message)?\s*:/i,
  /\bact\s+as\s+(?:an?\s+)?(?:ai|assistant|system|language model)\b/i,
  /\b(?:respond|reply|answer)\s+only\s+with\b/i,
];

export const NEUTRALIZED_PLACEHOLDER = '[instruction-like text removed]';

/**
 * Neutralizes text taken from an article before it reaches a prompt: no angle
 * bracket survives (so `</article>` or `<system>` cannot be forged), and any
 * sentence that reads as an instruction to the model is replaced.
 */
export function neutralizeArticleText(value: string): string {
  const withoutBrackets = value.replace(/[<>]/g, ' ').replace(/[​-‍⁠﻿]/g, '');
  return withoutBrackets
    .split(/(?<=[.!?\n])/)
    .map((sentence) => (INSTRUCTION_PATTERNS.some((pattern) => pattern.test(sentence)) ? ` ${NEUTRALIZED_PLACEHOLDER} ` : sentence))
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** URL-free, neutralized, whitespace-collapsed — the only form article text takes in a prompt. */
export function cleanArticleText(value: string): string {
  return neutralizeArticleText(stripUrls(value)).replace(/\s+/g, ' ').trim();
}
