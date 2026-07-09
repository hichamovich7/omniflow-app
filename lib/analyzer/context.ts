import type { AnalysisOutput } from './types';

export function buildAnalysisContext(analysis: AnalysisOutput | null): string {
  if (!analysis) return '';
  return `Content analysis from research — align generated content with this: theme "${analysis.theme}", audience "${analysis.audience}", tone "${analysis.tone}", category "${analysis.category}". Summary: ${analysis.summary}`;
}
