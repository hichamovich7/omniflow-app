import { inferPhotographyStyle } from './templates/photography-styles';
import { QUALITY_DIRECTIVES, NEGATIVE_CONSTRAINTS, buildVariationDirective, IMAGE_PROMPT_ID } from './presets';

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
}

export function buildImagePrompt(pkg: PinterestPackage, version = 1): string {
  const photographyStyle = inferPhotographyStyle(pkg.board);

  const lines = [
    pkg.image_prompt,
    '',
    `Photography style: ${photographyStyle}.`,
    ...QUALITY_DIRECTIVES,
  ];

  if (version > 1) {
    lines.push('', buildVariationDirective(version));
  }

  lines.push('', NEGATIVE_CONSTRAINTS);

  return lines.join('\n');
}
