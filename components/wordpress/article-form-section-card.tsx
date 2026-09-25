'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  step: string;
  icon: LucideIcon;
  title: string;
  description?: string;
}

/**
 * Secondary-tinted fill for inputs/selects/tiles living inside these cards
 * (visual-finish follow-up). bg-muted/bg-secondary/bg-accent are all ~L0.97
 * in light mode — barely distinguishable from bg-card's L1.0 at low opacity
 * — so a higher opacity is used to keep the tint visible in a screenshot.
 * Input/Textarea/SelectTrigger default to a transparent light-mode fill
 * (only a dark:bg-input/30 tint), so an explicit dark: override is needed
 * here too — this is a per-usage className override, not an edit to those
 * shared components, so it stays scoped to this form.
 */
export const FIELD_SURFACE_CLASS = 'bg-muted/70 dark:bg-muted/40';
export const SELECT_SURFACE_CLASS = 'bg-muted/70 dark:bg-muted/40 dark:hover:bg-muted/50';

/**
 * Shared header for every /wordpress/blog-post section (TASK-FIX-040 visual
 * finish): a discreet step number, a violet-tinted icon square (same
 * bg-primary/10 treatment as the page's own hero icon — the app's one
 * existing accent color, never a different tint per section), a visible
 * title, and an optional one-line description. Used both by the static
 * ArticleFormSectionCard below and directly inside Advanced Options'
 * interactive Collapsible trigger.
 */
export function SectionHeading({ step, icon: Icon, title, description }: SectionHeadingProps) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
        <Icon aria-hidden="true" className="h-4.5 w-4.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/* text-muted-foreground (not a faded /50 tint) — ui-ux-pro-max flags
              low-opacity small text as a contrast risk; the step number is
              redundant with the title so it stays visually secondary through
              size and font-mono alone, not through under-contrast color. */}
          <span className="font-mono text-xs text-muted-foreground">{step}</span>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

interface ArticleFormSectionCardProps extends SectionHeadingProps {
  /** Project Context and Generation Summary get a slightly stronger,
   * violet-tinted border to read as "active context" / "recap" — still the
   * same single accent color as every section's icon, not a new palette. */
  accented?: boolean;
  children: React.ReactNode;
}

/**
 * A real, visually distinct card for one form section — replaces the
 * previous single giant bg-card wrapper around the whole form (the
 * "grand bloc blanc uniforme" reported in the design brief). Each section
 * is now its own rounded-2xl/border/shadow card sitting on the page's
 * bg-background, with its content visually separated from its header by a
 * border-t divider.
 */
export function ArticleFormSectionCard({ step, icon, title, description, accented, children }: ArticleFormSectionCardProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-card',
        accented ? 'border-primary/30 shadow-md ring-1 ring-primary/15' : 'border-border shadow-sm'
      )}
    >
      <div className="bg-primary/5 px-5 py-4 sm:px-6">
        <SectionHeading step={step} icon={icon} title={title} description={description} />
      </div>
      <div className="space-y-4 border-t border-border px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}
