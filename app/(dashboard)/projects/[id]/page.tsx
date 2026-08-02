import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWordPressSiteByProjectId } from '@/lib/queries/wordpress-sites';
import { PageContainer } from '@/components/ui/page-container';
import { Badge } from '@/components/ui/badge';
import { ExpandableText } from '@/components/ui/expandable-text';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { ArrowLeft, Pencil, Sparkles, FileText, Tag, Globe, Star } from 'lucide-react';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase.from('projects').select('*').eq('id', id).single();

  if (!project) {
    redirect('/projects');
  }

  const wordpressSite = await getWordPressSiteByProjectId(supabase, project.id);

  const [{ count: generationCount }, { data: wpGenerations }] = await Promise.all([
    supabase.from('generations').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
    supabase.from('wordpress_generations').select('id').eq('project_id', project.id),
  ]);

  const wpGenerationIds = (wpGenerations ?? []).map((g) => g.id);
  const { count: articleCount } =
    wpGenerationIds.length > 0
      ? await supabase
          .from('wordpress_articles')
          .select('id', { count: 'exact', head: true })
          .in('generation_id', wpGenerationIds)
      : { count: 0 };

  const langLabel = project.default_language
    ? (LANGUAGE_LABELS[project.default_language as SupportedLanguage] ?? project.default_language)
    : null;

  return (
    <PageContainer narrow>
      <div className="flex items-center gap-2">
        <Link
          href="/projects"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted"
          aria-label="Back to projects"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </Link>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h1 className="truncate text-xl font-semibold tracking-tight">{project.name}</h1>
          {(project.niche || langLabel || project.is_default) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {project.niche && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Tag className="h-3 w-3" />
                  {project.niche}
                </span>
              )}
              {langLabel && (
                <Badge variant="outline">
                  <Globe />
                  {langLabel}
                </Badge>
              )}
              {project.is_default && (
                <>
                  {/* Status, not a content attribute like Niche/Language — no pill
                      background, separated by a divider so it doesn't read as a
                      third attribute of the same kind. */}
                  {(project.niche || langLabel) && <span aria-hidden="true" className="h-3.5 w-px bg-border" />}
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <Star className="h-3 w-3 fill-primary" />
                    Default
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <Link
          href={`/projects/${project.id}/edit`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit Project
        </Link>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <h2 className="text-sm font-medium">Brand Profile</h2>
        {project.description ? (
          <ExpandableText
            text={project.description}
            className="mt-2 text-sm leading-relaxed text-muted-foreground"
          />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No brand profile set yet.</p>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <h2 className="text-sm font-medium">WordPress Connection</h2>
        {wordpressSite ? (
          <div className="mt-2">
            <Badge variant="success">Connected to {wordpressSite.site_url}</Badge>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Badge variant="secondary">Not connected</Badge>
            <Link href={`/projects/${project.id}/edit`} className="text-sm font-medium text-primary hover:underline">
              Connect WordPress
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{generationCount ?? 0}</p>
          <p className="text-xs text-muted-foreground">Pinterest generations</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{articleCount ?? 0}</p>
          <p className="text-xs text-muted-foreground">WordPress articles</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <h2 className="text-sm font-medium">Quick Links</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/history?project=${project.id}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            View Pinterest History
          </Link>
          <Link
            href={`/wordpress/history?project=${project.id}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            View WordPress History
          </Link>
          <Link
            href={`/wordpress/categories#project-${project.id}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Manage Categories
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
