'use client';

import { FileSearch } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArticleFormSectionCard,
  FIELD_SURFACE_CLASS,
  SELECT_SURFACE_CLASS,
} from '@/components/wordpress/article-form-section-card';
import { MAX_PASTED_CONTENT_LENGTH } from '@/lib/validations/wordpress';

export type SourceMode = 'keyword' | 'url';
export type UrlSourceType = 'link' | 'pasted';

const CONFIRMATION_LABEL =
  "I confirm I'm using this content as research inspiration for an original article, not to reproduce it";

interface ArticleSourceSectionProps {
  sourceMode: SourceMode;
  onSourceModeChange: (mode: SourceMode) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  researchNotes: string;
  onResearchNotesChange: (value: string) => void;
  urlSourceType: UrlSourceType;
  onUrlSourceTypeChange: (type: UrlSourceType) => void;
  sourceUrl: string;
  onSourceUrlChange: (value: string) => void;
  pastedContent: string;
  onPastedContentChange: (value: string) => void;
  confirmedOriginal: boolean;
  onConfirmedOriginalChange: (value: boolean) => void;
  loading: boolean;
}

/**
 * Source mode toggle (Keyword / External Source) and each mode's fields —
 * unchanged behavior and validation from before TASK-FIX-040, just
 * moved out of article-form.tsx into its own presentational block.
 */
export function ArticleSourceSection({
  sourceMode,
  onSourceModeChange,
  keyword,
  onKeywordChange,
  researchNotes,
  onResearchNotesChange,
  urlSourceType,
  onUrlSourceTypeChange,
  sourceUrl,
  onSourceUrlChange,
  pastedContent,
  onPastedContentChange,
  confirmedOriginal,
  onConfirmedOriginalChange,
  loading,
}: ArticleSourceSectionProps) {
  return (
    <ArticleFormSectionCard
      step="02"
      icon={FileSearch}
      title="Article Source"
      description="What the article is about — a keyword, or an external source used as research context."
    >
      <div className="space-y-1.5">
        <Label htmlFor="source-mode" className="text-xs font-medium text-muted-foreground">
          Source
        </Label>
        <Select value={sourceMode} onValueChange={(v) => v && onSourceModeChange(v as SourceMode)}>
          <SelectTrigger id="source-mode" className={`w-full min-w-0 ${SELECT_SURFACE_CLASS}`}>
            <SelectValue>{sourceMode === 'keyword' ? 'Keyword' : 'External Source'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="keyword">Keyword</SelectItem>
            <SelectItem value="url">External Source</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4 border-t border-border pt-4">
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
                onChange={(e) => onKeywordChange(e.target.value)}
                maxLength={200}
                required
                disabled={loading}
                className={`h-12 text-sm placeholder:text-muted-foreground/40 ${FIELD_SURFACE_CLASS}`}
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
                onChange={(e) => onResearchNotesChange(e.target.value)}
                maxLength={2000}
                disabled={loading}
                className={`min-h-20 text-sm placeholder:text-muted-foreground/40 ${FIELD_SURFACE_CLASS}`}
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="url-source-type" className="text-xs font-medium text-muted-foreground">
                Input Type
              </Label>
              <Select value={urlSourceType} onValueChange={(v) => v && onUrlSourceTypeChange(v as UrlSourceType)}>
                <SelectTrigger id="url-source-type" className={`w-full min-w-0 ${SELECT_SURFACE_CLASS}`}>
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
                  onChange={(e) => onSourceUrlChange(e.target.value)}
                  maxLength={2000}
                  required
                  disabled={loading}
                  className={`h-12 text-sm placeholder:text-muted-foreground/40 ${FIELD_SURFACE_CLASS}`}
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
                  onChange={(e) => onPastedContentChange(e.target.value.slice(0, MAX_PASTED_CONTENT_LENGTH))}
                  maxLength={MAX_PASTED_CONTENT_LENGTH}
                  required
                  disabled={loading}
                  className={`min-h-40 text-sm placeholder:text-muted-foreground/40 ${FIELD_SURFACE_CLASS}`}
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {pastedContent.length} / {MAX_PASTED_CONTENT_LENGTH} characters
                </p>
              </div>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              Used only as research context — the topics, angles, and key points it covers. The generated article is
              entirely new: its own outline, its own wording, never a rewrite or close paraphrase of the source.
            </p>

            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={confirmedOriginal}
                onCheckedChange={(checked) => onConfirmedOriginalChange(checked === true)}
                disabled={loading}
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed text-muted-foreground">{CONFIRMATION_LABEL}</span>
            </label>
          </>
        )}
      </div>
    </ArticleFormSectionCard>
  );
}
