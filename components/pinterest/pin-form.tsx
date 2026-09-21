'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Info, Loader2, Sparkles, Sparkle } from 'lucide-react';
import { generatePinsSchema, TEXT_OVERLAY_MODES } from '@/lib/validations/pinterest';
import type { TextOverlayMode } from '@/lib/validations/pinterest';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, PINS_OPTIONS } from '@/types/pinterest';
import type {
  SupportedLanguage,
  PinsOption,
  PinterestAngle,
  PinterestCreativeFormat,
  PinterestGenerationMode,
  PinterestStrategy,
  PinterestTextImportance,
} from '@/types/pinterest';
import { getNicheVisualConvention } from '@/lib/ai/niche-visual-conventions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ReferenceImageUpload } from '@/components/pinterest/reference-image-upload';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

interface ProjectOption {
  id: string;
  name: string;
  is_default: boolean;
  default_language: string | null;
  niche: string | null;
}

const TEXT_OVERLAY_LABELS: Record<TextOverlayMode, string> = {
  auto: 'Auto',
  always: 'Always',
  never: 'Never',
};

const TEXT_OVERLAY_DESCRIPTIONS: Record<TextOverlayMode, string> = {
  auto: "AI decides per pin whether to add a headline overlay. The Save CTA is always added.",
  always: 'Every pin gets a headline overlay. The Save CTA is also always added.',
  never: 'Headline overlays are disabled. The Save CTA is still added to every image.',
};

type RequiredTextMode = 'generate' | 'exact';
type OptionalTextMode = RequiredTextMode | 'none';

const MODE_OPTIONS: Array<{
  value: PinterestGenerationMode;
  label: string;
  description: string;
  badge?: string;
}> = [
  {
    value: 'ai-integrated',
    label: 'AI Integrated',
    description: 'AI creates the final photo, typography, and CTA together.',
    badge: 'Recommended',
  },
  {
    value: 'photo-only',
    label: 'Photo Only',
    description: 'A clean photographic image with no text or graphic overlay.',
  },
  {
    value: 'legacy-composite',
    label: 'Legacy Composite',
    description: 'Keeps the existing SVG/Sharp headline and CTA workflow.',
    badge: 'Legacy',
  },
];

