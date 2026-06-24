'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ImageStatus } from '@/types/database';

interface GenerateImagesButtonProps {
  generationId: string;
  imageStatus: ImageStatus;
  pinsWithoutImages: number;
}

export function GenerateImagesButton({
  generationId,
  imageStatus,
  pinsWithoutImages,
}: GenerateImagesButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(imageStatus === 'processing');

  if (imageStatus === 'completed') {
    return (
      <Button variant="outline" size="sm" disabled>
        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
        Images Ready
      </Button>
    );
  }

  async function handleGenerate() {
    setLoading(true);

    const res = await fetch('/api/pinterest/generate-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      console.error('Image generation error:', json);
      toast.error(json.error?.message ?? 'Image generation failed');
      setLoading(false);
      return;
    }

    const { imagesGenerated, imagesFailed } = json.data;

    if (imagesFailed > 0) {
      toast.warning(`Generated ${imagesGenerated} images, ${imagesFailed} failed`);
    } else {
      toast.success(`${imagesGenerated} images generated`);
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <Button size="sm" onClick={handleGenerate} disabled={loading || pinsWithoutImages === 0}>
      {loading ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Generating...
        </>
      ) : imageStatus === 'partial' || imageStatus === 'failed' ? (
        <>
          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
          Retry ({pinsWithoutImages})
        </>
      ) : (
        <>
          <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
          Images ({pinsWithoutImages})
        </>
      )}
    </Button>
  );
}
