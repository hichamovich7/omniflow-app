import { Badge } from '@/components/ui/badge';
import { getStatusPresentation, type StatusTone } from '@/lib/utils/status';
import { displayedPublishStatus } from '@/lib/wordpress/publish-lock';
import type { WordPressArticle } from '@/types/wordpress';

type SendStatusArticle = Pick<
  WordPressArticle,
  'wp_post_id' | 'publish_status' | 'published_at' | 'scheduled_at' | 'publish_started_at'
>;

// Specialized: combines whether the article was ever sent (`wp_post_id`) with
// `publish_status`, so the labels carry more than one stored value. Tones come
// from the shared status mapping (`lib/utils/status.ts`), not a local palette.
export function getSendStatus(article: SendStatusArticle): { label: string; tone: StatusTone } {
  // Checked first: an in-flight or unconfirmed publish says nothing reliable
  // about the previous send. A stale "publishing" lock shows as unconfirmed.
  const status = displayedPublishStatus(article);
  if (status === 'publishing') {
    return { label: 'Publishing…', tone: getStatusPresentation('publishing').tone };
  }
  if (status === 'uncertain') {
    return { label: 'Unconfirmed — check WordPress', tone: getStatusPresentation('uncertain').tone };
  }

  if (!article.wp_post_id) {
    if (article.publish_status === 'failed') {
      return { label: 'Failed to send', tone: getStatusPresentation('failed').tone };
    }
    return { label: 'Not sent to WordPress', tone: 'neutral' };
  }

  switch (article.publish_status) {
    case 'published':
    case 'scheduled':
      return {
        label:
          article.publish_status === 'scheduled' && article.scheduled_at
            ? `Scheduled for ${new Date(article.scheduled_at).toLocaleString()}`
            : getStatusPresentation(article.publish_status).label,
        tone: getStatusPresentation(article.publish_status).tone,
      };
    case 'failed':
      // wp_post_id already exists — a prior send succeeded, only the most
      // recent update attempt failed. Distinct from "never sent" above.
      return { label: 'Update failed', tone: getStatusPresentation('failed').tone };
    default:
      // A draft that exists on WordPress: the send itself succeeded.
      return { label: 'Sent as draft', tone: 'success' };
  }
}

export function WpSendStatusBadge({
  article,
  siteUrl,
  compact = false,
}: {
  article: SendStatusArticle;
  siteUrl?: string;
  compact?: boolean;
}) {
  const { label, tone } = getSendStatus(article);

  if (compact) {
    return <Badge variant={tone}>{label}</Badge>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={tone}>{label}</Badge>
      {article.published_at && siteUrl && article.wp_post_id && (
        <a
          href={`${siteUrl}/?p=${article.wp_post_id}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          View on WordPress
        </a>
      )}
    </div>
  );
}
