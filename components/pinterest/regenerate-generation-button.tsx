'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface RegenerateGenerationButtonProps {
  projectId: string;
  keyword: string;
  language: string;
  pinsRequested: number;
}

export function RegenerateGenerationButton({
  projectId,
  keyword,
  language,
  pinsRequested,
}: RegenerateGenerationButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRegenerate() {
    setLoading(true);

    const res = await fetch('/api/pinterest/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, keyword, language, pinsRequested }),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Regeneration failed');
      setLoading(false);
      return;
    }

    toast.success('Regenerating pins...');
    router.push(`/pinterest/${json.data.generationId}`);
  }

  return (
    <Button size="sm" loading={loading} onClick={handleRegenerate} disabled={loading}>
      <RefreshCw data-icon="inline-start" />
      Regenerate
    </Button>
  );
}
