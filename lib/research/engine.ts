import { scrapeUrl, searchWeb } from './providers/firecrawl';
import type { ResearchOutput, ResearchSourceType } from './types';

interface RunResearchInput {
  sourceType: ResearchSourceType;
  input: string;
}

export async function runResearch({ sourceType, input }: RunResearchInput): Promise<ResearchOutput> {
  if (sourceType === 'keyword') {
    return searchWeb(input);
  }
  return scrapeUrl(input);
}