function IntegratedTextControl({
  label,
  mode,
  onModeChange,
  text,
  onTextChange,
  allowNone,
  disabled,
}: {
  label: string;
  mode: OptionalTextMode;
  onModeChange: (mode: OptionalTextMode) => void;
  text: string;
  onTextChange: (text: string) => void;
  allowNone?: boolean;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <Select value={mode} onValueChange={(value) => value && onModeChange(value as OptionalTextMode)}>
          <SelectTrigger className="h-9 w-40" aria-label={`${label} mode`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="generate">Generate with AI</SelectItem>
            <SelectItem value="exact">Use exact text</SelectItem>
            {allowNone && <SelectItem value="none">None</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      {mode === 'exact' && (
        <Textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={`Exact ${label.toLowerCase()} text`}
          maxLength={120}
          required
          disabled={disabled}
          className="min-h-20 resize-y"
        />
      )}
    </div>
  );
}

function FormSection({
  id,
  title,
  help,
  helpId,
  className,
  children,
}: {
  id: string;
  title: string;
  help?: string;
  helpId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn('space-y-3 rounded-xl border border-border/60 p-4', className)}
    >
      <div>
        <h2 id={id} className="text-sm font-semibold">{title}</h2>
        {help && (
          <p id={helpId} className="mt-0.5 text-xs text-muted-foreground">{help}</p>
        )}
      </div>
      {children}
    </section>
  );
}

interface BoardOption {
  id: string;
  name: string;
  project_id: string;
}

interface PinFormProps {
  projects: ProjectOption[];
  boards: BoardOption[];
}

export function PinForm({ projects, boards }: PinFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultProject = projects.find((p) => p.is_default) ?? projects[0];

  // Carried over from a Research result (Continue to Generate) — invisible passthrough,
  // not editable fields, just recorded on the generation for provenance.
  const websiteUrl = searchParams.get('websiteUrl') ?? undefined;
  const pinterestUrl = searchParams.get('pinterestUrl') ?? undefined;

  // Carried over from a Research result's Analyze step — unlike websiteUrl/pinterestUrl this
  // actually changes AI output, so it's surfaced to the user (see indicator below).
  const analysisId = searchParams.get('analysisId') ?? undefined;

  const [projectId, setProjectId] = useState(
    searchParams.get('projectId') ?? defaultProject?.id ?? ''
  );
  const [keyword, setKeyword] = useState(searchParams.get('keyword') ?? '');
  const [board, setBoard] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>(
    (defaultProject?.default_language as SupportedLanguage) ?? 'en'
  );
  const [pinsRequested, setPinsRequested] = useState<PinsOption>(10);
  const [generationMode, setGenerationMode] = useState<PinterestGenerationMode>('ai-integrated');
  const [textOverlayMode, setTextOverlayMode] = useState<TextOverlayMode>('auto');
  const [creativeFormat, setCreativeFormat] = useState<PinterestCreativeFormat>('ai-chooses');
  const [strategy, setStrategy] = useState<PinterestStrategy>('ai-recommends');
  const [manualAngle, setManualAngle] = useState<PinterestAngle>('curiosity');
  const [headlineMode, setHeadlineMode] = useState<RequiredTextMode>('generate');
  const [headlineText, setHeadlineText] = useState('');
  const [subtitleMode, setSubtitleMode] = useState<OptionalTextMode>('generate');
  const [subtitleText, setSubtitleText] = useState('');
  const [ctaMode, setCtaMode] = useState<OptionalTextMode>('generate');
  const [ctaText, setCtaText] = useState('');
  const [maximumTextLines, setMaximumTextLines] = useState(4);
  const [headlineImportance, setHeadlineImportance] = useState<PinterestTextImportance>('high');
  const [subtitleImportance, setSubtitleImportance] = useState<PinterestTextImportance>('medium');
  const [ctaImportance, setCtaImportance] = useState<PinterestTextImportance>('low');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedProject = projects.find((p) => p.id === projectId);
  const effectiveProjectLanguage = (
    selectedProject?.default_language && SUPPORTED_LANGUAGES.includes(
      selectedProject.default_language as SupportedLanguage
    )
      ? selectedProject.default_language
      : language
  ) as SupportedLanguage;
  const nicheConvention = getNicheVisualConvention(selectedProject?.niche);
  const showTextOverlayMode = nicheConvention?.allowTextOverlay ?? false;
  const showLegacyTextOverlayMode = generationMode === 'legacy-composite' && showTextOverlayMode;

  function handleProjectChange(nextProjectId: string) {
    setProjectId(nextProjectId);
    const next = projects.find((p) => p.id === nextProjectId);
    if (next?.default_language) {
      setLanguage(next.default_language as SupportedLanguage);
    }
    if (!getNicheVisualConvention(next?.niche)?.allowTextOverlay) {
      setTextOverlayMode('auto');
    }
  }

  const boardOptions = boards.filter((b) => b.project_id === projectId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const basePayload = {
      projectId,
      keyword,
      language: generationMode === 'ai-integrated' ? effectiveProjectLanguage : language,
      pinsRequested,
      board: board.trim() || undefined,
      websiteUrl,
      pinterestUrl,
      analysisId,
    };
    const parsed = generatePinsSchema.safeParse(
      generationMode === 'ai-integrated'
        ? {
            ...basePayload,
            generationMode,
            aiIntegrated: {
              creativeFormat,
              strategy,
              ...(strategy === 'manual' ? { manualAngle } : {}),
              headline: headlineMode === 'exact'
                ? { mode: 'exact', text: headlineText }
                : { mode: 'generate' },
              subtitle: subtitleMode === 'exact'
                ? { mode: 'exact', text: subtitleText }
                : { mode: subtitleMode },
              cta: ctaMode === 'exact'
                ? { mode: 'exact', text: ctaText }
                : { mode: ctaMode },
              maximumTextLines,
              importance: {
                headline: headlineImportance,
                subtitle: subtitleImportance,
                cta: ctaImportance,
              },
            },
          }
        : generationMode === 'photo-only'
          ? { ...basePayload, generationMode }
          : {
              ...basePayload,
              generationMode,
              // The legacy style-analysis reference is Legacy Composite only.
              // Stale state from another mode is never sent.
              referenceImageUrl: referenceImageUrl ?? undefined,
              textOverlayMode: showTextOverlayMode ? textOverlayMode : 'auto',
            }
    );
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
    <div className="pt-4 sm:pt-6">
      {/* Hero */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Pinterest Generator</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Enter a keyword and let AI create optimized pins with titles, descriptions, and image prompts.
        </p>
      </div>

      {analysisId && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-brand-accent/5 px-3 py-2 text-xs font-medium text-brand-accent">
          <Sparkle className="h-3.5 w-3.5 shrink-0" />
          Using content analysis from Research
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-8"
      >
        {/* 1. Project context */}
        <FormSection
          id="project-context-heading"
          title="Project context"
          help="Choose the project this content belongs to. The language is inherited from the project."
          helpId="project-context-help"
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="project" className="text-xs font-medium text-muted-foreground">
                Project
              </Label>
              <Select value={projectId} onValueChange={(v) => v && handleProjectChange(v)}>
                <SelectTrigger id="project" className="w-full" aria-describedby="project-context-help">
                  <span className="truncate text-sm">
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

            <div className="space-y-1.5">
              <Label htmlFor="language" className="text-xs font-medium text-muted-foreground">
                {generationMode === 'ai-integrated' ? 'Effective language' : 'Language'}
              </Label>
              {generationMode === 'ai-integrated' ? (
                <Input
                  id="language"
                  readOnly
                  value={LANGUAGE_LABELS[effectiveProjectLanguage]}
                  title="Inherited from the selected project"
                  className="w-full cursor-default bg-muted/40 sm:w-32"
                />
              ) : (
                <Select value={language} onValueChange={(v) => v && setLanguage(v as SupportedLanguage)}>
                  <SelectTrigger id="language" className="w-full sm:w-32">
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
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pins" className="text-xs font-medium text-muted-foreground">
                Pins
              </Label>
              <Select
                value={String(pinsRequested)}
                onValueChange={(v) => v && setPinsRequested(Number(v) as PinsOption)}
              >
                <SelectTrigger id="pins" className="w-full sm:w-28">
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
        </FormSection>

        {/* 2. Board */}
        <FormSection
          id="board-heading"
          title="Board"
          help="Choose the Pinterest board for these Pins, or leave it blank to decide later."
          helpId="board-help"
        >
          <div className="space-y-1.5">
            <Label htmlFor="board" className="text-xs font-medium text-muted-foreground">
              Board (optional)
            </Label>
            <Combobox
              items={boardOptions.map((b) => b.name)}
              inputValue={board}
              onInputValueChange={(value) => setBoard(value)}
            >
              <ComboboxInputGroup className="h-12">
                <ComboboxInput
                  id="board"
                  placeholder="e.g. Boho Bathroom Ideas — leave blank to let AI decide"
                  maxLength={100}
                  disabled={loading}
                  aria-describedby="board-help"
                  className="text-sm placeholder:text-muted-foreground/40"
                />
                <ComboboxIcon />
              </ComboboxInputGroup>
              <ComboboxPopup>
                <ComboboxEmpty>
                  {board.trim() ? `Create "${board.trim()}"` : 'No boards yet — type to create one'}
                </ComboboxEmpty>
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
        </FormSection>

        {/* 3. Keyword */}
        <FormSection
          id="keyword-heading"
          title="Keyword"
          help="Use the main search phrase your Pins should target."
          helpId="keyword-help"
        >
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
              aria-describedby="keyword-help"
              className="h-12 text-sm placeholder:text-muted-foreground/40"
            />
          </div>
        </FormSection>

        {/* 4. Generation mode */}
        <FormSection id="generation-mode-heading" title="Generation mode">
          <div role="group" aria-labelledby="generation-mode-heading" className="grid gap-2 md:grid-cols-3">
            {MODE_OPTIONS.map((option) => {
              const selected = generationMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  disabled={loading}
                  onClick={() => setGenerationMode(option.value)}
                  className={cn(
                    'min-h-24 min-w-0 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                      : 'border-border/60 hover:border-border hover:bg-muted/30'
                  )}
                >
                  <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-sm font-medium">
                    <span className="flex min-w-0 items-center gap-1.5 break-words">
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
                      {option.label}
                    </span>
                    {option.badge && (
                      <span className={cn(
                        'ml-auto shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        option.value === 'ai-integrated'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {option.badge}
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>

          {generationMode === 'legacy-composite' && (
            <div className="space-y-4 border-t border-border/60 pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Reference Image (optional)</Label>
                <ReferenceImageUpload value={referenceImageUrl} onChange={setReferenceImageUrl} disabled={loading} />
                <p className="text-xs text-muted-foreground">
                  Analyzed for style only (color palette, materials, mood, lighting) — never copied as a composition.
                </p>
              </div>

              {showLegacyTextOverlayMode && (
                <div className="space-y-1.5">
                  <Label htmlFor="text-overlay-mode" className="text-xs font-medium text-muted-foreground">
                    Text in Images
                  </Label>
                  <Select
                    value={textOverlayMode}
                    onValueChange={(v) => v && setTextOverlayMode(v as TextOverlayMode)}
                  >
                    <SelectTrigger id="text-overlay-mode" className="w-full sm:w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEXT_OVERLAY_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {TEXT_OVERLAY_LABELS[mode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">{TEXT_OVERLAY_LABELS[textOverlayMode]}:</span>{' '}
                    {TEXT_OVERLAY_DESCRIPTIONS[textOverlayMode]}
                  </p>
                </div>
              )}
            </div>
          )}
        </FormSection>

        {/* 5. AI Integrated settings */}
        {generationMode === 'ai-integrated' && (
          <FormSection
            id="ai-integrated-settings"
            title="AI Integrated settings"
            help="Choose how the final Pinterest visual and its text should be created."
            className="space-y-4 border-primary/20 bg-primary/[0.025]"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="creative-format" className="text-xs text-muted-foreground">Creative format</Label>
                <Select value={creativeFormat} onValueChange={(value) => value && setCreativeFormat(value as PinterestCreativeFormat)}>
                  <SelectTrigger id="creative-format"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hero-pin">Hero Pin</SelectItem>
                    <SelectItem value="pattern-guide">Pattern Guide</SelectItem>
                    <SelectItem value="editorial-story">Editorial Story</SelectItem>
                    <SelectItem value="ai-chooses">AI chooses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pinterest-strategy" className="text-xs text-muted-foreground">Pinterest strategy</Label>
                <Select value={strategy} onValueChange={(value) => value && setStrategy(value as PinterestStrategy)}>
                  <SelectTrigger id="pinterest-strategy"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai-recommends">AI recommends</SelectItem>
                    <SelectItem value="balanced">Balanced angles</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {strategy === 'manual' && (
              <div className="space-y-1.5">
                <Label htmlFor="manual-angle" className="text-xs text-muted-foreground">Angle</Label>
                <Select value={manualAngle} onValueChange={(value) => value && setManualAngle(value as PinterestAngle)}>
                  <SelectTrigger id="manual-angle"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="curiosity">Curiosity</SelectItem>
                    <SelectItem value="problem-solution">Problem → Solution</SelectItem>
                    <SelectItem value="listicle">Listicle</SelectItem>
                    <SelectItem value="discovery">Discovery</SelectItem>
                    <SelectItem value="article-promise">Article Promise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-3">
              <IntegratedTextControl
                label="Headline"
                mode={headlineMode}
                onModeChange={(mode) => setHeadlineMode(mode as RequiredTextMode)}
                text={headlineText}
                onTextChange={setHeadlineText}
                disabled={loading}
              />
              <IntegratedTextControl
                label="Subtitle"
                mode={subtitleMode}
                onModeChange={setSubtitleMode}
                text={subtitleText}
                onTextChange={setSubtitleText}
                allowNone
                disabled={loading}
              />
              <IntegratedTextControl
                label="CTA"
                mode={ctaMode}
                onModeChange={setCtaMode}
                text={ctaText}
                onTextChange={setCtaText}
                allowNone
                disabled={loading}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="maximum-text-lines" className="text-xs text-muted-foreground">Maximum text lines</Label>
                <Select value={String(maximumTextLines)} onValueChange={(value) => value && setMaximumTextLines(Number(value))}>
                  <SelectTrigger id="maximum-text-lines"><SelectValue /></SelectTrigger>
                  <SelectContent>{[2, 3, 4, 5, 6].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {([
                ['Headline', headlineImportance, setHeadlineImportance],
                ['Subtitle', subtitleImportance, setSubtitleImportance],
                ['CTA', ctaImportance, setCtaImportance],
              ] as const).map(([label, value, setter]) => (
                <div key={label} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{label} importance</Label>
                  <Select value={value} onValueChange={(next) => next && setter(next as PinterestTextImportance)}>
                    <SelectTrigger aria-label={`${label} importance`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <p
              role="note"
              data-testid="ai-integrated-reference-notice"
              className="flex items-start gap-2 border-t border-primary/10 pt-3 text-xs text-muted-foreground"
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Reference images for AI Integrated are coming soon. A reference is not yet sent to the image model.</span>
            </p>
          </FormSection>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/5 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={loading || projects.length === 0}
            className="h-11 px-6 text-sm font-medium"
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
        </div>
      </form>
    </div>
  );
}
