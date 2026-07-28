export type WordPressSourceType = 'keyword' | 'url' | 'pins';
export type WordPressGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type WordPressArticleStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type WordPressPublishStatus = 'draft' | 'scheduled' | 'published' | 'failed';

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
  category_id: string | null;
  created_at: string;
  wp_post_id: number | null;
  publish_status: WordPressPublishStatus;
  published_at: string | null;
  publish_error: string | null;
}

export type WordPressArticleInsert = Omit<WordPressArticle, 'id' | 'created_at' | 'word_count' | 'status' | 'meta_title' | 'featured_image_prompt' | 'featured_image_url' | 'category_id' | 'wp_post_id' | 'publish_status' | 'published_at' | 'publish_error'> & {
  id?: string;
  word_count?: number;
  status?: WordPressArticleStatus;
  meta_title?: string | null;
  featured_image_prompt?: string | null;
  featured_image_url?: string | null;
  category_id?: string | null;
  wp_post_id?: number | null;
  publish_status?: WordPressPublishStatus;
  published_at?: string | null;
  publish_error?: string | null;
};

export interface WordPressCategory {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  slug: string;
  created_at: string;
  wp_category_id: number | null;
}

export type WordPressCategoryInsert = Omit<WordPressCategory, 'id' | 'created_at' | 'wp_category_id'> & {
  id?: string;
  wp_category_id?: number | null;
};

export interface WordPressSite {
  id: string;
  project_id: string;
  user_id: string;
  site_url: string;
  wp_username: string;
  encrypted_application_password: string;
  created_at: string;
}

export type WordPressSiteInsert = Omit<WordPressSite, 'id' | 'created_at'> & {
  id?: string;
};

/**
 * The only WordPressSite shape ever allowed to reach a client component or
 * API response — encrypted_application_password must never leave the server.
 */
export type WordPressSitePublic = Omit<WordPressSite, 'encrypted_application_password'>;

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
