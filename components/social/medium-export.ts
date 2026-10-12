'use client';

import { toast } from 'sonner';
import { mediumSummaryFilename } from '@/lib/social/medium-summary-filename';

/**
 * Copy / download for Medium content (TASK-062, TASK-063). Local only: the
 * clipboard and a browser download — no request, nothing published.
 */
export async function copyMediumContent(label: 'Markdown' | 'HTML', content: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(content);
    toast.success(`${label} copied to clipboard`);
  } catch {
    toast.error(`Failed to copy ${label}`);
  }
}

export function downloadMediumMarkdown(title: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = mediumSummaryFilename(title);
  a.click();
  URL.revokeObjectURL(url);
}

export interface MediumSummaryResponse<T> {
  data: T | null;
  error: string | null;
}

/** The only request of the Medium UI that generates: POST /api/social/medium-summary. */
export async function requestMediumSummary<T>(body: unknown): Promise<MediumSummaryResponse<T>> {
  try {
    const res = await fetch('/api/social/medium-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { data: T | null; error: { message: string } | null } | null;
    if (!res.ok || !json?.data) {
      return { data: null, error: json?.error?.message ?? 'The Medium summary could not be generated. Please try again.' };
    }
    return { data: json.data, error: null };
  } catch {
    return { data: null, error: 'Could not reach OmniFlow. Check your connection and try again.' };
  }
}
