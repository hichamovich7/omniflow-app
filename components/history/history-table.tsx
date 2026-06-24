import { StatusDot } from '@/components/ui/status-dot';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 text-xs font-medium uppercase tracking-wider" />
            <TableHead className="text-xs font-medium uppercase tracking-wider">Keyword</TableHead>
            <TableHead className="hidden sm:table-cell text-xs font-medium uppercase tracking-wider">
              Project
            </TableHead>
            <TableHead className="hidden md:table-cell text-xs font-medium uppercase tracking-wider">
              Language
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider">Pins</TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider">Date</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {generations.map((gen) => {
            const projectName = Array.isArray(gen.projects)
              ? gen.projects[0]?.name
              : gen.projects?.name;

            return (
              <TableRow key={gen.id} className="group">
                <TableCell>
                  <StatusDot variant={statusToVariant(gen.status)} />
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">{gen.keyword}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {projectName ? (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {projectName}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {LANGUAGE_LABELS[gen.language as SupportedLanguage] ?? gen.language}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {gen.pins_requested}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {timeAgo(gen.created_at)}
                </TableCell>
                <TableCell>
                  <HistoryActions generationId={gen.id} keyword={gen.keyword} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
