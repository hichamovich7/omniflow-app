import { inferPhotographyStyle } from './templates/photography-styles';
import { getSavePinMessage } from './save-pin-message';
import {
  QUALITY_DIRECTIVES,
  NEGATIVE_CONSTRAINTS,
  NEGATIVE_CONSTRAINTS_TEXT_OVERLAY,
  buildVariationDirective,
  IMAGE_PROMPT_ID,
} from './presets';

export { IMAGE_PROMPT_ID };

/**
 * The Pinterest Package is the structured output of the FAST role
 * (see lib/prompts/pinterest-pins.ts). The Prompt Engine turns it into an
 * optimized prompt for the IMAGE role — it never talks to a provider directly.
 */
export interface PinterestPackage {
  title: string;
  description: string;
  keywords: string;
  board: string;
  image_prompt: string;
  visual_format: 'photo' | 'text-overlay';
  overlay_text: string | null;
  language: string;
}

export function buildImagePrompt(pkg: PinterestPackage, version = 1): string {
  const photographyStyle = inferPhotographyStyle(pkg.board);
  const isTextOverlay = pkg.visual_format === 'text-overlay' && !!pkg.overlay_text;
  const savePinMessage = getSavePinMessage(pkg.language);

  const lines = [
    pkg.image_prompt,
    '',
    `Photography style: ${photographyStyle}.`,
    ...QUALITY_DIRECTIVES,
  ];

  if (isTextOverlay) {
    lines.push(
      '',
      `Render this exact text clearly and legibly on top of the image, well-composed within the frame: "${pkg.overlay_text}"`
    );
  }

  // Always-on, every pin, regardless of visualFormat — see docs/DECISIONS.md
  // 2026-08-28 (Save the Pin banner).
  lines.push(
    '',
    `Render this exact short call-to-action text as a small, tasteful ribbon-style banner near the bottom edge of the image, clearly legible but never covering or distracting from the main subject: "${savePinMessage}"`
  );

  if (version > 1) {
    lines.push('', buildVariationDirective(version));
  }

  lines.push('', isTextOverlay ? NEGATIVE_CONSTRAINTS_TEXT_OVERLAY : NEGATIVE_CONSTRAINTS);

  return lines.join('\n');
}
