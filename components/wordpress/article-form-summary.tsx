'use client';

import { ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArticleFormSectionCard, FIELD_SURFACE_CLASS } from '@/components/wordpress/article-form-section-card';

interface GenerationSummaryProps {
  sourceSummary: string;
  sourceSet: boolean;
  projectName: string;
  languageLabel: string;
  categoryName: string;
  categorySet: boolean;
  articleSettingsSummary: string;
  articleSettingsSet: boolean;
  advancedCustomizedCount: number;
}

function SummaryItem({ label, value, isSet, wide }: { label: string; value: string; isSet: boolean; wide?: boolean }) {
  return (
    <div
      className={cn(
        'space-y-1 rounded-lg border border-border/70 px-3 py-2.5',
        FIELD_SURFACE_CLASS,
        wide && 'sm:col-span-2'
      )}
    >
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-sm', isSet ? 'font-medium text-foreground' : 'text-muted-foreground')}>{value}</dd>
    </div>
  );
}

/**
 * Read-only recap of the current selections, shown right above the submit
 * button (TASK-FIX-040). Purely presentational — every value, and every
 * isSet flag, is derived from state that already exists in ArticleForm;
 * nothing here is sent to the API or affects validation. A value that
 * hasn't been set yet (empty keyword, no category, default Article
 * Settings) is shown in a softer, neutral tone — never destructive/warning
 * colors — so it reads as "not filled in yet," not as an error.
 */
export function GenerationSummary({
  sourceSummary,
  sourceSet,
  projectName,
  languageLabel,
  categoryName,
  categorySet,
  articleSettingsSummary,
  articleSettingsSet,
  advancedCustomizedCount,
}: GenerationSummaryProps) {
  return (
    <ArticleFormSectionCard
      step="05"
      icon={ListChecks}
      title="Generation Summary"
      description="A quick recap of what's about to be generated — nothing here is sent until you submit."
      accented
    >
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryItem label="Source" value={sourceSummary} isSet={sourceSet} />
        <SummaryItem label="Project" value={projectName} isSet />
        <SummaryItem label="Language" value={languageLabel} isSet />
        <SummaryItem label="Category" value={categoryName} isSet={categorySet} />
        <SummaryItem label="Article Settings" value={articleSettingsSummary} isSet={articleSettingsSet} wide />
      </dl>
      {advancedCustomizedCount > 0 && (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {advancedCustomizedCount} advanced option{advancedCustomizedCount > 1 ? 's' : ''} customized.
        </p>
      )}
    </ArticleFormSectionCard>
  );
}
