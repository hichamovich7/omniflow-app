import { addPinterestUtm } from '@/lib/analytics/utm';
import type { Pin } from '@/types/database';

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * "Publish date" column: the stored instant written in **UTC**, as
 * `YYYY-MM-DDTHH:mm:ss` (TASK-048). Pinterest reads this offset-less value
 * as UTC and shows it in the account's zone — the reported case: a value of
 * 15:00:00 appeared at 17:00 in Madrid (UTC+2). Writing the browser's local
 * hour here was the second conversion of the 13:00 → 15:00 → 17:00 bug.
 * UTC getters only: the result never depends on the browser's zone.
 */
export function formatPinterestPublishDate(dateString: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

// Pinterest's own Bulk Upload convention: "Board" alone, or "Board/Section"
// when the pin has a section within that board. Always the existing
// "Pinterest board" column — never a separate column — and never
// "/Section" alone when the pin has no board.
export function formatPinterestBoardCell(pin: Pin): string {
  const boardName = pin.board;
  const boardSection = pin.board_section;
  return boardName && boardSection ? `${boardName}/${boardSection}` : boardName ?? '';
}

export interface PinterestCsvOptions {
  /**
   * Adds utm_source / utm_medium / utm_content=pin-XX to each "Link" cell
   * (TASK-070). XX is the Pin's 1-based row in this CSV. Off by default here;
   * the export UIs pass the user's "Add UTM tracking" choice (checked by
   * default). Never writes back to `pins.link_url`.
   */
  utmTracking?: boolean;
}

export function formatPinterestLinkCell(pin: Pin, position: number, options: PinterestCsvOptions = {}): string {
  const link = pin.link_url ?? '';
  if (!link || !options.utmTracking) return link;
  return addPinterestUtm(link, position);
}

export function generatePinterestCsv(pins: Pin[], options: PinterestCsvOptions = {}): string {
  const headers = [
    'Title',
    'Media URL',
    'Pinterest board',
    'Description',
    'Link',
    'Publish date',
    'Keywords or tags',
  ];

  const rows = pins.map((pin, index) => [
    escapeCsvField(pin.title),
    pin.media_url ?? '',
    escapeCsvField(formatPinterestBoardCell(pin)),
    escapeCsvField(pin.description),
    escapeCsvField(formatPinterestLinkCell(pin, index + 1, options)),
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
