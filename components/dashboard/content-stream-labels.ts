// Display helpers for the dashboard's Content streams section, shared by the
// server section (content-streams-overview.tsx) and the client table
// (content-streams-table.tsx). No 'use client': callable from both.
import { formatDayKeyShort } from '@/lib/dashboard/local-date';
import type { ContentStreamCoverage } from '@/types/dashboard';

export function streamTargetLabel(stream: Pick<ContentStreamCoverage, 'targetPinsPerDay' | 'targetBufferDays'>): string {
  if (!stream.targetPinsPerDay || stream.targetBufferDays == null) return 'No targets set';
  return `${stream.targetPinsPerDay} Pins/day · ${stream.targetBufferDays}-day buffer`;
}

export function streamCoverageLabel(stream: Pick<ContentStreamCoverage, 'coveredThrough'>): string {
  return stream.coveredThrough ? `Covered until ${formatDayKeyShort(stream.coveredThrough)}` : 'Not covered today';
}

export function streamAction(stream: ContentStreamCoverage): { label: string; href: string } {
  const board = stream.boards[0];
  switch (stream.health) {
    case 'create-now':
    case 'needs-content':
      return stream.unscheduledPins > 0 && board
        ? { label: 'Schedule Pins', href: `/boards/${board.id}` }
        : { label: 'Create Pins', href: '/pinterest' };
    case 'on-track':
      return board ? { label: 'View board', href: `/boards/${board.id}` } : { label: 'Review', href: `/projects/${stream.projectId}` };
    default:
      return { label: 'Review stream', href: `/projects/${stream.projectId}` };
  }
}

export function boardNames(stream: ContentStreamCoverage): string {
  return stream.boards.length > 0 ? stream.boards.map((board) => board.name).join(', ') : 'No board linked';
}
