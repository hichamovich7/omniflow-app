'use client';

import { useId, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseStoredQualityReportOpen,
  qualityReportStorageKey,
  serializeQualityReportOpen,
} from '@/lib/wordpress/quality-report-view';

// Same approach as the sidebar groups (components/layout/sidebar.tsx):
// localStorage is an external store read through useSyncExternalStore, so the
// server / first client render uses `defaultOpen` and no effect + setState is
// needed. The snapshot is a primitive, so it is stable between renders.
const listeners = new Set<() => void>();
// In-memory copy so the toggle keeps working for this page view when
// localStorage is unavailable (private mode, blocked site data).
const memoryOpen = new Map<string, boolean>();

function readStoredOpen(key: string): boolean | null {
  try {
    const stored = parseStoredQualityReportOpen(localStorage.getItem(key));
    if (stored !== null) return stored;
  } catch {
    // fall through to the in-memory value
  }
  return memoryOpen.get(key) ?? null;
}

function writeStoredOpen(key: string, open: boolean) {
  memoryOpen.set(key, open);
  try {
    localStorage.setItem(key, serializeQualityReportOpen(open));
  } catch {
    // the in-memory value above is enough for this page view
  }
  listeners.forEach((listener) => listener());
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

interface QualityReportDisclosureProps {
  generationId: string;
  /** Used until the viewer toggles the card for this generation. */
  defaultOpen: boolean;
  /** Shown next to the title, always visible (status badge). */
  aside?: ReactNode;
  /** Shown under the title, always visible (one-line summary). */
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Collapsible shell of the Quality report card on /wordpress/[id]. Only the
 * open/closed state lives here; the report content stays server-rendered and
 * is passed as children. It never touches export, copy, save or publish.
 */
export function QualityReportDisclosure({
  generationId,
  defaultOpen,
  aside,
  summary,
  children,
  className,
}: QualityReportDisclosureProps) {
  const storageKey = qualityReportStorageKey(generationId);
  const stored = useSyncExternalStore(
    subscribe,
    () => readStoredOpen(storageKey),
    () => null
  );
  const open = stored ?? defaultOpen;
  const panelId = useId();

  return (
    <section aria-labelledby={`${panelId}-title`} className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${panelId}-title`} className="text-sm font-medium">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => writeStoredOpen(storageKey, !open)}
            className="flex items-center gap-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
          >
            <ShieldCheck aria-hidden="true" className="size-4 text-muted-foreground" />
            Quality report
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
            />
          </button>
        </h2>
        {aside}
      </div>
      {summary}
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
