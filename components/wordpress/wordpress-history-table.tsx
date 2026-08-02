'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { WordPressHistoryRowActions } from './wordpress-history-row-actions';
import { WpSendStatusBadge } from '@/components/wordpress/wp-send-status-badge';
import { useSelection } from '@/components/editorial/selection-provider';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { timeAgo } from '@/lib/utils/format-date';
import { statusToBadgeVariant } from '@/lib/utils/status';
import type { WordPressPublishStatus } from '@/types/wordpress';

interface ArticleSummary {
  title: string;
  word_count: number;
  wp_post_id: number | null;
  publish_status: WordPressPublishStatus;
  published_at: string | null;
  scheduled_at: string | null;
  wordpress_categories: { name: string }[] | { name: string } | null;
}

interface GenerationRow {
  id: string;
  keyword: string;
  language: string;
  status: string;
  created_at: string;
  projects: { name: string }[] | { name: string } | null;
  wordpress_articles: ArticleSummary[] | ArticleSummary | null;
}

interface WordPressHistoryTableProps {
  generations: GenerationRow[];
}

export function WordPressHistoryTable({ generations }: WordPressHistoryTableProps) {
  const { isSelected, toggle } = useSelection();

  return (
    <div className="space-y-3">
      {generations.map((gen) => {
        const projectName = Array.isArray(gen.projects) ? gen.projects[0]?.name : gen.projects?.name;
        const article = Array.isArray(gen.wordpress_articles)
          ? gen.wordpress_articles[0]
          : gen.wordpress_articles;
        const displayTitle = article?.title ?? gen.keyword;
        const categoryRel = article?.wordpress_categories ?? null;
        const categoryName = Array.isArray(categoryRel) ? categoryRel[0]?.name : categoryRel?.name;
        const selected = isSelected(gen.id);

        return (
          <div
            key={gen.id}
            className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 transition-colors hover:border-border"
          >
            <label
              className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-all ${
                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border/80 hover:border-border'
              }`}
              aria-label={`Select article: ${displayTitle}`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(gen.id)}
                className="sr-only"
              />
              {selected && (
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </label>
            <Badge variant={statusToBadgeVariant(gen.status)}>{gen.status}</Badge>
            <Badge variant="outline">{categoryName ?? 'Uncategorized'}</Badge>
            {article && <WpSendStatusBadge article={article} compact />}
            <Link href={`/wordpress/${gen.id}`} className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayTitle}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
                {projectName && <span>{projectName}</span>}
                {projectName && <span>·</span>}
                <span>{LANGUAGE_LABELS[gen.language as SupportedLanguage] ?? gen.language}</span>
                {article && (
                  <>
                    <span>·</span>
                    <span>{article.word_count} words</span>
                  </>
                )}
                <span>·</span>
                <span>{timeAgo(gen.created_at)}</span>
              </div>
            </Link>
            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <WordPressHistoryRowActions generationId={gen.id} articleTitle={displayTitle} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
