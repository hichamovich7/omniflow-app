'use client';

import { useState } from 'react';
import { Circle, CircleCheck, Plus, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { resolvePriorityProjectName } from '@/lib/dashboard/build-command-center';
import type { PriorityItem, ProjectOption } from '@/types/dashboard';

interface TodayPrioritiesProps {
  priorities: PriorityItem[];
  /** Real projects already fetched by the Dashboard page — never re-queried here. */
  projects: ProjectOption[];
}

const NO_PROJECT_VALUE = 'none';
const NO_REPLACE_TARGET = '';

/**
 * Priorities pinned to today. Reinstated after the Phase 1.1 Hotfix removed
 * a buggy always-false gate. The mock data ships exactly `MAX_PRIORITIES`
 * items, so a plain "blocked" state would make Add permanently inert with
 * no way to free a slot (there is no delete action) — instead, at the
 * limit, Add becomes "Replace a priority": the same form, plus a required
 * picker for which existing priority to overwrite. Total count never
 * exceeds the limit, and nothing is ever silently dropped or added.
 */
export const MAX_PRIORITIES = 3;

/**
 * Local-only prototype: editing, toggling "done", changing/adding a
 * priority's project, and adding a priority never reach Supabase — state
 * resets on refresh. See TASK-COMMAND-CENTER-MVP.md.
 */
export function TodayPriorities({ priorities, projects }: TodayPrioritiesProps) {
  const [items, setItems] = useState<PriorityItem[]>(() => priorities.slice(0, MAX_PRIORITIES));
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addDraftTitle, setAddDraftTitle] = useState('');
  const [addDraftProjectId, setAddDraftProjectId] = useState<string | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState(NO_REPLACE_TARGET);

  const atLimit = items.length >= MAX_PRIORITIES;

  function toggleDone(id: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  }

  function setProjectFor(id: string, projectId: string | null) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, projectId } : item)));
  }

  function startEdit(item: PriorityItem) {
    setEditing({ id: item.id, draft: item.label });
  }

  function cancelEdit() {
    setEditing(null);
  }

  function saveEdit() {
    if (!editing) return;
    const trimmed = editing.draft.trim();
    if (!trimmed) return; // never save an empty title
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== editing.id) return item;
        if (item.label === trimmed) return item; // unchanged — no-op
        return { ...item, label: trimmed };
      })
    );
    setEditing(null);
  }

  function cancelAdd() {
    setIsAdding(false);
    setAddDraftTitle('');
    setAddDraftProjectId(null);
    setReplaceTargetId(NO_REPLACE_TARGET);
  }

  function addOrReplacePriority() {
    const label = addDraftTitle.trim();
    if (!label) return;

    if (atLimit) {
      if (!replaceTargetId) return; // a replace target is required once at the limit
      setItems((prev) =>
        prev.map((item) =>
          item.id === replaceTargetId ? { id: item.id, label, done: false, projectId: addDraftProjectId } : item
        )
      );
    } else {
      setItems((prev) => [
        ...prev,
        { id: `local-${prev.length}-${Date.now()}`, label, done: false, projectId: addDraftProjectId },
      ]);
    }
    cancelAdd();
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-section-title">Today&apos;s Priorities</h2>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            title={atLimit ? `You already have ${MAX_PRIORITIES} priorities — pick one to replace` : undefined}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {atLimit ? 'Replace a priority' : 'Add priority'}
          </button>
        )}
      </div>

      <ul className="mt-4 space-y-3">
        {items.map((priority) => {
          const isEditing = editing?.id === priority.id;
          return (
            <li key={priority.id} className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => toggleDone(priority.id)}
                aria-pressed={priority.done}
                aria-label={priority.done ? `Mark "${priority.label}" as not done` : `Mark "${priority.label}" as done`}
                className="mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {priority.done ? (
                  <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={editing.draft}
                      onChange={(event) => setEditing({ id: priority.id, draft: event.target.value })}
                      maxLength={80}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveEdit();
                        if (event.key === 'Escape') cancelEdit();
                      }}
                      className="h-7 min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={!editing.draft.trim()}
                      aria-label="Save title"
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      aria-label="Cancel editing"
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <span className={cn('block text-sm', priority.done && 'text-muted-foreground line-through')}>
                    {priority.label}
                  </span>
                )}

                <div className="mt-1">
                  <Select
                    value={priority.projectId ?? NO_PROJECT_VALUE}
                    onValueChange={(value) => {
                      if (!value) return;
                      setProjectFor(priority.id, value === NO_PROJECT_VALUE ? null : value);
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={`Project for "${priority.label}"`}
                      className="h-5.5 w-fit gap-1 rounded-full border-none bg-muted px-2 py-0 text-xs font-normal text-muted-foreground hover:bg-muted/70 [&_svg]:size-3"
                    >
                      <span className="max-w-32 truncate">{resolvePriorityProjectName(priority, projects)}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!isEditing && (
                <button
                  type="button"
                  onClick={() => startEdit(priority)}
                  aria-label={`Edit "${priority.label}"`}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {isAdding && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addOrReplacePriority();
          }}
          className="mt-3 space-y-2"
        >
          {atLimit && (
            <div>
              <label htmlFor="replace-target" className="text-xs text-muted-foreground">
                You already have {MAX_PRIORITIES} priorities — choose one to replace
              </label>
              <Select value={replaceTargetId || undefined} onValueChange={(value) => value && setReplaceTargetId(value)}>
                <SelectTrigger id="replace-target" size="sm" aria-label="Priority to replace" className="mt-1 w-full text-xs">
                  <span className="truncate">
                    {items.find((item) => item.id === replaceTargetId)?.label ?? 'Choose a priority to replace…'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              autoFocus={!atLimit}
              value={addDraftTitle}
              onChange={(event) => setAddDraftTitle(event.target.value)}
              placeholder="New priority…"
              maxLength={80}
              className="h-8 min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <button
              type="submit"
              disabled={!addDraftTitle.trim() || (atLimit && !replaceTargetId)}
              className="shrink-0 rounded text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {atLimit ? 'Replace' : 'Add'}
            </button>
            <button
              type="button"
              onClick={cancelAdd}
              aria-label={atLimit ? 'Cancel replacing a priority' : 'Cancel adding a priority'}
              className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <Select
            value={addDraftProjectId ?? NO_PROJECT_VALUE}
            onValueChange={(value) => {
              if (!value) return;
              setAddDraftProjectId(value === NO_PROJECT_VALUE ? null : value);
            }}
          >
            <SelectTrigger size="sm" aria-label="Project for new priority" className="h-7 w-fit gap-1.5 text-xs">
              <span className="truncate">{resolvePriorityProjectName({ projectId: addDraftProjectId }, projects)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </form>
      )}

      <p className="mt-3 text-xs text-muted-foreground/70">Preview only — changes aren&apos;t saved yet.</p>
    </div>
  );
}
