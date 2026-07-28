'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Settings, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createWordPressCategorySchema, updateWordPressCategorySchema } from '@/lib/validations/wordpress-category';

export interface CategoryOption {
  id: string;
  project_id: string;
  name: string;
  wp_category_id?: number | null;
}

const CREATE_SENTINEL = '__create__';
const NONE_VALUE = 'none';

interface CategorySelectProps {
  projectId: string;
  categories: CategoryOption[];
  value: string; // '' = Uncategorized
  onChange: (categoryId: string) => void;
  onCategoriesChange: (categories: CategoryOption[]) => void;
}

export function CategorySelect({
  projectId,
  categories,
  value,
  onChange,
  onCategoriesChange,
}: CategorySelectProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const selected = categories.find((c) => c.id === value);

  function handleValueChange(v: string | null) {
    if (!v) return;
    if (v === CREATE_SENTINEL) {
      setCreateOpen(true);
      return;
    }
    onChange(v === NONE_VALUE ? '' : v);
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Select value={value || NONE_VALUE} onValueChange={handleValueChange}>
          <SelectTrigger id="category" className="w-full">
            <span className="truncate text-sm">{selected?.name ?? 'Uncategorized'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>Uncategorized</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value={CREATE_SENTINEL}>
              <Plus className="h-3.5 w-3.5" />
              New Category
            </SelectItem>
          </SelectContent>
        </Select>
        {categories.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setManageOpen(true)}
            aria-label="Manage categories"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <CreateCategoryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onCreated={(category) => {
          onCategoriesChange([...categories, category]);
          onChange(category.id);
        }}
      />

      <ManageCategoriesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        categories={categories}
        onCategoriesChange={(next) => {
          onCategoriesChange(next);
          if (value && !next.find((c) => c.id === value)) {
            onChange('');
          }
        }}
      />
    </>
  );
}

export function CreateCategoryDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onCreated: (category: CategoryOption) => void;
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName('');
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleCreate() {
    setError(null);
    const parsed = createWordPressCategorySchema.safeParse({ projectId, name });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    const res = await fetch('/api/wordpress/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Something went wrong';
      setError(message);
      toast.error(message);
      return;
    }

    toast.success('Category created');
    onCreated(json.data.category);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Category</DialogTitle>
          <DialogDescription>Categories are scoped to this project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="new-category-name">Name</Label>
          <Input
            id="new-category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Home Decor"
            maxLength={60}
            disabled={loading}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageCategoriesDialog({
  open,
  onOpenChange,
  categories,
  onCategoriesChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  onCategoriesChange: (categories: CategoryOption[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>
            Deleting a category never deletes its articles — they fall back to Uncategorized.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          <CategoryManagerList categories={categories} onCategoriesChange={onCategoriesChange} />
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

export function CategoryManagerList({
  categories,
  onCategoriesChange,
}: {
  categories: CategoryOption[];
  onCategoriesChange: (categories: CategoryOption[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(category: CategoryOption) {
    setEditingId(category.id);
    setEditingName(category.name);
  }

  async function saveEdit(id: string) {
    const current = categories.find((c) => c.id === id);
    const parsed = updateWordPressCategorySchema.safeParse({ name: editingName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (parsed.data.name === current?.name) {
      setEditingId(null);
      return;
    }

    setBusyId(id);
    const res = await fetch(`/api/wordpress/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const json = await res.json();
    setBusyId(null);

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to rename category');
      return;
    }

    onCategoriesChange(categories.map((c) => (c.id === id ? { ...c, name: json.data.category.name } : c)));
    setEditingId(null);
    toast.success('Category renamed');
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/wordpress/categories/${id}`, { method: 'DELETE' });
    setBusyId(null);
    setConfirmingDeleteId(null);

    if (!res.ok) {
      toast.error('Failed to delete category');
      return;
    }

    onCategoriesChange(categories.filter((c) => c.id !== id));
    toast.success('Category deleted');
  }

  return (
    <>
      {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
      {categories.map((category) => (
            <div key={category.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-2">
              {editingId === category.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={60}
                    autoFocus
                    className="h-8 flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(category.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => saveEdit(category.id)}
                    disabled={busyId === category.id}
                    aria-label="Save"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditingId(null)} aria-label="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : confirmingDeleteId === category.id ? (
                <>
                  <span className="flex-1 text-sm text-muted-foreground">Delete &quot;{category.name}&quot;?</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingDeleteId(null)}
                    disabled={busyId === category.id}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(category.id)}
                    disabled={busyId === category.id}
                  >
                    {busyId === category.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delete'}
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm">{category.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => startEdit(category)}
                    aria-label={`Rename ${category.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setConfirmingDeleteId(category.id)}
                    aria-label={`Delete ${category.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
      ))}
    </>
  );
}
