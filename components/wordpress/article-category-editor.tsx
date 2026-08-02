'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { CategorySelect, type CategoryOption } from '@/components/wordpress/category-select';

interface ArticleCategoryEditorProps {
  generationId: string;
  projectId: string;
  categories: CategoryOption[];
  initialCategoryId: string | null;
  hasWpPostId: boolean;
}

export function ArticleCategoryEditor({
  generationId,
  projectId,
  categories: initialCategories,
  initialCategoryId,
  hasWpPostId,
}: ArticleCategoryEditorProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? '');
  const [saving, setSaving] = useState(false);

  async function handleChange(nextCategoryId: string) {
    const previous = categoryId;
    setCategoryId(nextCategoryId);
    setSaving(true);

    const res = await fetch(`/api/wordpress/${generationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: nextCategoryId || null }),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to update category');
      setCategoryId(previous);
      return;
    }

    toast.success('Category updated');
  }

  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-card p-4">
      <Label htmlFor="category" className="text-xs font-medium text-muted-foreground">
        Category
      </Label>
      <CategorySelect
        projectId={projectId}
        categories={categories}
        value={categoryId}
        onChange={handleChange}
        onCategoriesChange={setCategories}
      />
      {saving && <p className="text-xs text-muted-foreground">Saving...</p>}
      {hasWpPostId && (
        <p className="text-xs text-muted-foreground">
          Already sent to WordPress — the next publish/update will apply this category there.
        </p>
      )}
    </div>
  );
}
