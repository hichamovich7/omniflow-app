'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BulkActionsProps {
  selectedCount: number;
  onClearSelection: () => void;
  children: React.ReactNode;
  mobileSticky?: boolean;
  className?: string;
}

export function BulkActions({ selectedCount, onClearSelection, children, mobileSticky = false, className }: BulkActionsProps) {
  if (selectedCount === 0) return null;
  return <section className={cn('z-30 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-surface-elevated p-2 shadow-sm', mobileSticky && 'fixed inset-x-3 bottom-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:static md:pb-2', className)} aria-label="Bulk actions" aria-live="polite"><span className="px-2 text-sm font-medium" aria-atomic="true">{selectedCount} selected</span><div className="flex flex-1 flex-wrap items-center gap-2">{children}</div><Button type="button" variant="ghost" size="icon-lg" onClick={onClearSelection} aria-label="Clear selection" title="Clear selection"><X className="h-4 w-4" /></Button></section>;
}
