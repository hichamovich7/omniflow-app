'use client';

import { useId, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { generatePinterestCsv, downloadCsv } from '@/lib/csv/pinterest';
import type { Pin } from '@/types/database';

interface ExportCsvButtonProps {
  pins: Pin[];
  keyword: string;
  selectedPinIds?: Set<string>;
}

export function ExportCsvButton({ pins, keyword, selectedPinIds }: ExportCsvButtonProps) {
  // TASK-070: UTM parameters are added to the CSV "Link" cells only.
  const [utmTracking, setUtmTracking] = useState(true);
  const utmId = useId();

  function handleExport() {
    const pinsToExport = selectedPinIds && selectedPinIds.size > 0
      ? pins.filter(p => selectedPinIds.has(p.id))
      : pins;
    const csv = generatePinterestCsv(pinsToExport, { utmTracking });
    downloadCsv(csv, `pinterest-${keyword.replace(/\s+/g, '-').toLowerCase()}.csv`);
  }

  const count = selectedPinIds && selectedPinIds.size > 0 ? selectedPinIds.size : undefined;

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Export{count ? ` (${count})` : ' CSV'}
      </Button>
      <label htmlFor={utmId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox
          id={utmId}
          checked={utmTracking}
          onCheckedChange={(checked) => setUtmTracking(checked === true)}
        />
        Add UTM tracking
      </label>
    </div>
  );
}
