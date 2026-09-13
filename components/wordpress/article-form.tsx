'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, FileText, X } from 'lucide-react';
import {
  generateArticleSchema,
  generateArticleFromUrlSchema,
  MAX_PASTED_CONTENT_LENGTH,
  ARTICLE_TYPES,
  ARTICLE_SIZES,
  TONES_OF_VOICE,
  POINTS_OF_VIEW,
  TARGET_COUNTRIES,
  HOOK_BRIEF_MAX_LENGTH,
  SEO_KEYWORDS_MAX_COUNT,
  SEO_KEYWORD_MAX_LENGTH,
} from '@/lib/validations/wordpress';
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

// Core Settings (TASK-FIX-034, "1-Click Blog Post" / Option 1 only). "None" is
// represented as an empty string in local state and stripped before the
// request is sent, so leaving every field untouched reproduces the exact
// pre-existing generation behavior.
const ARTICLE_TYPE_LABELS: Record<(typeof ARTICLE_TYPES)[number], string> = {
  'how-to': 'How-to guide',
  listicle: 'Listicle',
  'product-review': 'Product review',
  news: 'News',
  comparison: 'Comparison',
};

const ARTICLE_SIZE_LABELS: Record<(typeof ARTICLE_SIZES)[number], string> = {
  small: 'Small (~1200-2400 words, 5-8 sections)',
  medium: 'Medium (~2400-3600 words, 9-12 sections)',
  large: 'Large (~3600-5000 words, 13-16 sections)',
};

const TONE_OF_VOICE_LABELS: Record<(typeof TONES_OF_VOICE)[number], string> = {
  friendly: 'Friendly',
  professional: 'Professional',
  informational: 'Informational',
  transactional: 'Transactional',
  inspirational: 'Inspirational',
  neutral: 'Neutral',
  witty: 'Witty',
  casual: 'Casual',
};

const POINT_OF_VIEW_LABELS: Record<(typeof POINTS_OF_VIEW)[number], string> = {
  'first-singular': 'First person singular',
  'first-plural': 'First person plural',
  second: 'Second person',
  third: 'Third person',
};

const NONE_VALUE = 'none';

// Structure (TASK-FIX-035, "1-Click Blog Post" / Option 1 only). Hook Brief
// presets pre-fill the textarea and stay editable afterward — picking one
// never locks the field.
const HOOK_BRIEF_PRESETS: { label: string; text: string }[] = [
  {
    label: 'Question',
    text: "Open with a thought-provoking question that speaks directly to the reader's situation or curiosity about this topic.",
  },
  {
    label: 'Statistical or Fact',
    text: 'Open with a striking statistic or verified fact that immediately establishes relevance and credibility.',
  },
  {
    label: 'Quotation',
    text: "Open with a relevant, attributed quotation that sets the tone and connects to the article's theme.",
  },
  {
    label: 'Anecdotal or Story',
    text: 'Open with a short, relatable story or scenario that draws the reader in before getting to the point.',
  },
  {
    label: 'Personal or Emotional',
    text: "Write an emotionally resonant opening that connects personally with the reader — a reflection, a personal experience, or an emotional appeal aligned with the article's theme.",
  },
];

// Each Structure toggle is 3-state: '' ("Non défini" — default, unchanged
// behavior), 'yes' ("Oui" — force presence), 'no' ("Non" — force absence).
type ToggleValue = '' | 'yes' | 'no';

const TOGGLE_NONE_VALUE = 'unset';

function StructureToggle({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: ToggleValue;
  onChange: (value: ToggleValue) => void;
  disabled: boolean;
}) {
  const displayValue = value === 'yes' ? 'Oui' : value === 'no' ? 'Non' : 'Non défini';

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value || TOGGLE_NONE_VALUE}
        onValueChange={(v) => v && onChange(v === TOGGLE_NONE_VALUE ? '' : (v as ToggleValue))}
      >
        <SelectTrigger id={id} className="w-full min-w-0" disabled={disabled}>
          <span className="min-w-0 truncate text-sm">{displayValue}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TOGGLE_NONE_VALUE}>Non défini</SelectItem>
          <SelectItem value="yes">Oui</SelectItem>
          <SelectItem value="no">Non</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// SEO Keywords (TASK-FIX-036, "1-Click Blog Post" / Option 1 only). No
