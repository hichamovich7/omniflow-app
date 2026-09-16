'use client';

import { useState } from 'react';
import { Circle, CircleCheck, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PriorityItem } from '@/types/dashboard';

interface TodayPrioritiesProps {
  priorities: PriorityItem[];
}

/** Initial display cap — does not block the "Add priority" affordance itself. */
const INITIAL_DISPLAY_LIMIT = 3;

/**
 * Local-only prototype: toggling "done" and adding a priority never reaches
 * Supabase — state resets on refresh. See TASK-COMMAND-CENTER-MVP.md.
 */
export function TodayPriorities({ priorities }: TodayPrioritiesProps) {
  const [items, setItems] = useState<PriorityItem[]>(() => priorities.slice(0, INITIAL_DISPLAY_LIMIT));
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState('');

  function toggleDone(id: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  }

  function addPriority() {
    const label = draft.trim();
    if (!label) return;
    setItems((prev) => [...prev, { id: `local-${prev.length}-${Date.now()}`, label, done: false }]);
    setDraft('');
    setIsAdding(false);
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-section-title">Today&apos;s Priorities</h2>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Add priority
          </button>
        )}
      </div>

      <ul className="mt-4 space-y-3">
        {items.map((priority) => (
          <li key={priority.id} className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => toggleDone(priority.id)}
              aria-pressed={priority.done}
              aria-label={priority.done ? `Mark "${priority.label}" as not done` : `Mark "${priority.label}" as done`}
              className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {priority.done ? (
                <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
              )}
            </button>
            <span className={cn('text-sm', priority.done && 'text-muted-foreground line-through')}>
              {priority.label}
            </span>
          </li>
        ))}
      </ul>

      {isAdding && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addPriority();
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (!draft.trim()) setIsAdding(false);
            }}
            placeholder="New priority…"
            maxLength={80}
            className="h-8 flex-1 rounded-lg border border-border/60 bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <button
            type="submit"
            className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Add
          </button>
        </form>
      )}

      <p className="mt-3 text-xs text-muted-foreground/70">Preview only — changes aren&apos;t saved yet.</p>
    </div>
  );
}
