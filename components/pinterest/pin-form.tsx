'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { generatePinsSchema } from '@/lib/validations/pinterest';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, PINS_OPTIONS } from '@/types/pinterest';
import type { SupportedLanguage, PinsOption } from '@/types/pinterest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div className="space-y-2">
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

      <div className="space-y-2">
        <Label htmlFor="keyword">Keyword</Label>
        <Input
          id="keyword"
          placeholder="e.g. small bathroom storage ideas"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          maxLength={200}
          required
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
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

      <div className="space-y-2">
        <Label htmlFor="pins">Number of Pins</Label>
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading || projects.length === 0}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          'Generate Pins'
        )}
      </Button>
    </form>
  );
}
