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
import { HistoryActions } from './history-actions';
import { WordPressUsageBadge } from './wordpress-usage-badge';
import { useSelection } from '@/components/editorial/selection-provider';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { timeAgo } from '@/lib/utils/format-date';
import { statusToBadgeVariant } from '@/lib/utils/status';
import type { GenerationWordPressUsage } from '@/lib/queries/wordpress-usage';

interface GenerationRow {
  id: string;
  keyword: string;
  language: string;
  pins_requested: number;
  status: string;
  created_at: string;
  projects: { name: string }[] | { name: string } | null;
}

interface HistoryTableProps {
  generations: GenerationRow[];
  wordpressUsage: Record<string, GenerationWordPressUsage>;
}

export function HistoryTable({ generations, wordpressUsage }: HistoryTableProps) {
  const { isSelected, toggle } = useSelection();

  return (
    <DataList>
      {generations.map((gen) => {
        const projectName = Array.isArray(gen.projects)
          ? gen.projects[0]?.name
          : gen.projects?.name;
        const usage = wordpressUsage[gen.id];
        const selected = isSelected(gen.id);

        return (
          <DataListRow key={gen.id} selected={selected}>
            <DataListCheckbox
              checked={selected}
              onToggle={() => toggle(gen.id)}
              label={`Select generation: ${gen.keyword}`}
            />
            {/* Title first; badges trail on desktop and wrap under the title below `md`. */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 md:flex-nowrap">
              <Link
                href={`/pinterest/${gen.id}`}
                className="min-w-0 basis-full rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:flex-1 md:basis-0"
              >
                <p
                  className="text-sm font-medium max-md:line-clamp-2 md:truncate"
                  title={gen.keyword}
                >
                  {gen.keyword}
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
                  <MetaSeparator />
                  <span className="tabular-nums">{gen.pins_requested} pins</span>
                  <MetaSeparator />
                  <span>{timeAgo(gen.created_at)}</span>
                </p>
              </Link>
              <div className="flex flex-wrap items-center gap-1.5 md:shrink-0">
                <Badge variant={statusToBadgeVariant(gen.status)}>{gen.status}</Badge>
                {usage && (
                  <WordPressUsageBadge
                    usedPinCount={usage.usedPinCount}
                    totalPinCount={usage.totalPinCount}
                    articles={usage.articles}
                  />
                )}
              </div>
            </div>
            <HistoryActions
              generationId={gen.id}
              keyword={gen.keyword}
              wordpressArticles={usage?.articles}
            />
          </DataListRow>
        );
      })}
    </DataList>
  );
}
