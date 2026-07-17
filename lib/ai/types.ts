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

// Provider-agnostic tool description. Business code passes this shape to
// generateText(); only the provider adapter (lib/ai/providers/*) knows how to
// translate a given tool into that provider's actual wire format (Rule #10/#11
// — providers/models are never chosen or spoken to directly outside lib/ai).
export interface WebSearchTool {
  type: 'openrouter:web_search';
  parameters: { max_results: number };
}

export type AITool = WebSearchTool;
