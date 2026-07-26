export type UserRole = 'user' | 'admin' | 'superadmin';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  credits_balance: number;
  plan: 'free' | 'starter' | 'pro';
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  niche: string | null;
  default_language: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ImageStatus = 'none' | 'processing' | 'completed' | 'partial' | 'failed';

export interface Generation {
  id: string;
  project_id: string;
  user_id: string;
  keyword: string;
  language: string;
  pins_requested: number;
  website_url: string | null;
  pinterest_url: string | null;
  reference_image_url: string | null;
  model_used: string;
  credits_used: number;
  status: GenerationStatus;
  image_status: ImageStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Board {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type BoardInsert = Omit<Board, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export interface Pin {
  id: string;
  generation_id: string;
  language: string;
  title: string;
  description: string;
  keywords: string;
  board: string;
  board_id: string | null;
  image_prompt: string;
  image_analysis: string | null;
  media_url: string | null;
  link_url: string | null;
  publish_date: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfileInsert = Omit<Profile, 'created_at' | 'updated_at' | 'credits_balance' | 'plan' | 'role'> & {
  credits_balance?: number;
  plan?: Profile['plan'];
  role?: UserRole;
};

export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at' | 'is_default'> & {
  id?: string;
  is_default?: boolean;
};

export type GenerationInsert = Omit<Generation, 'id' | 'created_at' | 'updated_at' | 'status' | 'credits_used' | 'error_message'> & {
  id?: string;
  status?: GenerationStatus;
  credits_used?: number;
  error_message?: string | null;
};

export type PinInsert = Omit<Pin, 'id' | 'created_at' | 'updated_at' | 'board_id'> & {
  id?: string;
  board_id?: string | null;
};

export type ResearchSourceType = 'keyword' | 'website' | 'blog' | 'pinterest';
export type ResearchStatus = 'completed' | 'failed';

export interface ResearchResult {
  id: string;
  project_id: string;
  user_id: string;
  source_type: ResearchSourceType;
  input: string;
  title: string | null;
  content: string;
  source_url: string | null;
  status: ResearchStatus;
  error_message: string | null;
  created_at: string;
}

export type ResearchResultInsert = Omit<ResearchResult, 'id' | 'created_at' | 'status' | 'error_message'> & {
  id?: string;
  status?: ResearchStatus;
  error_message?: string | null;
};

export interface ContentAnalysis {
  id: string;
  research_result_id: string;
  project_id: string;
  user_id: string;
  theme: string;
  keywords: string;
  audience: string;
  tone: string;
  category: string;
  summary: string;
  created_at: string;
}

export type ContentAnalysisInsert = Omit<ContentAnalysis, 'id' | 'created_at'> & {
  id?: string;
};

export interface PinImage {
  id: string;
  pin_id: string;
  storage_path: string;
  url: string;
  is_active: boolean;
  version: number;
  created_at: string;
}

export type PinImageInsert = Omit<PinImage, 'id' | 'created_at'> & {
  id?: string;
};

export interface RateLimitBypassEntry {
  id: string;
  email: string;
  added_at: string;
}
