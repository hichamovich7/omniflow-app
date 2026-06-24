'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Pin } from '@/types/database';

interface ExportCsvButtonProps {
  pins: Pin[];
  keyword: string;
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function ExportCsvButton({ pins, keyword }: ExportCsvButtonProps) {
  function handleExport() {
    const headers = [
      'Title',
      'Media URL',
      'Pinterest board',
      'Description',
      'Link',
      'Publish date',
      'Keywords or tags',
    ];

    const rows = pins.map((pin) => [
      escapeCsvField(pin.title),
      pin.media_url ?? '',
      escapeCsvField(pin.board),
      escapeCsvField(pin.description),
      pin.link_url ?? '',
      pin.publish_date ?? '',
      escapeCsvField(pin.keywords),
    ]);

    const bom = '﻿';
    const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pinterest-${keyword.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}
