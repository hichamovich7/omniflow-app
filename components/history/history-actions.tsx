'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Eye, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { generatePinterestCsv, downloadCsv } from '@/lib/csv/pinterest';
import { DeleteGenerationDialog } from './delete-generation-dialog';
import type { Pin } from '@/types/database';

interface HistoryActionsProps {
  generationId: string;
  keyword: string;
}

export function HistoryActions({ generationId, keyword }: HistoryActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`/api/generations/${generationId}`);
      const json = await res.json();

      if (!res.ok || json.error) {
        toast.error('Failed to load generation data');
        return;
      }

      const pins = json.data.pins as Pin[];
      if (pins.length === 0) {
        toast.error('No pins to export');
        return;
      }

      const csv = generatePinterestCsv(pins);
      downloadCsv(csv, `pinterest-${keyword.replace(/\s+/g, '-').toLowerCase()}.csv`);
      toast.success('CSV exported');
    } catch {
      toast.error('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Generation actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/pinterest/${generationId}`)}>
            <Eye className="mr-2 h-4 w-4" />
            View Results
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportCsv} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteGenerationDialog
        generationId={generationId}
        keyword={keyword}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
