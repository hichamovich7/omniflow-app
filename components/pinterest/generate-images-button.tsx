'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ImageStatus } from '@/types/database';

interface GenerateImagesButtonProps {
  generationId: string;
  imageStatus: ImageStatus;
  pinsWithoutImages: number;
  selectedPinIds?: Set<string>;
  allPinsHaveImages?: boolean;
}

export function GenerateImagesButton({
  generationId,
  imageStatus,
  pinsWithoutImages,
  selectedPinIds,
  allPinsHaveImages,
}: GenerateImagesButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(imageStatus === 'processing');

  const hasSelection = selectedPinIds && selectedPinIds.size > 0;
  const isRegeneration = hasSelection && allPinsHaveImages;

  if (imageStatus === 'completed' && !hasSelection) {
    return (
      <Button variant="outline" size="sm" disabled>
        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
        Images Ready
      </Button>
    );
  }

  const count = hasSelection ? selectedPinIds.size : pinsWithoutImages;

  async function handleGenerate() {
    setLoading(true);

    const body: Record<string, unknown> = { generationId };
    if (hasSelection) {
      body.pinIds = Array.from(selectedPinIds);
    }

    const res = await fetch('/api/pinterest/generate-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
    <Button size="sm" loading={loading} onClick={handleGenerate} disabled={loading || count === 0}>
      {isRegeneration ? (
        <>
          <RefreshCw data-icon="inline-start" />
          Regenerate ({count})
        </>
      ) : imageStatus === 'partial' || imageStatus === 'failed' ? (
        <>
          <AlertTriangle data-icon="inline-start" />
          Retry ({count})
        </>
      ) : (
        <>
          <ImageIcon data-icon="inline-start" />
          Generate Images ({count})
        </>
      )}
    </Button>
  );
}
