export type ResearchSourceType = 'keyword' | 'website' | 'blog' | 'pinterest';

export interface ResearchOutput {
  title: string | null;
  content: string;
  sourceUrl: string | null;
}
