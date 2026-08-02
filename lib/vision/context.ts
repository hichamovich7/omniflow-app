import type { ImageStyleAnalysis } from '@/lib/validations/vision';

/**
 * Same shape as lib/analyzer/context.ts::buildAnalysisContext() (TASK-024) —
 * a pure data → string transform, safe to concatenate directly into a prompt.
 */
export function buildImageAnalysisContext(analysis: ImageStyleAnalysis | null): string {
  if (!analysis) return '';
  return `Reference image style — apply these transferable attributes as art direction only, never as a composition or layout to copy: color palette ${analysis.colorPalette.join(', ')}; materials ${analysis.materials.join(', ')}; mood ${analysis.mood}; lighting ${analysis.lightingStyle}.`;
}
