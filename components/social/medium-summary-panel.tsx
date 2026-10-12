'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MediumSummaryResultView } from '@/components/social/medium-summary-result';
import { requestMediumSummary } from '@/components/social/medium-export';
import type { SavedMediumSummary } from '@/lib/social/medium-summary';
import type { MediumSummaryRequest } from '@/lib/validations/medium-summary';

interface MediumSummaryPanelProps {
  /** Exactly the POST /api/social/medium-summary body: an OmniFlow article or an existing WordPress post. */
  source: MediumSummaryRequest;
}

/**
 * Medium summary (TASK-062): generate on demand, preview, copy or download.
 * Each generation is saved to the Medium history (TASK-063) — when the save
 * fails the result is still shown here with a warning. Nothing is
 * published, and the WordPress article is never modified.
 */
export function MediumSummaryPanel({ source }: MediumSummaryPanelProps) {
  const [result, setResult] = useState<SavedMediumSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const response = await requestMediumSummary<SavedMediumSummary>(source);
    if (response.data) setResult(response.data);
    else setError(response.error);
    setLoading(false);
  }

  return (
    <div className="space-y-3" data-testid="medium-summary-panel">
      {!result && (
        <Button type="button" size="sm" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          {loading ? 'Generating Medium summary…' : 'Generate Medium summary'}
        </Button>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      {result && <MediumSummaryResultView result={result} onRegenerate={generate} regenerating={loading} />}
    </div>
  );
}