// reusable tag/chip input existed in the codebase before this task (see
// DECISIONS.md 2026-09-13 (5)) — this minimal one is scoped to this block.
function TagInput({
  id,
  values,
  onChange,
  disabled,
  maxCount,
  maxLength,
  placeholder,
}: {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled: boolean;
  maxCount: number;
  maxLength: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const atLimit = values.length >= maxCount;

  function addValue() {
    const value = draft.trim();
    if (!value || atLimit) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, value]);
    setDraft('');
  }

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                disabled={disabled}
                aria-label={`Remove ${value}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addValue();
            }
          }}
          placeholder={atLimit ? `Limit reached (${maxCount})` : placeholder}
          disabled={disabled || atLimit}
          maxLength={maxLength}
          className="h-9 flex-1 text-sm placeholder:text-muted-foreground/40"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addValue}
          disabled={disabled || atLimit || !draft.trim()}
          className="h-9 px-3"
        >
          +
        </Button>
      </div>
      <p className="text-right text-[11px] text-muted-foreground">
        {values.length} / {maxCount}
      </p>
    </div>
  );
}

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
  const [articleType, setArticleType] = useState('');
  const [articleSize, setArticleSize] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [pointOfView, setPointOfView] = useState('');
  const [targetCountry, setTargetCountry] = useState('');
  const [hookBrief, setHookBrief] = useState('');
  const [includeConclusion, setIncludeConclusion] = useState<ToggleValue>('');
  const [includeTables, setIncludeTables] = useState<ToggleValue>('');
  const [includeH3, setIncludeH3] = useState<ToggleValue>('');
  const [includeLists, setIncludeLists] = useState<ToggleValue>('');
  const [includeItalics, setIncludeItalics] = useState<ToggleValue>('');
  const [includeQuotes, setIncludeQuotes] = useState<ToggleValue>('');
  const [includeKeyTakeaways, setIncludeKeyTakeaways] = useState<ToggleValue>('');
  const [includeFaq, setIncludeFaq] = useState<ToggleValue>('');
  const [includeBold, setIncludeBold] = useState<ToggleValue>('');
  const [seoKeywords, setSeoKeywords] = useState<string[]>([]);
  const [suggestingKeywords, setSuggestingKeywords] = useState(false);
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

  async function handleSuggestKeywords() {
    if (!keyword.trim() || seoKeywords.length >= SEO_KEYWORDS_MAX_COUNT) return;
    setSuggestingKeywords(true);
    try {
      const res = await fetch('/api/wordpress/suggest-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          keyword,
          language,
          targetCountry: targetCountry || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error?.message ?? 'Keyword suggestion failed');
        return;
      }
      const suggestions: string[] = json.data.keywords;
      setSeoKeywords((current) => {
        const existingLower = new Set(current.map((k) => k.toLowerCase()));
        const merged = [...current];
        for (const s of suggestions) {
          if (merged.length >= SEO_KEYWORDS_MAX_COUNT) break;
          if (existingLower.has(s.toLowerCase())) continue;
          merged.push(s);
          existingLower.add(s.toLowerCase());
        }
        return merged;
      });
    } catch {
      toast.error('Keyword suggestion failed');
    } finally {
      setSuggestingKeywords(false);
    }
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
        articleType: articleType || undefined,
        articleSize: articleSize || undefined,
        toneOfVoice: toneOfVoice || undefined,
        pointOfView: pointOfView || undefined,
        targetCountry: targetCountry || undefined,
        hookBrief: hookBrief.trim() || undefined,
        includeConclusion: includeConclusion ? includeConclusion === 'yes' : undefined,
        includeTables: includeTables ? includeTables === 'yes' : undefined,
        includeH3: includeH3 ? includeH3 === 'yes' : undefined,
        includeLists: includeLists ? includeLists === 'yes' : undefined,
        includeItalics: includeItalics ? includeItalics === 'yes' : undefined,
        includeQuotes: includeQuotes ? includeQuotes === 'yes' : undefined,
        includeKeyTakeaways: includeKeyTakeaways ? includeKeyTakeaways === 'yes' : undefined,
        includeFaq: includeFaq ? includeFaq === 'yes' : undefined,
        includeBold: includeBold ? includeBold === 'yes' : undefined,
        seoKeywords: seoKeywords.length > 0 ? seoKeywords : undefined,
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

        {sourceMode === 'keyword' && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
            <div>
              <p className="text-xs font-medium">Core Settings</p>
              <p className="text-[11px] text-muted-foreground">
                Optional — fine-tune the article&apos;s structure and voice. Leave any of these on &quot;None&quot; to keep
                the default behavior.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="article-type" className="text-xs font-medium text-muted-foreground">
                  Article Type
                </Label>
                <Select
                  value={articleType || NONE_VALUE}
                  onValueChange={(v) => v && setArticleType(v === NONE_VALUE ? '' : v)}
                >
                  <SelectTrigger id="article-type" className="w-full min-w-0" disabled={loading}>
                    <span className="min-w-0 truncate text-sm">
                      {articleType ? ARTICLE_TYPE_LABELS[articleType as (typeof ARTICLE_TYPES)[number]] : 'None'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {ARTICLE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {ARTICLE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="article-size" className="text-xs font-medium text-muted-foreground">
                  Article Size
                </Label>
                <Select
                  value={articleSize || NONE_VALUE}
                  onValueChange={(v) => v && setArticleSize(v === NONE_VALUE ? '' : v)}
                >
                  <SelectTrigger id="article-size" className="w-full min-w-0" disabled={loading}>
                    <span className="min-w-0 truncate text-sm">
                      {articleSize ? ARTICLE_SIZE_LABELS[articleSize as (typeof ARTICLE_SIZES)[number]] : 'None (default)'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None (default)</SelectItem>
                    {ARTICLE_SIZES.map((size) => (
                      <SelectItem key={size} value={size}>
                        {ARTICLE_SIZE_LABELS[size]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="tone-of-voice" className="text-xs font-medium text-muted-foreground">
                  Tone of Voice
                </Label>
                <Select
                  value={toneOfVoice || NONE_VALUE}
                  onValueChange={(v) => v && setToneOfVoice(v === NONE_VALUE ? '' : v)}
                >
                  <SelectTrigger id="tone-of-voice" className="w-full min-w-0" disabled={loading}>
                    <span className="min-w-0 truncate text-sm">
                      {toneOfVoice ? TONE_OF_VOICE_LABELS[toneOfVoice as (typeof TONES_OF_VOICE)[number]] : 'None'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {TONES_OF_VOICE.map((tone) => (
                      <SelectItem key={tone} value={tone}>
                        {TONE_OF_VOICE_LABELS[tone]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="point-of-view" className="text-xs font-medium text-muted-foreground">
                  Point of View
                </Label>
                <Select
                  value={pointOfView || NONE_VALUE}
                  onValueChange={(v) => v && setPointOfView(v === NONE_VALUE ? '' : v)}
                >
                  <SelectTrigger id="point-of-view" className="w-full min-w-0" disabled={loading}>
                    <span className="min-w-0 truncate text-sm">
                      {pointOfView ? POINT_OF_VIEW_LABELS[pointOfView as (typeof POINTS_OF_VIEW)[number]] : 'None'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {POINTS_OF_VIEW.map((pov) => (
                      <SelectItem key={pov} value={pov}>
                        {POINT_OF_VIEW_LABELS[pov]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5 sm:col-span-2">
                <Label htmlFor="target-country" className="text-xs font-medium text-muted-foreground">
                  Target Country
                </Label>
                <Select
                  value={targetCountry || NONE_VALUE}
                  onValueChange={(v) => v && setTargetCountry(v === NONE_VALUE ? '' : v)}
                >
                  <SelectTrigger id="target-country" className="w-full min-w-0" disabled={loading}>
                    <span className="min-w-0 truncate text-sm">{targetCountry || 'None'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {TARGET_COUNTRIES.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {sourceMode === 'keyword' && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
            <div>
              <p className="text-xs font-medium">Structure</p>
              <p className="text-[11px] text-muted-foreground">
                Optional — shape the introduction and force specific elements on or off. Leave everything on
                &quot;Non défini&quot; to keep the default behavior.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hook-brief" className="text-xs font-medium text-muted-foreground">
                Introductory Hook Brief
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {HOOK_BRIEF_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => setHookBrief(preset.text)}
                    className="h-7 px-2.5 text-[11px] font-normal"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Textarea
                id="hook-brief"
                placeholder="Describe how the article should open — pick a preset above to start, then edit freely"
                value={hookBrief}
                onChange={(e) => setHookBrief(e.target.value.slice(0, HOOK_BRIEF_MAX_LENGTH))}
                maxLength={HOOK_BRIEF_MAX_LENGTH}
                disabled={loading}
                className="min-h-20 text-sm placeholder:text-muted-foreground/40"
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {hookBrief.length} / {HOOK_BRIEF_MAX_LENGTH} characters
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StructureToggle id="include-conclusion" label="Conclusion" value={includeConclusion} onChange={setIncludeConclusion} disabled={loading} />
              <StructureToggle id="include-tables" label="Tables" value={includeTables} onChange={setIncludeTables} disabled={loading} />
              <StructureToggle id="include-h3" label="H3" value={includeH3} onChange={setIncludeH3} disabled={loading} />
              <StructureToggle id="include-lists" label="Lists" value={includeLists} onChange={setIncludeLists} disabled={loading} />
              <StructureToggle id="include-italics" label="Italics" value={includeItalics} onChange={setIncludeItalics} disabled={loading} />
              <StructureToggle id="include-quotes" label="Quotes" value={includeQuotes} onChange={setIncludeQuotes} disabled={loading} />
              <StructureToggle id="include-key-takeaways" label="Key Takeaways" value={includeKeyTakeaways} onChange={setIncludeKeyTakeaways} disabled={loading} />
              <StructureToggle id="include-faq" label="FAQ" value={includeFaq} onChange={setIncludeFaq} disabled={loading} />
              <StructureToggle id="include-bold" label="Bold" value={includeBold} onChange={setIncludeBold} disabled={loading} />
            </div>
          </div>
        )}

        {sourceMode === 'keyword' && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
            <div>
              <p className="text-xs font-medium">SEO Keywords</p>
              <p className="text-[11px] text-muted-foreground">
                Optional — keywords the article should naturally include. Leave empty to keep the default behavior.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="seo-keywords" className="text-xs font-medium text-muted-foreground">
                  Keywords to include in the text
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading || suggestingKeywords || !keyword.trim() || seoKeywords.length >= SEO_KEYWORDS_MAX_COUNT}
                  onClick={handleSuggestKeywords}
                  className="h-7 px-2.5 text-[11px] font-normal"
                >
                  {suggestingKeywords ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Générer avec l'IA"
                  )}
                </Button>
              </div>
              <TagInput
                id="seo-keywords"
                values={seoKeywords}
                onChange={setSeoKeywords}
                disabled={loading}
                maxCount={SEO_KEYWORDS_MAX_COUNT}
                maxLength={SEO_KEYWORD_MAX_LENGTH}
                placeholder="Type a keyword and press Enter"
              />
              <p className="text-[11px] text-muted-foreground">
                AI suggestions are a language-model brainstorm of related terms — not real search-volume or SERP data.
              </p>
            </div>
          </div>
        )}

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
