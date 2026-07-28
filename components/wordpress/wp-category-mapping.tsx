'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { CategoryOption } from '@/components/wordpress/category-select';

interface WpCategory {
  id: number;
  name: string;
  slug: string;
}

const NONE_VALUE = 'none';

function findBestMatch(name: string, wpCategories: WpCategory[]): WpCategory | undefined {
  const normalized = name.trim().toLowerCase();
  return (
    wpCategories.find((c) => c.name.toLowerCase() === normalized) ??
    wpCategories.find((c) => c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase()))
  );
}

export function WpCategoryMapping({
  siteId,
  categories,
  onCategoriesChange,
}: {
  siteId: string;
  categories: CategoryOption[];
  onCategoriesChange: (categories: CategoryOption[]) => void;
}) {
  const [wpCategories, setWpCategories] = useState<WpCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const autoMatchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/wordpress/sites/${siteId}/categories`);
      const json = await res.json();
      if (cancelled) return;

      if (!res.ok || json.error) {
        setLoadError(json.error?.message ?? 'Could not load WordPress categories');
        setLoading(false);
        return;
      }

      setWpCategories(json.data.categories);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // Pre-fill an editable suggestion for any category not yet mapped, once —
  // does not overwrite an existing wp_category_id and does not persist
  // anything on its own, the user still has to confirm via the Select.
  useEffect(() => {
    if (loading || wpCategories.length === 0 || autoMatchedRef.current) return;
    autoMatchedRef.current = true;

    const next = categories.map((category) => {
      if (category.wp_category_id) return category;
      const match = findBestMatch(category.name, wpCategories);
      return match ? { ...category, wp_category_id: match.id } : category;
    });

    if (next.some((c, i) => c.wp_category_id !== categories[i].wp_category_id)) {
      onCategoriesChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, wpCategories]);

  async function handleChange(category: CategoryOption, wpCategoryId: number | null) {
    setSavingId(category.id);
    const res = await fetch(`/api/wordpress/categories/${category.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wpCategoryId }),
    });
    const json = await res.json();
    setSavingId(null);

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to save the category mapping');
      return;
    }

    onCategoriesChange(
      categories.map((c) => (c.id === category.id ? { ...c, wp_category_id: wpCategoryId } : c))
    );
  }

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading WordPress categories...
      </p>
    );
  }

  if (loadError) {
    return <p className="text-xs text-destructive">{loadError}</p>;
  }

  return (
    <div className="space-y-1.5 border-t border-border/60 pt-3">
      <p className="text-xs font-medium text-muted-foreground">Map to WordPress category</p>
      {categories.map((category) => (
        <div key={category.id} className="flex items-center gap-2">
          <span className="w-32 shrink-0 truncate text-sm">{category.name}</span>
          <Select
            value={category.wp_category_id ? String(category.wp_category_id) : NONE_VALUE}
            onValueChange={(v) =>
              handleChange(category, v && v !== NONE_VALUE ? Number(v) : null)
            }
          >
            <SelectTrigger className="h-8 w-full text-sm" disabled={savingId === category.id}>
              <span className="truncate">
                {category.wp_category_id
                  ? (wpCategories.find((c) => c.id === category.wp_category_id)?.name ?? 'Unknown')
                  : 'Uncategorized'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Uncategorized</SelectItem>
              {wpCategories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
