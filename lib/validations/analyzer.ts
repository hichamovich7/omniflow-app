import { z } from 'zod';

export const analyzeRequestSchema = z.object({
  researchResultId: z.string().uuid('Invalid research result ID'),
});

export type AnalyzeRequestInput = z.infer<typeof analyzeRequestSchema>;

export const openRouterAnalysisResponseSchema = z.object({
  theme: z.string(),
  keywords: z.string(),
  audience: z.string(),
  tone: z.string(),
  category: z.string(),
  summary: z.string(),
});
