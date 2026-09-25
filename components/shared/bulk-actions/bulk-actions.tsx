'use client';

import { useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface BulkActionsProps {
  selectedCount: number;
  onClearSelection: () => void;
  /** `sm` `Button`s: neutral actions as outline, destructive ones as `destructive`. */
  children: React.ReactNode;
  mobileSticky?: boolean;
  className?: string;
}

// Canonical bulk-selection bar: a named region on the `--selected` surface with a
// 14 px radius, the count first (14 px / 500, tabular), the caller's actions,
// then a labelled "Clear". Buttons are `sm` (36 px, 44 px below `md`); the
// actions move to their own line when they don't fit beside the count.
// The count is also announced from a status region that stays mounted, so the
// first selection is heard too.
export function BulkActions({
  selectedCount,
  onClearSelection,
  children,
  mobileSticky = false,
  className,
}: BulkActionsProps) {
  const countLabel = `${selectedCount} selected`;
  const sectionRef = useRef<HTMLElement>(null);

  // Clearing unmounts the bar; move focus to the next focusable element after
  // it (usually the first row) instead of letting it fall back to <body>.
  function handleClear() {
    const section = sectionRef.current;
    const next = section
      ? Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).find(
          (el) =>
            !section.contains(el) &&
            section.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING &&
            el.getClientRects().length > 0
        )
      : undefined;
    onClearSelection();
    requestAnimationFrame(() => next?.focus());
  }

  return (
    <>
      <p role="status" className="sr-only">
        {selectedCount > 0 ? countLabel : ''}
      </p>
      {selectedCount > 0 && (
        <section
          ref={sectionRef}
          aria-label="Bulk actions"
          className={cn(
            'z-30 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-selected p-2',
            mobileSticky &&
              'fixed inset-x-3 bottom-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-sm md:static md:pb-2 md:shadow-none',
            className
          )}
        >
          <p className="px-2 text-sm font-medium text-foreground tabular-nums">{countLabel}</p>
          <div className="flex flex-[1_1_auto] flex-wrap items-center gap-2">{children}</div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={handleClear}
            aria-label="Clear selection"
          >
            <X aria-hidden="true" />
            Clear
          </Button>
        </section>
      )}
    </>
  );
}
