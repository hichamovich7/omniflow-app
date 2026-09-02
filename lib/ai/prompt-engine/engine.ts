import { inferPhotographyStyle } from './templates/photography-styles';
import {
  QUALITY_DIRECTIVES,
  NEGATIVE_CONSTRAINTS,
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

  const lines = [
    pkg.image_prompt,
    '',
    `Photography style: ${photographyStyle}.`,
    ...QUALITY_DIRECTIVES,
  ];

  // Every on-image text element — the top title hook (visualFormat
  // 'text-overlay') and the bottom "save this pin" banner (every pin) — is
  // now composited deterministically in code after generation instead of
  // asked from the image model. See lib/pinterest/compositing.ts and
  // docs/DECISIONS.md TASK-FIX-018/019/020 for why (1/10 measured success
  // rate asking flux.2-pro to render the CTA banner in-prompt). The model is
  // therefore never asked to render any text, on any visualFormat.

  if (version > 1) {
    lines.push('', buildVariationDirective(version));
  }

  lines.push('', NEGATIVE_CONSTRAINTS);

  return lines.join('\n');
}
