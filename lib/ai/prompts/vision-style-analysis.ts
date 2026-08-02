export const VISION_STYLE_PROMPT_ID = 'vision-style-analysis-v1';

/**
 * Instructions for the VISION role when analyzing a user-uploaded reference
 * image (TASK-013). Scoped deliberately narrow: only transferable style
 * attributes, never composition/layout — see imageStyleAnalysisSchema
 * (lib/validations/vision.ts) for the matching structural guardrail.
 */
export function buildVisionStyleAnalysisPrompt() {
  const instructions = `Analyze ONLY the abstract style qualities of this image: color palette, materials/textures, mood, and lighting. Do NOT describe the composition, layout, specific objects, their positions, or how they are arranged. Do NOT describe this as a scene to recreate — extract only transferable style attributes that could apply to a completely different scene.

Respond with this exact JSON structure, no other fields:
{
  "colorPalette": ["...", "..."],
  "materials": ["...", "..."],
  "mood": "...",
  "lightingStyle": "..."
}

- colorPalette: 2 to 4 named colors (e.g. "warm oak", "soft white")
- materials: 2 to 4 materials or textures (e.g. "natural wood", "matte stone")
- mood: one short phrase, not a sentence (e.g. "bright, minimalist, Scandinavian")
- lightingStyle: one short phrase (e.g. "soft natural daylight")`;

  return { instructions };
}
