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
  created_at: string;
  updated_at: string;
}

export interface Pin {
  id: string;
  generation_id: string;
  language: string;
  title: string;
  description: string;
  keywords: string;
  board: string;
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

export type GenerationInsert = Omit<Generation, 'id' | 'created_at' | 'updated_at' | 'status' | 'credits_used'> & {
  id?: string;
  status?: GenerationStatus;
  credits_used?: number;
};

export type PinInsert = Omit<Pin, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};
