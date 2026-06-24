import type { Pin } from '@/types/database';

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function generatePinterestCsv(pins: Pin[]): string {
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
  return bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
