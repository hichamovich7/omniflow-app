import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWordPressSiteByProjectId } from '@/lib/queries/wordpress-sites';
import { listWordPressCategories } from '@/lib/queries/wordpress-categories';
import { listContentStreams, listBoardOccupants, findBoardOccupant } from '@/lib/queries/content-streams';
import { ContentStreamsSection } from '@/components/projects/content-streams-section';
import { MetricCard, MetricGrid } from '@/components/shared/metric-card';
import { PageContainer } from '@/components/ui/page-container';
import { ResourceHeader } from '@/components/shared/resource-header';
import { Badge } from '@/components/ui/badge';
import { ExpandableText } from '@/components/ui/expandable-text';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { Pencil, Sparkles, FileText, Tag, Globe, Star } from 'lucide-react';

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

  const [{ count: generationCount }, { data: wpGenerations }, contentStreams, categories, { data: projectBoards }] = await Promise.all([
    supabase.from('generations').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
    supabase.from('wordpress_generations').select('id').eq('project_id', project.id),
    listContentStreams(supabase, project.id),
    listWordPressCategories(supabase, project.id),
    supabase.from('boards').select('id, name').eq('project_id', project.id).order('name'),
  ]);

  // Every content_stream_boards row for any board in THIS project — reused
  // both to build the create/edit selector's "already in use" state and to
  // resolve which board each existing stream card currently shows (Phase
  // 2a.1). See docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md §11 §8.
  const boardIds = (projectBoards ?? []).map((b) => b.id);
  const boardOccupants = await listBoardOccupants(supabase, boardIds);

  const boardOptions = (projectBoards ?? []).map((b) => {
    const occupant = findBoardOccupant(boardOccupants, b.id);
    return {
      id: b.id,
      name: b.name,
      occupant: occupant ? { streamId: occupant.content_stream_id, streamName: occupant.content_stream_name } : null,
    };
  });

  const streamBoardMap: Record<string, string | undefined> = {};
  for (const row of boardOccupants) {
    streamBoardMap[row.content_stream_id] = row.board_id;
  }

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

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
      <ResourceHeader
        title={project.name}
        backHref="/projects"
        backLabel="Back to projects"
        actions={
          <Link
            href={`/projects/${project.id}/edit`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <Pencil aria-hidden="true" />
            Edit Project
          </Link>
        }
        metadata={
          (project.niche || langLabel || project.is_default) && (
            <>
              {project.niche && (
                <Badge variant="primary">
                  <Tag aria-hidden="true" />
                  {project.niche}
                </Badge>
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
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-hover">
                    <Star aria-hidden="true" className="h-3 w-3 fill-primary" />
                    Default
                  </span>
                </>
              )}
            </>
          )
        }
      />

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

      <ContentStreamsSection
        projectId={project.id}
        streams={contentStreams}
        categories={categoryOptions}
        boards={boardOptions}
        streamBoardMap={streamBoardMap}
      />

      <MetricGrid>
        <MetricCard label="Pinterest generations" value={generationCount ?? 0} icon={Sparkles} />
        <MetricCard label="WordPress articles" value={articleCount ?? 0} icon={FileText} />
      </MetricGrid>

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
