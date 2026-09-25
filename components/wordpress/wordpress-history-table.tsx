'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  DataList,
  DataListCheckbox,
  DataListRow,
  dataListMetaClass,
  MetaSeparator,
} from '@/components/shared/data-list';
import { WordPressHistoryRowActions } from './wordpress-history-row-actions';
import { WpSendStatusBadge } from '@/components/wordpress/wp-send-status-badge';
import { useSelection } from '@/components/editorial/selection-provider';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { timeAgo } from '@/lib/utils/format-date';
import { StatusBadge } from '@/components/shared/status';
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
    <DataList>
      {generations.map((gen) => {
        const projectName = Array.isArray(gen.projects)
          ? gen.projects[0]?.name
          : gen.projects?.name;
        const article = Array.isArray(gen.wordpress_articles)
          ? gen.wordpress_articles[0]
          : gen.wordpress_articles;
        const displayTitle = article?.title ?? gen.keyword;
        const categoryRel = article?.wordpress_categories ?? null;
        const categoryName = Array.isArray(categoryRel) ? categoryRel[0]?.name : categoryRel?.name;
        const selected = isSelected(gen.id);

        return (
          <DataListRow key={gen.id} selected={selected}>
            <DataListCheckbox
              checked={selected}
              onToggle={() => toggle(gen.id)}
              label={`Select article: ${displayTitle}`}
            />
            {/* Title first; badges trail on desktop and wrap under the title below `md`. */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 md:flex-nowrap">
              <Link
                href={`/wordpress/${gen.id}`}
                className="min-w-0 basis-full rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:flex-1 md:basis-0"
              >
                <p
                  className="text-sm font-medium max-md:line-clamp-2 md:truncate"
                  title={displayTitle}
                >
                  {displayTitle}
                </p>
                <p
                  className={cn(
                    'mt-0.5 md:truncate [&>span:not([aria-hidden])]:whitespace-nowrap',
                    dataListMetaClass
                  )}
                >
                  {projectName && (
                    <>
                      <span>{projectName}</span>
                      <MetaSeparator />
                    </>
                  )}
                  <span>{LANGUAGE_LABELS[gen.language as SupportedLanguage] ?? gen.language}</span>
                  {article && (
                    <>
                      <MetaSeparator />
                      <span className="tabular-nums">{article.word_count} words</span>
                    </>
                  )}
                  <MetaSeparator />
                  <span>{timeAgo(gen.created_at)}</span>
                </p>
              </Link>
              <div className="flex flex-wrap items-center gap-1.5 md:shrink-0">
                <StatusBadge status={gen.status} />
                <Badge variant="outline">{categoryName ?? 'Uncategorized'}</Badge>
                {article && <WpSendStatusBadge article={article} compact />}
              </div>
            </div>
            <WordPressHistoryRowActions generationId={gen.id} articleTitle={displayTitle} />
          </DataListRow>
        );
      })}
    </DataList>
  );
}
