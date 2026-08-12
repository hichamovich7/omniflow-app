'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, FileText } from 'lucide-react';
import { generateArticleSchema, generateArticleFromUrlSchema, MAX_PASTED_CONTENT_LENGTH } from '@/lib/validations/wordpress';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CategorySelect, type CategoryOption } from '@/components/wordpress/category-select';

interface ProjectOption {
  id: string;
  name: string;
  is_default: boolean;
  default_language: string | null;
}

interface ArticleFormProps {
  projects: ProjectOption[];
  categories: CategoryOption[];
}

type SourceMode = 'keyword' | 'url';
type UrlSourceType = 'link' | 'pasted';

const CONFIRMATION_LABEL =
  "I confirm I'm using this content as research inspiration for an original article, not to reproduce it";

export function ArticleForm({ projects, categories: initialCategories }: ArticleFormProps) {
  const router = useRouter();
  const defaultProject = projects.find((p) => p.is_default) ?? projects[0];

  const [sourceMode, setSourceMode] = useState<SourceMode>('keyword');
  const [projectId, setProjectId] = useState(defaultProject?.id ?? '');
  const [keyword, setKeyword] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>(
    (defaultProject?.default_language as SupportedLanguage) ?? 'en'
  );
  const [researchNotes, setResearchNotes] = useState('');
  const [urlSourceType, setUrlSourceType] = useState<UrlSourceType>('link');
  const [sourceUrl, setSourceUrl] = useState('');
  const [pastedContent, setPastedContent] = useState('');
  const [confirmedOriginal, setConfirmedOriginal] = useState(false);
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const categoryOptions = categories.filter((c) => c.project_id === projectId);

  function handleProjectChange(nextProjectId: string) {
    setProjectId(nextProjectId);
    setCategoryId('');
    const next = projects.find((p) => p.id === nextProjectId);
    if (next?.default_language) {
      setLanguage(next.default_language as SupportedLanguage);
    }
  }

  function handleSourceModeChange(next: SourceMode) {
    setSourceMode(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (sourceMode === 'keyword') {
      const parsed = generateArticleSchema.safeParse({
        projectId,
        keyword,
        language,
        researchNotes: researchNotes.trim() || undefined,
        categoryId: categoryId || undefined,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }

      setLoading(true);

      const res = await fetch('/api/wordpress/generate', {
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
      return;
    }

    const parsed = generateArticleFromUrlSchema.safeParse({
      projectId,
      language,
      categoryId: categoryId || undefined,
      sourceType: urlSourceType,
      sourceUrl: urlSourceType === 'link' ? sourceUrl.trim() : undefined,
      pastedContent: urlSourceType === 'pasted' ? pastedContent : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);

    const res = await fetch('/api/wordpress/generate-from-url', {
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

  const submitDisabled =
    loading || projects.length === 0 || (sourceMode === 'url' && !confirmedOriginal);

  return (
    <div className="pt-8 sm:pt-16">
      {/* Hero */}
      <div className="mb-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">WordPress Generator</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Enter a keyword, or use an external source as research context, and let AI plan and write a full SEO
          article with a featured image and internal images.
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8"
      >
        <div className="space-y-1.5">
          <Label htmlFor="source-mode" className="text-xs font-medium text-muted-foreground">
            Source
          </Label>
          <Select value={sourceMode} onValueChange={(v) => v && handleSourceModeChange(v as SourceMode)}>
            <SelectTrigger id="source-mode" className="w-full min-w-0">
              <SelectValue>{sourceMode === 'keyword' ? 'Keyword' : 'External Source'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">Keyword</SelectItem>
              <SelectItem value="url">External Source</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {sourceMode === 'keyword' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="keyword" className="text-xs font-medium text-muted-foreground">
                Keyword
              </Label>
              <Input
                id="keyword"
                placeholder="e.g. small bathroom storage ideas"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                maxLength={200}
                required
                disabled={loading}
                className="h-12 text-sm placeholder:text-muted-foreground/40"
              />
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
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="url-source-type" className="text-xs font-medium text-muted-foreground">
                Input Type
              </Label>
              <Select
                value={urlSourceType}
                onValueChange={(v) => v && setUrlSourceType(v as UrlSourceType)}
              >
                <SelectTrigger id="url-source-type" className="w-full min-w-0">
                  <SelectValue>{urlSourceType === 'link' ? 'Link' : 'Paste text'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">Link</SelectItem>
                  <SelectItem value="pasted">Paste text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {urlSourceType === 'link' ? (
              <div className="space-y-1.5">
                <Label htmlFor="source-url" className="text-xs font-medium text-muted-foreground">
                  URL
                </Label>
                <Input
                  id="source-url"
                  type="url"
                  placeholder="https://example.com/blog/post-title"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  maxLength={2000}
                  required
                  disabled={loading}
                  className="h-12 text-sm placeholder:text-muted-foreground/40"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="pasted-content" className="text-xs font-medium text-muted-foreground">
                  Pasted Text
                </Label>
                <Textarea
                  id="pasted-content"
                  placeholder="Paste the article or text to use as research context"
                  value={pastedContent}
                  onChange={(e) => setPastedContent(e.target.value.slice(0, MAX_PASTED_CONTENT_LENGTH))}
                  maxLength={MAX_PASTED_CONTENT_LENGTH}
                  required
                  disabled={loading}
                  className="min-h-40 text-sm placeholder:text-muted-foreground/40"
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {pastedContent.length} / {MAX_PASTED_CONTENT_LENGTH} characters
                </p>
              </div>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              Used only as research context — the topics, angles, and key points it covers. The generated article
              is entirely new: its own outline, its own wording, never a rewrite or close paraphrase of the source.
            </p>

            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={confirmedOriginal}
                onCheckedChange={(checked) => setConfirmedOriginal(checked === true)}
                disabled={loading}
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed text-muted-foreground">{CONFIRMATION_LABEL}</span>
            </label>
          </>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="project" className="text-xs font-medium text-muted-foreground">
              Project
            </Label>
            <Select value={projectId} onValueChange={(v) => v && handleProjectChange(v)}>
              <SelectTrigger id="project" className="w-full min-w-0">
                <span className="min-w-0 truncate text-sm">
                  {projects.find((p) => p.id === projectId)?.name ?? 'Select'}
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

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="language" className="text-xs font-medium text-muted-foreground">
              Language
            </Label>
            <Select value={language} onValueChange={(v) => v && setLanguage(v as SupportedLanguage)}>
              <SelectTrigger id="language" className="w-full min-w-0">
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

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="category" className="text-xs font-medium text-muted-foreground">
              Category
            </Label>
            <CategorySelect
              projectId={projectId}
              categories={categoryOptions}
              value={categoryId}
              onChange={setCategoryId}
              onCategoriesChange={(next) => {
                setCategories((all) => [...all.filter((c) => c.project_id !== projectId), ...next]);
              }}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/5 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitDisabled} className="h-11 px-6 text-sm font-medium">
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
