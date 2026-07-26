'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createProjectSchema, updateProjectSchema } from '@/lib/validations/project';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxIcon,
  ComboboxPopup,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';

// Curated suggestions only — free text is always accepted, nothing here is
// enforced in the database. See docs/DECISIONS.md for why this stays a flat
// list rather than growing per-niche prompt logic.
const NICHE_SUGGESTIONS = [
  'Insurance',
  'Mortgages & Home Loans',
  'Legal / Attorney Services',
  'Addiction Treatment & Rehab',
  'Credit Cards & Credit Repair',
  'Cryptocurrency & Investing',
  'B2B Software / SaaS',
  'Web Hosting & Domains',
  'Personal Finance / Budgeting',
  'Real Estate',
  'Online Education & Degrees',
  'Cybersecurity / VPN',
  'Productivity & AI Tools',
  'Health & Wellness',
  'Home Organization & Decor',
  'Beauty & Personal Care',
  'Parenting & Baby',
  'Pets',
  'Travel',
  'Food & Recipes',
];

const NO_DEFAULT_LANGUAGE = 'none';

interface ProjectFormProps {
  mode: 'create' | 'edit';
  projectId?: string;
  defaultValues?: {
    name: string;
    description: string | null;
    niche: string | null;
    default_language: string | null;
  };
}

export function ProjectForm({ mode, projectId, defaultValues }: ProjectFormProps) {
  const router = useRouter();
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [description, setDescription] = useState(defaultValues?.description ?? '');
  const [niche, setNiche] = useState(defaultValues?.niche ?? '');
  const [defaultLanguage, setDefaultLanguage] = useState(defaultValues?.default_language ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const schema = mode === 'create' ? createProjectSchema : updateProjectSchema;
    const parsed = schema.safeParse({
      name,
      description: description || null,
      niche: niche || null,
      default_language: defaultLanguage || null,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);

    const url = mode === 'create' ? '/api/projects' : `/api/projects/${projectId}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      const message = json.error?.message ?? 'Something went wrong';
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    toast.success(mode === 'create' ? 'Project created' : 'Project updated');
    router.push('/projects');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="e.g. Bathroom Blog DE"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Brand Profile (optional)</Label>
        <Textarea
          id="description"
          placeholder="e.g. German Pinterest project for bathroom niche — friendly, cozy tone"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={10000}
          rows={3}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Used as context for all AI-generated content in this project.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="niche">Niche (optional)</Label>
          <Combobox items={NICHE_SUGGESTIONS} inputValue={niche} onInputValueChange={(value) => setNiche(value)}>
            <ComboboxInputGroup>
              <ComboboxInput
                id="niche"
                placeholder="e.g. Home Organization & Decor"
                maxLength={100}
                disabled={loading}
              />
              <ComboboxIcon />
            </ComboboxInputGroup>
            <ComboboxPopup>
              <ComboboxEmpty>No matches — your typed text is used as-is.</ComboboxEmpty>
              <ComboboxList>
                {(item) => (
                  <ComboboxItem key={item as string} value={item}>
                    {item as string}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxPopup>
          </Combobox>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default-language">Default Language (optional)</Label>
          <Select
            value={defaultLanguage || NO_DEFAULT_LANGUAGE}
            onValueChange={(v) => v && setDefaultLanguage(v === NO_DEFAULT_LANGUAGE ? '' : v)}
          >
            <SelectTrigger id="default-language" className="w-full" disabled={loading}>
              <span className="truncate text-sm">
                {defaultLanguage ? LANGUAGE_LABELS[defaultLanguage as SupportedLanguage] : 'None'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DEFAULT_LANGUAGE}>None</SelectItem>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pre-fills the Language field on generation forms for this project. Always changeable there.
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/projects')}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === 'create'
              ? 'Creating...'
              : 'Saving...'
            : mode === 'create'
              ? 'Create Project'
              : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
