import type { Pin } from '@/types/database';

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function formatPinterestPublishDate(dateString: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
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
    formatPinterestPublishDate(pin.publish_date),
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
