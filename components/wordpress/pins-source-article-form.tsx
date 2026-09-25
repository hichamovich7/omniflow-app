'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { FileText, ImageOff } from 'lucide-react';
import { generateArticleFromPinsSchema } from '@/lib/validations/wordpress';
import { Button } from '@/components/ui/button';
import { GeneratorHeader } from '@/components/shared/generator-header';
import { Alert } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CategorySelect, type CategoryOption } from '@/components/wordpress/category-select';

interface PinPreview {
  id: string;
  title: string;
  imageUrl: string | null;
}

interface PinsSourceArticleFormProps {
  pins: PinPreview[];
  projectId: string;
  categories: CategoryOption[];
}

export function PinsSourceArticleForm({ pins, projectId, categories: initialCategories }: PinsSourceArticleFormProps) {
  const router = useRouter();
  const [researchNotes, setResearchNotes] = useState('');
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = generateArticleFromPinsSchema.safeParse({
      pinIds: pins.map((p) => p.id),
      researchNotes: researchNotes.trim() || undefined,
      categoryId: categoryId || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);

    const res = await fetch('/api/wordpress/generate-from-pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Generation failed';
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    toast.success('Article generated successfully');
    router.push(`/wordpress/${json.data.generationId}`);
  }

  return (
    <div className="pt-8 sm:pt-16">
      {/* Hero */}
      <GeneratorHeader
        icon={FileText}
        title="WordPress Generator"
        description={
          <>
            Source: {pins.length} selected pin{pins.length === 1 ? '' : 's'}. AI will identify their common theme and
            write one unified SEO article.
          </>
        }
        className="mb-10"
      />

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8"
      >
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Selected Pins</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {pins.map((pin) => (
              <div key={pin.id} className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {pin.imageUrl ? (
                    <Image src={pin.imageUrl} alt={pin.title} width={40} height={40} className="h-10 w-10 object-cover" />
                  ) : (
                    <ImageOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground" title={pin.title}>
                  {pin.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="research-notes" className="text-xs font-medium text-muted-foreground">
            Research Notes (optional)
          </Label>
          <Textarea
            id="research-notes"
            placeholder="Paste secondary keywords, search intent, or angles to cover — e.g. from a SEMrush export or existing SEO research"
            value={researchNotes}
            onChange={(e) => setResearchNotes(e.target.value)}
            maxLength={2000}
            disabled={loading}
            className="min-h-20"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-xs font-medium text-muted-foreground">
            Category
          </Label>
          <CategorySelect
            projectId={projectId}
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCategoriesChange={setCategories}
          />
        </div>

        {error && (
          <Alert>{error}</Alert>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
          <p className="text-xs text-muted-foreground">Generation can take up to a minute.</p>
          <Button type="submit" size="lg" loading={loading} disabled={loading} className="w-full sm:w-auto">
            <FileText aria-hidden="true" data-icon="inline-start" />
            Generate Article
          </Button>
        </div>
      </form>
    </div>
  );
}
