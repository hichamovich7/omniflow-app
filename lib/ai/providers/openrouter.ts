import type { ChatMessage } from '../types';

interface OpenRouterChoice {
  message: {
    content: string;
  };
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
}

interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
}

export async function chatCompletion({
  model,
  messages,
  maxTokens,
  temperature = 0.7,
  reasoningEffort,
}: ChatCompletionOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'OmniFlow',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'json_object' },
        ...(reasoningEffort && { reasoning: { effort: reasoningEffort } }),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('OpenRouter HTTP error:', res.status, body);
      throw new Error(`OpenRouter error: ${res.status}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenRouter returned empty response');
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

interface VisionCompletionOptions {
  model: string;
  imageUrl: string;
  instructions: string;
  maxTokens?: number;
}

export async function visionCompletion({
  model,
  imageUrl,
  instructions,
  maxTokens = 500,
}: VisionCompletionOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'OmniFlow',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: instructions },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('OpenRouter Vision HTTP error:', res.status, body);
      throw new Error(`OpenRouter vision error: ${res.status}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenRouter returned empty vision response');
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}
