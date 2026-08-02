import { z } from 'zod';

// Deliberately only these 4 abstract fields — no free-text "description" or
// "scene" field. This is the anti-copyright guardrail for TASK-013: the
// schema itself makes it structurally impossible for a validated analysis to
// carry composition/layout information forward into a new generation. See
// docs/DECISIONS.md 2026-08-02.
export const imageStyleAnalysisSchema = z.object({
  colorPalette: z.array(z.string().trim().min(1)).min(2).max(4),
  materials: z.array(z.string().trim().min(1)).min(2).max(4),
  mood: z.string().trim().min(1).max(200),
  lightingStyle: z.string().trim().min(1).max(200),
});

export type ImageStyleAnalysis = z.infer<typeof imageStyleAnalysisSchema>;
