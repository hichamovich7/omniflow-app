'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generatePinterestCsv, downloadCsv } from '@/lib/csv/pinterest';
import type { Pin } from '@/types/database';

interface ExportCsvButtonProps {
  pins: Pin[];
  keyword: string;
}

export function ExportCsvButton({ pins, keyword }: ExportCsvButtonProps) {
  function handleExport() {
    const csv = generatePinterestCsv(pins);
    downloadCsv(csv, `pinterest-${keyword.replace(/\s+/g, '-').toLowerCase()}.csv`);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="mr-1.5 h-3.5 w-3.5" />
      Export CSV
    </Button>
  );
}
