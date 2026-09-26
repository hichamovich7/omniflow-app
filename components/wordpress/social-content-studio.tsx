'use client';

import { useState } from 'react';
import { AlertCircle, Copy, Loader2, Share2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_STATUS_LABELS,
  unavailablePlatformMessage,
  type SocialPlatform,
} from '@/lib/social/platforms';
import type { ArticlePinterestPin, ArticlePinterestResult } from '@/lib/social/pinterest-from-article';

interface SocialContentStudioProps {
  generationId: string;
}

const GENERIC_ERROR = 'Pinterest content generation failed. Please try again.';

function pinAsText(pin: ArticlePinterestPin): string {
  return `Title: ${pin.title}\nDescription: ${pin.description}\nKeywords: ${pin.keywords}\nBoard: ${pin.board}`;
}

/**
 * Social Content Studio (TASK-044 phase 1). Pinterest generates content from
 * this article; the other platforms are shown as Coming soon / Planned and
 * their buttons are disabled with no handler — a click does nothing (no API
 * call, no AI call, no database write). Results are shown only, never saved
 * or published.
 */
export function SocialContentStudio({ generationId }: SocialContentStudioProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArticlePinterestResult | null>(null);

  async function generatePinterest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/wordpress/${generationId}/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'pinterest' }),
      });
      const json = (await res.json()) as {
        data: ArticlePinterestResult | null;
        error: { message: string } | null;
      };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? GENERIC_ERROR);
        return;
      }
      setResult(json.data);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  async function copyPin(pin: ArticlePinterestPin) {
    try {
      await navigator.clipboard.writeText(pinAsText(pin));
      toast.success('Pin copied to clipboard');
    } catch {
      toast.error('Failed to copy Pin');
    }
  }

  return (
    <section
      aria-labelledby="social-content-studio-title"
      className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
      data-testid="social-content-studio"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-accent-soft text-brand-accent">
          <Share2 className="h-4 w-4" />
        </div>
        <div>
          <h2 id="social-content-studio-title" className="text-base font-semibold">
            Social Content Studio
          </h2>
          <p className="text-sm text-muted-foreground">
            Turn this article into social content. Nothing is published and the article is never modified.
          </p>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SOCIAL_PLATFORMS.map((platform) => (
          <li key={platform.id}>
            {platform.status === 'available' ? (
              <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-background p-4">
                <PlatformHeader platform={platform} />
                <Button
                  size="sm"
                  onClick={generatePinterest}
                  disabled={loading}
                  aria-busy={loading}
                  className="mt-auto self-start"
                >
                  {loading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {loading ? 'Generating…' : result ? 'Regenerate Pinterest content' : 'Generate Pinterest content'}
                </Button>
              </div>
            ) : (
              <UnavailablePlatformCard platform={platform} />
            )}
          </li>
        ))}
      </ul>

      <div aria-live="polite" className="mt-4 space-y-3">
        {loading && (
          <p className="text-sm text-muted-foreground">Generating Pinterest content from this article…</p>
        )}

        {error && !loading && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive-soft p-3 text-sm text-destructive-hover"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-3" data-testid="social-pinterest-result">
            <p className="text-xs text-muted-foreground">
              {result.pins.length} Pins for “{result.keyword}” · {result.language.toUpperCase()} · not saved — copy
              what you need.
            </p>
            {result.featuredImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.featuredImageUrl}
                alt={`Featured image of ${result.articleTitle}`}
                className="h-40 w-auto rounded-xl border border-border/60 object-cover"
              />
            )}
            <ol className="space-y-3">
              {result.pins.map((pin, index) => (
                <li key={index} className="rounded-xl border border-border bg-background p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge variant="outline">{pin.angle}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => copyPin(pin)}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                  <p className="font-medium">{pin.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{pin.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium">Keywords:</span> {pin.keywords}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Board:</span> {pin.board}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

function PlatformHeader({ platform }: { platform: SocialPlatform }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{platform.label}</span>
        <Badge variant={platform.status === 'available' ? 'success' : 'outline'}>
          {SOCIAL_PLATFORM_STATUS_LABELS[platform.status]}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{platform.description}</p>
    </div>
  );
}

// Deliberately no onClick: a disabled platform can never trigger a request.
function UnavailablePlatformCard({ platform }: { platform: SocialPlatform }) {
  const message = unavailablePlatformMessage(platform);
  const messageId = `social-platform-${platform.id}-status`;
  return (
    <div
      className="flex h-full flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4"
      title={message}
      data-platform={platform.id}
      data-status={platform.status}
    >
      <PlatformHeader platform={platform} />
      <p id={messageId} className="sr-only">
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        aria-disabled="true"
        aria-describedby={messageId}
        className="mt-auto self-start"
      >
        {SOCIAL_PLATFORM_STATUS_LABELS[platform.status]}
      </Button>
    </div>
  );
}
