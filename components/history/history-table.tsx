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

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'completed' ? 'default' : status === 'failed' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{status}</Badge>;
}

export function HistoryTable({ generations }: HistoryTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Keyword</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Language</TableHead>
            <TableHead>Pins</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {generations.map((gen) => (
            <TableRow key={gen.id}>
              <TableCell className="font-medium">{gen.keyword}</TableCell>
              <TableCell className="text-muted-foreground">
                {Array.isArray(gen.projects)
                  ? gen.projects[0]?.name ?? '—'
                  : gen.projects?.name ?? '—'}
              </TableCell>
              <TableCell>
                {LANGUAGE_LABELS[gen.language as SupportedLanguage] ?? gen.language}
              </TableCell>
              <TableCell>{gen.pins_requested}</TableCell>
              <TableCell>
                <StatusBadge status={gen.status} />
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {new Date(gen.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </TableCell>
              <TableCell>
                <HistoryActions generationId={gen.id} keyword={gen.keyword} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
