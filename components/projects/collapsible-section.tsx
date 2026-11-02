'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * TASK-092: one block of the project workspace (Brand Profile, WordPress,
 * Niche settings, Pinterest). `id` is the in-page navigation anchor; the
 * header button folds / unfolds the body; actions stay visible when folded.
 */
export function CollapsibleSection({
  id,
  title,
  description,
  actions,
  defaultOpen = true,
  testId,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section id={id} className="scroll-mt-20 overflow-hidden rounded-2xl border border-border/60 bg-card" data-testid={testId}>
      <div className={cn('flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6', open && 'border-b border-border/60')}>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={open}
              aria-controls={bodyId}
              className="flex min-h-11 items-center gap-2 text-left"
            >
              <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {title}
            </button>
          </h2>
          {description && <p className="-mt-1.5 pl-6 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div id={bodyId} hidden={!open} className="px-4 py-4 sm:px-6">
        {children}
      </div>
    </section>
  );
}
