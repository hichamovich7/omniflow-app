import Link from 'next/link';
import { StatusDot } from '@/components/ui/status-dot';
import { HistoryActions } from './history-actions';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

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
}

function statusToVariant(status: string) {
  switch (status) {
    case 'completed': return 'success' as const;
    case 'processing': return 'processing' as const;
    case 'failed': return 'error' as const;
    default: return 'neutral' as const;
  }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function HistoryTable({ generations }: HistoryTableProps) {
  return (
    <div className="space-y-2">
      {generations.map((gen) => {
        const projectName = Array.isArray(gen.projects)
          ? gen.projects[0]?.name
          : gen.projects?.name;

        return (
          <div
            key={gen.id}
            className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 transition-colors hover:border-border"
          >
            <StatusDot variant={statusToVariant(gen.status)} />
            <Link href={`/pinterest/${gen.id}`} className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{gen.keyword}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
                {projectName && <span>{projectName}</span>}
                {projectName && <span>·</span>}
                <span>{LANGUAGE_LABELS[gen.language as SupportedLanguage] ?? gen.language}</span>
                <span>·</span>
                <span>{gen.pins_requested} pins</span>
                <span>·</span>
                <span>{timeAgo(gen.created_at)}</span>
              </div>
            </Link>
            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <HistoryActions generationId={gen.id} keyword={gen.keyword} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
