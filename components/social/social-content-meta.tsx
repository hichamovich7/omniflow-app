import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  SOCIAL_CONTENT_PLATFORM_LABELS,
  SOCIAL_CONTENT_SOURCE_LABELS,
  sourceHref,
  type SocialContentGeneration,
} from '@/lib/social/social-content';
import { timeAgo } from '@/lib/utils/format-date';

interface SocialContentMetaProps {
  item: SocialContentGeneration & { projects: { name: string } | null };
}

/**
 * Project, platform, source, date, status, image and CTA of a saved social
 * content item (TASK-063) — shared by the /medium list and detail pages.
 * Links point inside OmniFlow only; the image and CTA URLs are shown as text
 * (the exact values saved with the content).
 */
export function SocialContentMeta({ item }: SocialContentMetaProps) {
  const href = sourceHref(item);
  return (
    <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2" data-testid="social-content-meta">
      <div className="flex flex-wrap items-center gap-1.5">
        <dt className="sr-only">Platform</dt>
        <dd>
          <Badge variant="purple">{SOCIAL_CONTENT_PLATFORM_LABELS[item.platform]}</Badge>
        </dd>
        <dt className="sr-only">Status</dt>
        <dd>
          <Badge variant={item.status === 'completed' ? 'success' : 'danger'}>
            {item.status === 'completed' ? 'Completed' : 'Failed'}
          </Badge>
        </dd>
        <dt className="sr-only">Date</dt>
        <dd className="text-muted-foreground">
          <time dateTime={item.created_at}>{timeAgo(item.created_at)}</time>
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="inline text-muted-foreground">Project: </dt>
        <dd className="inline font-medium">{item.projects?.name ?? 'Project'}</dd>
      </div>
      <div className="min-w-0">
        <dt className="inline text-muted-foreground">Source: </dt>
        <dd className="inline">
          {SOCIAL_CONTENT_SOURCE_LABELS[item.source_type]}
          {item.source_title && ' — '}
          {item.source_title &&
            (href ? (
              <Link href={href} className="underline underline-offset-2">
                {item.source_title}
              </Link>
            ) : (
              <span>{item.source_title} (source deleted)</span>
            ))}
        </dd>
      </div>
      <div className="min-w-0 break-all">
        <dt className="inline text-muted-foreground">CTA URL: </dt>
        <dd className="inline">{item.cta_url ?? 'none'}</dd>
      </div>
      <div className="min-w-0 break-all sm:col-span-2">
        <dt className="inline text-muted-foreground">Image: </dt>
        <dd className="inline">{item.image_url ?? 'none'}</dd>
      </div>
    </dl>
  );
}
