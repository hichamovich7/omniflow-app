import { generateText } from '@/lib/ai/engine';
import { buildContentAnalysisPrompt } from '@/lib/prompts/content-analysis';
import type { AnalysisOutput } from './types';

interface AnalyzeContentInput {
  title: string | null;
  content: string;
}

export async function analyzeContent({ title, content }: AnalyzeContentInput): Promise<AnalysisOutput> {
  const { system, user } = buildContentAnalysisPrompt({ title, content });

  const response = await generateText({
    role: 'SMART',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 1500,
  });

  return JSON.parse(response) as AnalysisOutput;
}
