'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { Loader2, FileText, ImageOff } from 'lucide-react';
import { generateArticleFromPinsSchema } from '@/lib/validations/wordpress';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface PinPreview {
  id: string;
  title: string;
  imageUrl: string | null;
}

interface PinsSourceArticleFormProps {
  pins: PinPreview[];
}

export function PinsSourceArticleForm({ pins }: PinsSourceArticleFormProps) {
  const router = useRouter();
  const [researchNotes, setResearchNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = generateArticleFromPinsSchema.safeParse({
      pinIds: pins.map((p) => p.id),
      researchNotes: researchNotes.trim() || undefined,
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
      <div className="mb-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">WordPress Generator</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Source: {pins.length} selected pin{pins.length === 1 ? '' : 's'}. AI will identify their common theme and
          write one unified SEO article.
        </p>
      </div>

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
            className="min-h-20 text-sm placeholder:text-muted-foreground/40"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/5 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={loading} className="h-11 px-6 text-sm font-medium">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating... (can take up to a minute)
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate Article
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
