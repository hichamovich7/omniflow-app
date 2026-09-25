'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';
import { generateArticleSchema, generateArticleFromUrlSchema, SEO_KEYWORDS_MAX_COUNT } from '@/lib/validations/wordpress';
import type { ARTICLE_TYPES, ARTICLE_SIZES, TONES_OF_VOICE } from '@/lib/validations/wordpress';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { Button } from '@/components/ui/button';
import { GeneratorHeader } from '@/components/shared/generator-header';
import { Alert } from '@/components/ui/alert';
import { type CategoryOption } from '@/components/wordpress/category-select';
import { ProjectContextSection, type ProjectOption } from '@/components/wordpress/article-form-project-context';
import { ArticleSourceSection, type SourceMode, type UrlSourceType } from '@/components/wordpress/article-form-source';
import { ArticleSettingsSection } from '@/components/wordpress/article-form-settings';
import { AdvancedOptionsSection, type ToggleValue } from '@/components/wordpress/article-form-advanced';
import { GenerationSummary } from '@/components/wordpress/article-form-summary';
import {
  findSiteForProject,
  findContentStreamsForCategory,
  type ProjectSiteInfo,
  type ProjectContentStreamInfo,
} from '@/lib/wordpress/project-context';
import { ARTICLE_TYPE_LABELS, ARTICLE_SIZE_LABELS, TONE_OF_VOICE_LABELS } from '@/lib/wordpress/article-form-labels';

interface ArticleFormProps {
  projects: ProjectOption[];
  categories: CategoryOption[];
  sites: ProjectSiteInfo[];
  contentStreams: ProjectContentStreamInfo[];
}

