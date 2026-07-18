export type WordPressSourceType = 'keyword' | 'url' | 'pins';
export type WordPressGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type WordPressArticleStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface WordPressGeneration {
  id: string;
  project_id: string;
  user_id: string;
  keyword: string;
  language: string;
  source_type: WordPressSourceType;
  research_notes: string | null;
  source_pin_ids: string[] | null;
  status: WordPressGenerationStatus;
  created_at: string;
}

export type WordPressGenerationInsert = Omit<WordPressGeneration, 'id' | 'created_at' | 'status' | 'source_type' | 'research_notes' | 'source_pin_ids'> & {
  id?: string;
  status?: WordPressGenerationStatus;
  source_type?: WordPressSourceType;
  research_notes?: string | null;
  source_pin_ids?: string[] | null;
};

export interface WordPressArticle {
  id: string;
  generation_id: string;
  title: string;
  meta_title: string | null;
  slug: string;
  meta_description: string;
  content: string;
  word_count: number;
  featured_image_prompt: string | null;
  featured_image_url: string | null;
  status: WordPressArticleStatus;
  created_at: string;
}

export type WordPressArticleInsert = Omit<WordPressArticle, 'id' | 'created_at' | 'word_count' | 'status' | 'meta_title' | 'featured_image_prompt' | 'featured_image_url'> & {
  id?: string;
  word_count?: number;
  status?: WordPressArticleStatus;
  meta_title?: string | null;
  featured_image_prompt?: string | null;
  featured_image_url?: string | null;
};

export interface WordPressArticleImage {
  id: string;
  article_id: string;
  placement_marker: string;
  prompt: string;
  alt_text: string;
  url: string | null;
  position: number;
  created_at: string;
}

export type WordPressArticleImageInsert = Omit<WordPressArticleImage, 'id' | 'created_at' | 'url'> & {
  id?: string;
  url?: string | null;
};
