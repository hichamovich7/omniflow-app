'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CategoryOption } from '@/components/wordpress/category-select';

interface WpCategory {
  id: number;
  name: string;
  slug: string;
}

export function WpImportCategoriesDialog({
  open,
  onOpenChange,
  siteId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  onImported: (categories: CategoryOption[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wpCategories, setWpCategories] = useState<WpCategory[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  // Reacts to `open` directly rather than to onOpenChange — onOpenChange is
  // only called by the Dialog primitive for its own internally-detected
  // events (Escape, backdrop click, an internal trigger/close element), never
  // just because a parent flips the `open` prop from the outside. Since this
  // dialog is opened externally (a plain button in categories-manager.tsx
  // calling setState), that fetch was never firing.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!open) {
        // Reset so a later open — possibly for a different site — never
        // shows a stale list or error from the previous one.
        setLoading(false);
        setLoadError(null);
        setWpCategories([]);
        setChecked(new Set());
        return;
      }

      setLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/wordpress/sites/${siteId}/categories`);
      const json = await res.json();
      if (cancelled) return;
      setLoading(false);

      if (!res.ok || json.error) {
        setLoadError(json.error?.message ?? 'Could not load WordPress categories');
        return;
      }

      const categories = json.data.categories as WpCategory[];
      setWpCategories(categories);
      setChecked(new Set(categories.map((c) => c.id)));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, siteId]);

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleImport() {
    if (checked.size === 0) return;

    setImporting(true);
    const res = await fetch(`/api/wordpress/sites/${siteId}/categories/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryIds: Array.from(checked) }),
    });
    const json = await res.json();
    setImporting(false);

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to import categories');
      return;
    }

    const imported = json.data.categories as CategoryOption[];
    toast.success(`Imported ${imported.length} categor${imported.length === 1 ? 'y' : 'ies'}`);
    onImported(imported);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from WordPress</DialogTitle>
          <DialogDescription>
            Creates an OmniFlow category for each one kept checked, already mapped to its WordPress category.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading WordPress categories...
          </p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : wpCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories found on this WordPress site.</p>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {wpCategories.map((c) => {
              const isChecked = checked.has(c.id);
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 px-2.5 py-2 text-sm"
                >
                  <span
                    className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-all ${
                      isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-border/80'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(c.id)}
                      className="sr-only"
                    />
                    {isChecked && (
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2.5 6L5 8.5L9.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{c.name}</span>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={importing || loading || checked.size === 0 || wpCategories.length === 0}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : `Import${checked.size > 0 ? ` (${checked.size})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
