'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ArticleFormSectionCard, SELECT_SURFACE_CLASS } from '@/components/wordpress/article-form-section-card';
import { ARTICLE_TYPES, ARTICLE_SIZES, TONES_OF_VOICE } from '@/lib/validations/wordpress';
import { ARTICLE_TYPE_LABELS, ARTICLE_SIZE_LABELS, TONE_OF_VOICE_LABELS } from '@/lib/wordpress/article-form-labels';

const NONE_VALUE = 'none';

interface ArticleSettingsSectionProps {
  articleType: string;
  onArticleTypeChange: (value: string) => void;
  articleSize: string;
  onArticleSizeChange: (value: string) => void;
  toneOfVoice: string;
  onToneOfVoiceChange: (value: string) => void;
  loading: boolean;
}

/**
 * The 3 most commonly used Core Settings fields (TASK-FIX-034), promoted
 * out of the collapsed "Advanced Options" block so they're visible without
 * expanding anything (TASK-FIX-040). Point of View and Target
 * Country — the other 2 Core Settings fields — moved into Advanced Options
 * instead; no field was removed or re-validated differently.
 */
export function ArticleSettingsSection({
  articleType,
  onArticleTypeChange,
  articleSize,
  onArticleSizeChange,
  toneOfVoice,
  onToneOfVoiceChange,
  loading,
}: ArticleSettingsSectionProps) {
  return (
    <ArticleFormSectionCard
      step="03"
      icon={SlidersHorizontal}
      title="Article Settings"
      description={`Optional — fine-tune the article's structure and voice. Leave any field on "None" to keep the default behavior.`}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="article-type" className="text-xs font-medium text-muted-foreground">
            Article Type
          </Label>
          <Select
            value={articleType || NONE_VALUE}
            onValueChange={(v) => v && onArticleTypeChange(v === NONE_VALUE ? '' : v)}
          >
            <SelectTrigger id="article-type" className={`w-full min-w-0 ${SELECT_SURFACE_CLASS}`} disabled={loading}>
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
            onValueChange={(v) => v && onArticleSizeChange(v === NONE_VALUE ? '' : v)}
          >
            <SelectTrigger id="article-size" className={`w-full min-w-0 ${SELECT_SURFACE_CLASS}`} disabled={loading}>
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
            onValueChange={(v) => v && onToneOfVoiceChange(v === NONE_VALUE ? '' : v)}
          >
            <SelectTrigger id="tone-of-voice" className={`w-full min-w-0 ${SELECT_SURFACE_CLASS}`} disabled={loading}>
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
      </div>
    </ArticleFormSectionCard>
  );
}
