'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { generatePinsSchema } from '@/lib/validations/pinterest';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, PINS_OPTIONS } from '@/types/pinterest';
import type { SupportedLanguage, PinsOption } from '@/types/pinterest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProjectOption {
  id: string;
  name: string;
  is_default: boolean;
}

interface PinFormProps {
  projects: ProjectOption[];
}

export function PinForm({ projects }: PinFormProps) {
  const router = useRouter();
  const defaultProject = projects.find((p) => p.is_default) ?? projects[0];

  const [projectId, setProjectId] = useState(defaultProject?.id ?? '');
  const [keyword, setKeyword] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [pinsRequested, setPinsRequested] = useState<PinsOption>(10);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = generatePinsSchema.safeParse({ projectId, keyword, language, pinsRequested });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);

    const res = await fetch('/api/pinterest/generate', {
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

    toast.success('Pins generated successfully');
    router.push(`/pinterest/${json.data.generationId}`);
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project">Project</Label>
            <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
              <SelectTrigger id="project">
                <span className="truncate">
                  {projects.find((p) => p.id === projectId)?.name ?? 'Select a project'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="keyword">Keyword</Label>
            <Input
              id="keyword"
              placeholder="e.g. small bathroom storage ideas"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              maxLength={200}
              required
              disabled={loading}
              className="text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="language">Language</Label>
              <Select value={language} onValueChange={(v) => v && setLanguage(v as SupportedLanguage)}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {LANGUAGE_LABELS[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pins">Pins</Label>
              <Select
                value={String(pinsRequested)}
                onValueChange={(v) => v && setPinsRequested(Number(v) as PinsOption)}
              >
                <SelectTrigger id="pins">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PINS_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} {n === 1 ? 'Pin' : 'Pins'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            disabled={loading || projects.length === 0}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Pins
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
