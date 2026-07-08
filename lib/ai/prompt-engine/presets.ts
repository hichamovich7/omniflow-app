export const IMAGE_PROMPT_ID = 'pinterest-image-v2';

export const QUALITY_DIRECTIVES = [
  'Camera: high-end full-frame DSLR, tack-sharp focus on the main subject, shallow depth of field with soft creamy bokeh background.',
  'Lighting: soft diffused natural light with gentle directional shadows and warm golden hour tones where appropriate.',
  'Composition: clean and uncluttered, rule of thirds, strong visual hierarchy with a single clear focal point, vertical 2:3 portrait orientation filling the entire frame edge to edge with no empty margins.',
  'Colors: rich saturated natural tones, harmonious warm palette, no harsh neon or artificial colors.',
  'Detail: ultra high resolution with visible textures on all surfaces and materials, crisp fine details throughout.',
  'Mood: aspirational, polished, premium, inviting, scroll-stopping Pinterest aesthetic.',
];

export const NEGATIVE_CONSTRAINTS =
  'CRITICAL CONSTRAINTS: The image must contain absolutely no text, no typography, no letters, no numbers, no words, no captions, no titles, no watermarks, no logos, no brand names, no stamps, no overlays, no frames, no borders, no collage layouts, no split screens, no arrows, no icons, and no graphic design elements of any kind. Produce a single clean photographic image only.';

export function buildVariationDirective(version: number): string {
  return `VARIATION DIRECTIVE (version ${version}): Create a distinctly different visual interpretation of the same subject. Vary at least three of the following: camera angle (overhead, eye-level, low angle, 45-degree, close-up, wide), composition layout (centered, off-center, negative space left vs right, diagonal leading lines), lighting mood (cool morning, warm golden hour, bright midday, soft overcast, dramatic side-lit), styling and props (different arrangement, alternative surfaces, complementary accessories, seasonal elements), color temperature (warmer, cooler, more muted, more vibrant), and perspective depth (tight macro detail, medium context, wide environmental). The result must look like a fresh take by a different photographer, not a minor edit of the same shot.`;
}
