import Link from 'next/link';
import { Share2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_STATUS_LABELS,
  unavailablePlatformMessage,
  type SocialPlatform,
} from '@/lib/social/platforms';
import { articlePinterestCreateHref } from '@/lib/social/pin-display';
import { cn } from '@/lib/utils';

interface SocialContentStudioProps {
  generationId: string;
}

/**
 * Social Content Studio (TASK-044). Pinterest opens the Pinterest form
 * pre-filled from this article (/pinterest/create?source=wordpress, phase 2)
 * — nothing is generated from this page. The other platforms are shown as
 * Coming soon / Planned and their buttons are disabled with no handler — a
 * click does nothing (no API call, no AI call, no database write).
 */
export function SocialContentStudio({ generationId }: SocialContentStudioProps) {
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
                <Link
                  href={articlePinterestCreateHref(generationId)}
                  className={cn(buttonVariants({ size: 'sm' }), 'mt-auto self-start')}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Generate Pinterest content
                </Link>
              </div>
            ) : (
              <UnavailablePlatformCard platform={platform} />
            )}
          </li>
        ))}
      </ul>
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
