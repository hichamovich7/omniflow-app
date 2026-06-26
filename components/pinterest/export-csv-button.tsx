'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generatePinterestCsv, downloadCsv } from '@/lib/csv/pinterest';
import type { Pin } from '@/types/database';

interface ExportCsvButtonProps {
  pins: Pin[];
  keyword: string;
  selectedPinIds?: Set<string>;
}

export function ExportCsvButton({ pins, keyword, selectedPinIds }: ExportCsvButtonProps) {
  function handleExport() {
    const pinsToExport = selectedPinIds && selectedPinIds.size > 0
      ? pins.filter(p => selectedPinIds.has(p.id))
      : pins;
    const csv = generatePinterestCsv(pinsToExport);
    downloadCsv(csv, `pinterest-${keyword.replace(/\s+/g, '-').toLowerCase()}.csv`);
  }

  const count = selectedPinIds && selectedPinIds.size > 0 ? selectedPinIds.size : undefined;

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="mr-1.5 h-3.5 w-3.5" />
      Export{count ? ` (${count})` : ' CSV'}
    </Button>
  );
}
