'use client';

import Link from 'next/link';
import { Folder } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CategorySelect, type CategoryOption } from '@/components/wordpress/category-select';
import { ArticleFormSectionCard, SELECT_SURFACE_CLASS } from '@/components/wordpress/article-form-section-card';
import { contentStreamStatusToBadgeVariant } from '@/lib/utils/status';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import type { ProjectContentStreamInfo, ProjectSiteInfo } from '@/lib/wordpress/project-context';

export interface ProjectOption {
  id: string;
  name: string;
  is_default: boolean;
  default_language: string | null;
}

interface ProjectContextSectionProps {
  projects: ProjectOption[];
  projectId: string;
  onProjectChange: (projectId: string) => void;
  language: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;
  categories: CategoryOption[];
  categoryId: string;
  onCategoryChange: (categoryId: string) => void;
  onCategoriesChange: (categories: CategoryOption[]) => void;
  site: ProjectSiteInfo | null;
  matchingStreams: ProjectContentStreamInfo[];
}

/**
 * Project / WordPress connection / Language / Category, grouped as the
 * form's first block (TASK-FIX-040 — reorg only, no field removed or
 * re-validated differently than before). The WordPress site status and
 * the matching Content Stream(s) are read-only, server-fetched props — no
 * client fetch, no new relation, no effect on the generation payload.
 * Rendered as an "accented" card (visual finish) to signal it's the
 * currently active project context, not because anything about its data
 * changed.
 */
export function ProjectContextSection({
  projects,
  projectId,
  onProjectChange,
  language,
  onLanguageChange,
  categories,
  categoryId,
  onCategoryChange,
  onCategoriesChange,
  site,
  matchingStreams,
}: ProjectContextSectionProps) {
  return (
    <ArticleFormSectionCard
      step="01"
      icon={Folder}
      title="Project Context"
      description="Where this article will live — project, WordPress connection, language, and category."
      accented
    >
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="project" className="text-xs font-medium text-muted-foreground">
          Project
        </Label>
        <Select value={projectId} onValueChange={(v) => v && onProjectChange(v)}>
          <SelectTrigger id="project" className={`w-full min-w-0 ${SELECT_SURFACE_CLASS}`}>
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/70 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">WordPress</span>
          {site ? <Badge variant="success">Connected</Badge> : <Badge variant="secondary">Not connected</Badge>}
        </div>
        {site ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={site.site_url}>
            {site.site_url}
          </span>
        ) : (
          <Link
            href={`/projects/${projectId}/edit`}
            className="rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Connect WordPress
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="language" className="text-xs font-medium text-muted-foreground">
            Language
          </Label>
          <Select value={language} onValueChange={(v) => v && onLanguageChange(v as SupportedLanguage)}>
            <SelectTrigger id="language" className={`w-full min-w-0 ${SELECT_SURFACE_CLASS}`}>
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
            categories={categories}
            value={categoryId}
            onChange={onCategoryChange}
            onCategoriesChange={onCategoriesChange}
            triggerClassName={SELECT_SURFACE_CLASS}
          />
        </div>
      </div>

      {matchingStreams.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Content stream{matchingStreams.length > 1 ? 's' : ''} for this category:</span>
          {matchingStreams.map((stream) => (
            <Badge key={stream.id} variant={contentStreamStatusToBadgeVariant(stream.status)}>
              {stream.name}
            </Badge>
          ))}
        </div>
      )}
    </ArticleFormSectionCard>
  );
}
