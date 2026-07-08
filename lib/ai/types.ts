export type AIRole = 'FAST' | 'SMART' | 'VISION' | 'IMAGE';

export type AIProvider = 'openrouter' | 'openai';

export interface AIRoleConfig {
  provider: AIProvider;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}
