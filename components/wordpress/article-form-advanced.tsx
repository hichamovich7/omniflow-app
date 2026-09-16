'use client';

import { useState } from 'react';
import { ChevronRight, Cog, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from '@/components/ui/collapsible';
import { SectionHeading } from '@/components/wordpress/article-form-section-card';
import {
  POINTS_OF_VIEW,
  TARGET_COUNTRIES,
  HOOK_BRIEF_MAX_LENGTH,
  SEO_KEYWORDS_MAX_COUNT,
  SEO_KEYWORD_MAX_LENGTH,
} from '@/lib/validations/wordpress';
import { POINT_OF_VIEW_LABELS } from '@/lib/wordpress/article-form-labels';

const NONE_VALUE = 'none';

// Each Structure toggle is 3-state: '' ("Non défini" — default, unchanged
// behavior), 'yes' ("Oui" — force presence), 'no' ("Non" — force absence).
export type ToggleValue = '' | 'yes' | 'no';

const TOGGLE_NONE_VALUE = 'unset';

// Hook Brief presets (TASK-FIX-035). Pre-fill the textarea and stay editable
// afterward — picking one never locks the field.
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

// SEO Keywords (TASK-FIX-036). No reusable tag/chip input existed in the
// codebase before that task — this minimal one is scoped to this block.
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
                <X aria-hidden="true" className="h-3 w-3" />
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

interface AdvancedOptionsSectionProps {
  pointOfView: string;
  onPointOfViewChange: (value: string) => void;
  targetCountry: string;
  onTargetCountryChange: (value: string) => void;
  hookBrief: string;
  onHookBriefChange: (value: string) => void;
  includeConclusion: ToggleValue;
  onIncludeConclusionChange: (value: ToggleValue) => void;
  includeTables: ToggleValue;
  onIncludeTablesChange: (value: ToggleValue) => void;
  includeH3: ToggleValue;
  onIncludeH3Change: (value: ToggleValue) => void;
  includeLists: ToggleValue;
  onIncludeListsChange: (value: ToggleValue) => void;
  includeItalics: ToggleValue;
  onIncludeItalicsChange: (value: ToggleValue) => void;
  includeQuotes: ToggleValue;
  onIncludeQuotesChange: (value: ToggleValue) => void;
  includeKeyTakeaways: ToggleValue;
  onIncludeKeyTakeawaysChange: (value: ToggleValue) => void;
  includeFaq: ToggleValue;
  onIncludeFaqChange: (value: ToggleValue) => void;
  includeBold: ToggleValue;
  onIncludeBoldChange: (value: ToggleValue) => void;
  seoKeywords: string[];
  onSeoKeywordsChange: (values: string[]) => void;
  suggestingKeywords: boolean;
  onSuggestKeywords: () => void;
  keyword: string;
  manualExternalUrls: string;
  onManualExternalUrlsChange: (value: string) => void;
  loading: boolean;
}

/**
 * Point of View, Target Country, Hook Brief, Structure, SEO Keywords, and
 * External Linking — every remaining optional block from before
 * TASK-FIX-040, now grouped under one collapsed-by-default
 * disclosure instead of being always visible. Closed by default on every
 * mount (local state, not persisted) — none of this changes what gets
 * validated or sent; only its default visibility changed.
 */
export function AdvancedOptionsSection({
  pointOfView,
  onPointOfViewChange,
  targetCountry,
  onTargetCountryChange,
  hookBrief,
  onHookBriefChange,
  includeConclusion,
  onIncludeConclusionChange,
  includeTables,
  onIncludeTablesChange,
  includeH3,
  onIncludeH3Change,
  includeLists,
  onIncludeListsChange,
  includeItalics,
  onIncludeItalicsChange,
  includeQuotes,
  onIncludeQuotesChange,
  includeKeyTakeaways,
  onIncludeKeyTakeawaysChange,
  includeFaq,
  onIncludeFaqChange,
  includeBold,
  onIncludeBoldChange,
  seoKeywords,
  onSeoKeywordsChange,
  suggestingKeywords,
  onSuggestKeywords,
  keyword,
  manualExternalUrls,
  onManualExternalUrlsChange,
  loading,
}: AdvancedOptionsSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <CollapsibleTrigger className="flex w-full items-start gap-2 bg-primary/5 px-5 py-4 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-0 sm:px-6">
        <SectionHeading
          step="04"
          icon={Cog}
          title="Advanced Options"
          description="Point of View, Target Country, Hook Brief, Structure, SEO Keywords, External Linking."
        />
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'mt-1.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
            open && 'rotate-90'
          )}
        />
      </CollapsibleTrigger>

      <CollapsiblePanel>
        <div className="space-y-5 border-t border-border bg-card px-5 py-5 sm:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="point-of-view" className="text-xs font-medium text-muted-foreground">
                Point of View
              </Label>
              <Select
                value={pointOfView || NONE_VALUE}
                onValueChange={(v) => v && onPointOfViewChange(v === NONE_VALUE ? '' : v)}
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

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="target-country" className="text-xs font-medium text-muted-foreground">
                Target Country
              </Label>
              <Select
                value={targetCountry || NONE_VALUE}
                onValueChange={(v) => v && onTargetCountryChange(v === NONE_VALUE ? '' : v)}
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

          <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
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
                    onClick={() => onHookBriefChange(preset.text)}
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
                onChange={(e) => onHookBriefChange(e.target.value.slice(0, HOOK_BRIEF_MAX_LENGTH))}
                maxLength={HOOK_BRIEF_MAX_LENGTH}
                disabled={loading}
                className="min-h-20 text-sm placeholder:text-muted-foreground/40"
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {hookBrief.length} / {HOOK_BRIEF_MAX_LENGTH} characters
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StructureToggle id="include-conclusion" label="Conclusion" value={includeConclusion} onChange={onIncludeConclusionChange} disabled={loading} />
              <StructureToggle id="include-tables" label="Tables" value={includeTables} onChange={onIncludeTablesChange} disabled={loading} />
              <StructureToggle id="include-h3" label="H3" value={includeH3} onChange={onIncludeH3Change} disabled={loading} />
              <StructureToggle id="include-lists" label="Lists" value={includeLists} onChange={onIncludeListsChange} disabled={loading} />
              <StructureToggle id="include-italics" label="Italics" value={includeItalics} onChange={onIncludeItalicsChange} disabled={loading} />
              <StructureToggle id="include-quotes" label="Quotes" value={includeQuotes} onChange={onIncludeQuotesChange} disabled={loading} />
              <StructureToggle id="include-key-takeaways" label="Key Takeaways" value={includeKeyTakeaways} onChange={onIncludeKeyTakeawaysChange} disabled={loading} />
              <StructureToggle id="include-faq" label="FAQ" value={includeFaq} onChange={onIncludeFaqChange} disabled={loading} />
              <StructureToggle id="include-bold" label="Bold" value={includeBold} onChange={onIncludeBoldChange} disabled={loading} />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
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
                  onClick={onSuggestKeywords}
                  className="h-7 px-2.5 text-[11px] font-normal"
                >
                  {suggestingKeywords ? (
                    <>
                      <Loader2 aria-hidden="true" className="mr-1.5 h-3 w-3 animate-spin" />
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
                onChange={onSeoKeywordsChange}
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

          <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
            <div>
              <p className="text-xs font-medium">External Linking</p>
              <p className="text-[11px] text-muted-foreground">
                Optional — specific sources to link to, in addition to the article&apos;s usual automatic external
                link. Leave empty to keep the default behavior.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-external-urls" className="text-xs font-medium text-muted-foreground">
                Manual URLs
              </Label>
              <Input
                id="manual-external-urls"
                placeholder="https://example.com/a, https://example.com/b"
                value={manualExternalUrls}
                onChange={(e) => onManualExternalUrlsChange(e.target.value)}
                disabled={loading}
                className="h-11 text-sm placeholder:text-muted-foreground/40"
              />
              <p className="text-[11px] text-muted-foreground">Comma-separated. Up to 10 URLs.</p>
            </div>
          </div>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