export function ArticleForm({ projects, categories: initialCategories, sites, contentStreams }: ArticleFormProps) {
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
  const [manualExternalUrls, setManualExternalUrls] = useState('');
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
        manualExternalUrls: manualExternalUrls.trim() || undefined,
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

  // Read-only, purely presentational context — never sent to the API, never
  // affects validation. See lib/wordpress/project-context.ts.
  const selectedSite = findSiteForProject(sites, projectId);
  const matchingStreams = findContentStreamsForCategory(contentStreams, projectId, categoryId);

  const sourceSummary =
    sourceMode === 'keyword'
      ? keyword.trim()
        ? `Keyword: "${keyword.trim()}"`
        : 'Keyword: (not set yet)'
      : urlSourceType === 'link'
        ? sourceUrl.trim()
          ? `External Source: ${sourceUrl.trim()}`
          : 'External Source: (no URL yet)'
        : pastedContent.trim()
          ? `External Source: pasted text (${pastedContent.length} characters)`
          : 'External Source: (no text yet)';

  const articleSettingsSummary =
    sourceMode === 'keyword'
      ? [
          articleType ? ARTICLE_TYPE_LABELS[articleType as (typeof ARTICLE_TYPES)[number]] : null,
          articleSize ? ARTICLE_SIZE_LABELS[articleSize as (typeof ARTICLE_SIZES)[number]] : null,
          toneOfVoice ? TONE_OF_VOICE_LABELS[toneOfVoice as (typeof TONES_OF_VOICE)[number]] : null,
        ]
          .filter((v): v is string => !!v)
          .join(' · ') || 'Default'
      : 'Not applicable for External Source';

  const advancedCustomizedCount =
    [
      pointOfView,
      targetCountry,
      hookBrief.trim(),
      includeConclusion,
      includeTables,
      includeH3,
      includeLists,
      includeItalics,
      includeQuotes,
      includeKeyTakeaways,
      includeFaq,
      includeBold,
    ].filter(Boolean).length +
    (seoKeywords.length > 0 ? 1 : 0) +
    (manualExternalUrls.trim() ? 1 : 0);

  const sourceSet =
    sourceMode === 'keyword'
      ? !!keyword.trim()
      : urlSourceType === 'link'
        ? !!sourceUrl.trim()
        : !!pastedContent.trim();
  const categorySet = !!categoryId;
  const articleSettingsSet = sourceMode === 'keyword' && !!(articleType || articleSize || toneOfVoice);

  return (
    <div className="pt-6 sm:pt-10">
      {/* Hero */}
      <GeneratorHeader
        icon={FileText}
        title="WordPress Generator"
        description="Enter a keyword, or use an external source as research context, and let AI plan and write a full SEO article with a featured image and internal images."
        className="mb-6"
      />

      {/* Form — each section below is its own card (TASK-FIX-040 visual
          finish); this element only wraps the submit behavior, no styling. */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Workspace panel: a recessed, tinted surface (bg-muted, already a
            very slightly violet-hued neutral in this app's token set — see
            app/globals.css) that groups the five steps together and reads
            as a distinct layer between the page background and the white
            cards, without becoming another big white block itself. */}
        <div className="space-y-5 rounded-2xl bg-muted/60 p-4 sm:p-6">
          <ProjectContextSection
            projects={projects}
            projectId={projectId}
            onProjectChange={handleProjectChange}
            language={language}
            onLanguageChange={setLanguage}
            categories={categoryOptions}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
            onCategoriesChange={(next) => {
              setCategories((all) => [...all.filter((c) => c.project_id !== projectId), ...next]);
            }}
            site={selectedSite}
            matchingStreams={matchingStreams}
          />

          <ArticleSourceSection
            sourceMode={sourceMode}
            onSourceModeChange={handleSourceModeChange}
            keyword={keyword}
            onKeywordChange={setKeyword}
            researchNotes={researchNotes}
            onResearchNotesChange={setResearchNotes}
            urlSourceType={urlSourceType}
            onUrlSourceTypeChange={setUrlSourceType}
            sourceUrl={sourceUrl}
            onSourceUrlChange={setSourceUrl}
            pastedContent={pastedContent}
            onPastedContentChange={setPastedContent}
            confirmedOriginal={confirmedOriginal}
            onConfirmedOriginalChange={setConfirmedOriginal}
            loading={loading}
          />

          {sourceMode === 'keyword' && (
            <ArticleSettingsSection
              articleType={articleType}
              onArticleTypeChange={setArticleType}
              articleSize={articleSize}
              onArticleSizeChange={setArticleSize}
              toneOfVoice={toneOfVoice}
              onToneOfVoiceChange={setToneOfVoice}
              loading={loading}
            />
          )}

          {sourceMode === 'keyword' && (
            <AdvancedOptionsSection
              pointOfView={pointOfView}
              onPointOfViewChange={setPointOfView}
              targetCountry={targetCountry}
              onTargetCountryChange={setTargetCountry}
              hookBrief={hookBrief}
              onHookBriefChange={setHookBrief}
              includeConclusion={includeConclusion}
              onIncludeConclusionChange={setIncludeConclusion}
              includeTables={includeTables}
              onIncludeTablesChange={setIncludeTables}
              includeH3={includeH3}
              onIncludeH3Change={setIncludeH3}
              includeLists={includeLists}
              onIncludeListsChange={setIncludeLists}
              includeItalics={includeItalics}
              onIncludeItalicsChange={setIncludeItalics}
              includeQuotes={includeQuotes}
              onIncludeQuotesChange={setIncludeQuotes}
              includeKeyTakeaways={includeKeyTakeaways}
              onIncludeKeyTakeawaysChange={setIncludeKeyTakeaways}
              includeFaq={includeFaq}
              onIncludeFaqChange={setIncludeFaq}
              includeBold={includeBold}
              onIncludeBoldChange={setIncludeBold}
              seoKeywords={seoKeywords}
              onSeoKeywordsChange={setSeoKeywords}
              suggestingKeywords={suggestingKeywords}
              onSuggestKeywords={handleSuggestKeywords}
              keyword={keyword}
              manualExternalUrls={manualExternalUrls}
              onManualExternalUrlsChange={setManualExternalUrls}
              loading={loading}
            />
          )}

          <GenerationSummary
            sourceSummary={sourceSummary}
            sourceSet={sourceSet}
            projectName={projects.find((p) => p.id === projectId)?.name ?? '—'}
            languageLabel={LANGUAGE_LABELS[language]}
            categoryName={categoryOptions.find((c) => c.id === categoryId)?.name ?? 'Uncategorized'}
            categorySet={categorySet}
            articleSettingsSummary={articleSettingsSummary}
            articleSettingsSet={articleSettingsSet}
            advancedCustomizedCount={advancedCustomizedCount}
          />
        </div>

        {error && (
          <Alert>{error}</Alert>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
          <p className="text-xs text-muted-foreground">Generation can take up to a minute.</p>
          <Button type="submit" size="lg" loading={loading} disabled={submitDisabled} className="w-full sm:w-auto">
            <FileText aria-hidden="true" data-icon="inline-start" />
            Generate Article
          </Button>
        </div>
      </form>
    </div>
  );
}
