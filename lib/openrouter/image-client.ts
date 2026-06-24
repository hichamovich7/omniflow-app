interface ImageGenerationOptions {
  model: string;
  prompt: string;
  size: string;
  n?: number;
}

interface ImageResponseData {
  url?: string;
  b64_json?: string;
}

interface ImageGenerationResponse {
  data: ImageResponseData[];
}

export async function generateImage(options: ImageGenerationOptions): Promise<Buffer> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'OmniFlow',
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        n: options.n ?? 1,
        size: options.size,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('OpenRouter Image API error:', res.status, body);
      throw new Error(`Image generation failed: ${res.status}`);
    }

    const json = (await res.json()) as ImageGenerationResponse;
    const imageData = json.data?.[0];

    if (!imageData) {
      throw new Error('No image data in response');
    }

    if (imageData.b64_json) {
      return Buffer.from(imageData.b64_json, 'base64');
    }

    if (imageData.url) {
      const imageRes = await fetch(imageData.url);
      if (!imageRes.ok) {
        throw new Error(`Failed to download image: ${imageRes.status}`);
      }
      const arrayBuffer = await imageRes.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    throw new Error('Response contains neither url nor b64_json');
  } finally {
    clearTimeout(timeout);
  }
}
