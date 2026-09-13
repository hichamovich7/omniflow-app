import sharp from 'sharp';

interface ImageGenerationOptions {
  model: string;
  prompt: string;
  size: string;
}

interface ImageResponseData {
  b64_json?: string;
  url?: string;
}

interface ImageGenerationResponse {
  data: ImageResponseData[];
}

export async function generateImage(options: ImageGenerationOptions): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        n: 1,
        size: options.size,
        quality: 'low',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('OpenAI Image API error:', res.status, body);
      throw new Error(`Image generation failed: ${res.status}`);
    }

    const json = (await res.json()) as ImageGenerationResponse;
    const imageData = json.data?.[0];

    if (!imageData) {
      throw new Error('No image data in response');
    }

    let rawBuffer: Buffer;

    if (imageData.b64_json) {
      rawBuffer = Buffer.from(imageData.b64_json, 'base64');
    } else if (imageData.url) {
      const imageRes = await fetch(imageData.url);
      if (!imageRes.ok) {
        throw new Error(`Failed to download image: ${imageRes.status}`);
      }
      const arrayBuffer = await imageRes.arrayBuffer();
      rawBuffer = Buffer.from(arrayBuffer);
    } else {
      throw new Error('Response contains neither url nor b64_json');
    }

    // Re-encode through sharp before returning — strips all embedded metadata
    // (EXIF/XMP and gpt-image-1's C2PA content-credentials manifest) since
    // sharp only preserves metadata when .withMetadata() is explicitly
    // called. Same PNG format already used by the rest of the pipeline
    // (lib/pinterest/compositing.ts, Supabase upload contentType).
    return await sharp(rawBuffer).png().toBuffer();
  } finally {
    clearTimeout(timeout);
  }
}
