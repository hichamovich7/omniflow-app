import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { timeAgo } from '@/lib/utils/format-date';
import { statusToBadgeVariant } from '@/lib/utils/status';

interface ArticleSummary {
  title: string;
  word_count: number;
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
  return (
    <div className="space-y-3">
      {generations.map((gen) => {
        const projectName = Array.isArray(gen.projects) ? gen.projects[0]?.name : gen.projects?.name;
        const article = Array.isArray(gen.wordpress_articles)
          ? gen.wordpress_articles[0]
          : gen.wordpress_articles;

        return (
          <Link
            key={gen.id}
            href={`/wordpress/${gen.id}`}
            className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 transition-colors hover:border-border"
          >
            <Badge variant={statusToBadgeVariant(gen.status)}>{gen.status}</Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{article?.title ?? gen.keyword}</p>
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
            </div>
          </Link>
        );
      })}
    </div>
  );
}
