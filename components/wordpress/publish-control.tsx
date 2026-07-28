'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { publishStatusToBadgeVariant } from '@/lib/utils/status';
import type { PublishMode } from '@/lib/validations/wordpress-publish';
import type { WordPressArticle } from '@/types/wordpress';

const MODE_LABELS: Record<PublishMode, string> = {
  draft: 'Save as Draft',
  now: 'Publish Now',
  schedule: 'Schedule',
};

function getDefaultScheduledDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

interface PublishControlProps {
  generationId: string;
  article: Pick<WordPressArticle, 'id' | 'slug' | 'publish_status' | 'wp_post_id' | 'published_at' | 'publish_error'>;
  wordpressSite: { id: string; site_url: string };
}

export function PublishControl({ generationId, article, wordpressSite }: PublishControlProps) {
  const router = useRouter();
  const [mode, setMode] = useState<PublishMode>('draft');
  const [scheduledDate, setScheduledDate] = useState(getDefaultScheduledDate());
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);

    const res = await fetch(`/api/wordpress/${generationId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        ...(mode === 'schedule' ? { scheduledDate, scheduledTime } : {}),
      }),
    });
    const json = await res.json();

    setLoading(false);

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to publish to WordPress');
      router.refresh();
      return;
    }

    toast.success(
      mode === 'draft'
        ? 'Saved as draft on WordPress'
        : mode === 'now'
          ? 'Published to WordPress'
          : 'Scheduled on WordPress'
    );
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="publish-mode">Publish to {wordpressSite.site_url}</Label>
          <Select value={mode} onValueChange={(v) => v && setMode(v as PublishMode)}>
            <SelectTrigger id="publish-mode" className="w-44" disabled={loading}>
              <span className="text-sm">{MODE_LABELS[mode]}</span>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABELS) as PublishMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {mode === 'schedule' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="scheduled-date">Date</Label>
              <Input
                id="scheduled-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled-time">Time</Label>
              <Input
                id="scheduled-time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        )}

        <Button type="button" onClick={handleSubmit} disabled={loading}>
          <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
          {loading ? 'Publishing...' : MODE_LABELS[mode]}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={publishStatusToBadgeVariant(article.publish_status)}>{article.publish_status}</Badge>
        {article.published_at && (
          <span className="text-muted-foreground">{new Date(article.published_at).toLocaleString()}</span>
        )}
        {article.wp_post_id && (
          <a
            href={`${wordpressSite.site_url}/?p=${article.wp_post_id}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            View on WordPress
          </a>
        )}
      </div>
      {article.publish_status === 'failed' && article.publish_error && (
        <p className="text-sm text-destructive">{article.publish_error}</p>
      )}
    </div>
  );
}
