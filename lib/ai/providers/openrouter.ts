import type { AITool, ChatMessage } from '../types';

interface OpenRouterChoice {
  finish_reason?: string;
  error?: { message: string; code?: number };
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
  tools?: AITool[];
  /** Overrides the default 60s/90s(with plugins) fetch timeout for calls known to run long. */
  timeoutMs?: number;
}

// Translates the provider-agnostic AITool shape into OpenRouter's actual wire
// format. OpenRouter's web search is not OpenAI-style function calling — it's
// a gateway-side plugin (`plugins: [{ id: "web", max_results }]`, $4/1000
// results, Exa-backed) that augments the model's context before generation,
// so it works independently of whether the underlying model has native tool
// calling. This is the only place that OpenRouter-specific plugin shape exists.
function toOpenRouterPlugins(tools?: AITool[]): { id: string; max_results: number }[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  const plugins = tools
    .filter((tool): tool is Extract<AITool, { type: 'openrouter:web_search' }> => tool.type === 'openrouter:web_search')
    .map((tool) => ({ id: 'web', max_results: tool.parameters.max_results }));

  return plugins.length > 0 ? plugins : undefined;
}

const STREAM_ERROR_RETRY_ATTEMPTS = 3;
const STREAM_ERROR_RETRY_DELAY_MS = 500;

// OpenRouter sometimes returns HTTP 200 with a mid-stream provider failure
// embedded in the choice itself (finish_reason: "error"), after already
// emitting partial content. That partial content is not valid JSON, so it
// must be treated as a failure and retried rather than parsed.
export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= STREAM_ERROR_RETRY_ATTEMPTS; attempt++) {
    try {
      return await chatCompletionOnce(options);
    } catch (err) {
      lastError = err;
      const isStreamError = err instanceof Error && err.message.startsWith('OpenRouter stream error');
      if (!isStreamError || attempt === STREAM_ERROR_RETRY_ATTEMPTS) {
        throw err;
      }
      console.warn(`OpenRouter stream error, retrying (attempt ${attempt}/${STREAM_ERROR_RETRY_ATTEMPTS})...`);
      await new Promise((resolve) => setTimeout(resolve, STREAM_ERROR_RETRY_DELAY_MS * attempt));
    }
  }

  throw lastError;
}

async function chatCompletionOnce({
  model,
  messages,
  maxTokens,
  temperature = 0.7,
  reasoningEffort,
  tools,
  timeoutMs,
}: ChatCompletionOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const plugins = toOpenRouterPlugins(tools);

  const controller = new AbortController();
  // Web-search-augmented calls take longer than a plain completion (the
  // gateway performs the search before the model even starts generating) —
  // give them more room than the default 60s so a slow search doesn't get
  // mistaken for a hung request. An explicit timeoutMs (e.g. the WordPress
  // full-article write, which routinely runs past 60s) always wins over both.
  const effectiveTimeoutMs = timeoutMs ?? (plugins ? 90000 : 60000);
  const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);

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
        ...(plugins && { plugins }),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('OpenRouter HTTP error:', res.status, body);
      throw new Error(`OpenRouter error: ${res.status}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    const choice = data.choices?.[0];

    if (choice?.finish_reason === 'error') {
      console.error('OpenRouter stream error:', choice.error);
      throw new Error(`OpenRouter stream error: ${choice.error?.message ?? 'unknown'}`);
    }

    const content = choice?.message?.content;

    if (!content) {
      throw new Error('OpenRouter returned empty response');
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

interface ImageGenerationOptions {
  model: string;
  prompt: string;
  size: string;
}

interface OpenRouterImageResponseData {
  b64_json?: string;
}

interface OpenRouterImageResponse {
  data: OpenRouterImageResponseData[];
}

export async function generateImage({
  model,
  prompt,
  size,
}: ImageGenerationOptions): Promise<Buffer> {
  const apiKey = process.env.OPENROUTER_IMAGE_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_IMAGE_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, prompt, size }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('OpenRouter Image API error:', res.status, body);
      let message = body;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        message = parsed.error?.message ?? body;
      } catch {
        // body wasn't JSON; fall back to the raw text above.
      }
      throw new Error(`OpenRouter image generation failed: ${message}`);
    }

    const json = (await res.json()) as OpenRouterImageResponse;
    const imageData = json.data?.[0];

    if (!imageData?.b64_json) {
      throw new Error('No image data in OpenRouter response');
    }

    return Buffer.from(imageData.b64_json, 'base64');
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
