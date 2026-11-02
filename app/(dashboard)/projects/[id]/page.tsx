import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWordPressSiteByProjectId } from '@/lib/queries/wordpress-sites';
import { listWordPressCategories } from '@/lib/queries/wordpress-categories';
import { listContentStreams, listBoardOccupants, findBoardOccupant } from '@/lib/queries/content-streams';
import { countAccountStructure, loadPinterestStructure } from '@/lib/queries/pinterest-accounts';
import {
  buildCategoryRows,
  buildTodos,
  freeBoardsForAccount,
  prefillStreamDraft,
} from '@/lib/projects/project-dashboard';
import type { DestinationDraft, EditingContentStream } from '@/components/projects/content-stream-form-dialog';
import { CollapsibleSection } from '@/components/projects/collapsible-section';
import { ProjectDialogsProvider } from '@/components/projects/project-dialogs';
import {
  PinterestSectionActions,
  ProjectPinterestSection,
  type WorkspaceAccount,
  type WorkspaceStream,
} from '@/components/projects/project-pinterest-section';
import { ProjectTodoPanel } from '@/components/projects/project-todo-panel';
import { NicheSettingsSection } from '@/components/projects/niche-settings-section';
import { parseNicheSettings } from '@/lib/niche/settings';
import { PageContainer } from '@/components/ui/page-container';
import { ResourceHeader } from '@/components/shared/resource-header';
import { Badge } from '@/components/ui/badge';
import { ExpandableText } from '@/components/ui/expandable-text';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { Pencil, Sparkles, FileText, Tag, Globe, Star, ExternalLink } from 'lucide-react';

/**
 * TASK-092: one-page project workspace. Header, health strip, in-page
 * navigation, then Brand Profile → WordPress → Niche settings → Pinterest
 * (the longest block, last), with "Needs attention" and Quick links on the
 * side. Read here, written only through the existing API routes.
 */
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

  const [wordpressSite, { count: generationCount }, { data: wpGenerations }, contentStreams, categories, structure] = await Promise.all([
    getWordPressSiteByProjectId(supabase, project.id),
    supabase.from('generations').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
    supabase.from('wordpress_generations').select('id').eq('project_id', project.id),
    listContentStreams(supabase, project.id),
    listWordPressCategories(supabase, project.id),
    // TASK-091: accounts, boards (+ sections) and stream destinations in one read.
    loadPinterestStructure(supabase, [project.id]),
  ]);

  const wpGenerationIds = (wpGenerations ?? []).map((g) => g.id);
  const { data: articleRows } =
    wpGenerationIds.length > 0
      ? await supabase.from('wordpress_articles').select('id, category_id, publish_status').in('generation_id', wpGenerationIds)
      : { data: [] };
  const articles = (articleRows ?? []) as { id: string; category_id: string | null; publish_status: string | null }[];
  const articlesByCategory: Record<string, number> = {};
  for (const article of articles) {
    if (article.category_id) articlesByCategory[article.category_id] = (articlesByCategory[article.category_id] ?? 0) + 1;
  }
  const publishedCount = articles.filter((a) => a.publish_status === 'published' || a.publish_status === 'scheduled').length;

  // "One board per active stream": a board used by another live stream is not offered.
  const boardOccupants = await listBoardOccupants(
    supabase,
    structure.boards.map((b) => b.id)
  );
  const boardOptions = structure.boards.map((b) => {
    const occupant = findBoardOccupant(boardOccupants, b.id);
    return {
      id: b.id,
      name: b.name,
      occupant: occupant ? { streamId: occupant.content_stream_id, streamName: occupant.content_stream_name } : null,
      pinterestAccountId: b.pinterest_account_id,
      isActive: b.is_active,
      sections: b.sections,
    };
  });

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const accountOptions = structure.accounts.map((a) => ({ id: a.id, name: a.name, status: a.status }));
  const liveAccounts = structure.accounts.filter((a) => a.status !== 'archived');
  const streamCategory: Record<string, string | null> = Object.fromEntries(
    contentStreams.map((s) => [s.id, s.wordpress_category_id])
  );
  const boardName = (boardId: string) => structure.boards.find((b) => b.id === boardId);

  const streams: WorkspaceStream[] = contentStreams.map((stream) => {
    const destinations: DestinationDraft[] = [...(structure.streams.find((s) => s.id === stream.id)?.destinations ?? [])]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((d) => ({ boardId: d.board_id, sectionId: d.section_id, isPrimary: d.is_primary, isActive: d.is_active, weight: d.weight }));
    const editing: EditingContentStream = {
      id: stream.id,
      name: stream.name,
      wordpressCategoryId: stream.wordpress_category_id,
      pinterestAccountId: stream.pinterest_account_id ?? null,
      destinations,
      status: stream.status,
      targetPinsPerDay: stream.target_pins_per_day,
      targetArticlesPerWeek: stream.target_articles_per_week,
      targetBufferDays: stream.target_buffer_days,
    };
    const accountId = stream.pinterest_account_id ?? null;
    const used = new Set(destinations.map((d) => d.boardId));
    return {
      id: stream.id,
      name: stream.name,
      status: stream.status,
      accountId,
      categoryName: categories.find((c) => c.id === stream.wordpress_category_id)?.name ?? null,
      targetPinsPerDay: stream.target_pins_per_day,
      editing,
      destinations,
      destinationLabels: destinations.map((d) => {
        const board = boardName(d.boardId);
        const section = board?.sections.find((s) => s.id === d.sectionId)?.name;
        return { label: [board?.name ?? 'Board', section].filter(Boolean).join(' / '), isPrimary: d.isPrimary, isActive: d.isActive, weight: d.weight };
      }),
      freeBoards: accountId
        ? freeBoardsForAccount(structure, accountId, stream.id)
            .filter((b) => !used.has(b.id))
            .map((b) => ({ id: b.id, name: b.name }))
        : [],
    };
  });

  const workspaceAccounts: WorkspaceAccount[] = liveAccounts.map((account) => {
    const counts = countAccountStructure(structure, account.id);
    return {
      id: account.id,
      name: account.name,
      status: account.status,
      meta: [account.username, account.account_type === 'business' ? 'Business' : 'Personal', account.main_keyword, [account.language, account.market].filter(Boolean).join(' / ')]
        .filter(Boolean)
        .join(' · '),
      counts: `${counts.contentStreams} streams · ${counts.boards} boards · ${counts.sections} sections`,
      draft: prefillStreamDraft(structure, categoryOptions, account.id),
    };
  });

  const todos = buildTodos(structure, categoryOptions, streamCategory);
  const legacyBoardsByStream: Record<string, string[]> = {};
  for (const stream of structure.streams) {
    legacyBoardsByStream[stream.id] = stream.destinations
      .map((d) => d.board_id)
      .filter((boardId, index, all) => all.indexOf(boardId) === index && !boardName(boardId)?.pinterest_account_id);
  }
  const categoryRows = buildCategoryRows(structure, categoryOptions, streamCategory, articlesByCategory);
  const nicheSettings = parseNicheSettings(project.niche_settings);
  const sectionCount = structure.boards.reduce((n, b) => n + b.sections.length, 0);
  const liveStreams = contentStreams.filter((s) => s.status !== 'archived');

  const langLabel = project.default_language
    ? (LANGUAGE_LABELS[project.default_language as SupportedLanguage] ?? project.default_language)
    : null;

  const health = [
    { href: '#brand', label: 'Brand Profile', value: project.description ? 'Set' : 'Not set', sub: 'Sent with every generation', warn: !project.description },
    {
      href: '#wordpress',
      label: 'WordPress',
      value: wordpressSite ? 'Connected' : 'Not connected',
      sub: `${categories.length} categories · ${articles.length} articles`,
      warn: !wordpressSite,
    },
    { href: '#niche', label: 'Niche settings', value: nicheSettings ? 'Customized' : 'Recommended', sub: project.niche ?? 'No niche set', warn: false },
    {
      href: '#pinterest',
      label: 'Pinterest',
      value: `${liveAccounts.length} account${liveAccounts.length === 1 ? '' : 's'}`,
      sub: `${liveStreams.length} streams · ${structure.boards.length} boards · ${sectionCount} sections`,
      warn: false,
    },
    { href: '#needs-attention', label: 'Needs attention', value: todos.length ? `${todos.length} item${todos.length === 1 ? '' : 's'}` : 'Nothing', sub: todos.length ? 'See the side column' : 'Everything is linked', warn: todos.length > 0 },
  ];

  const nav = [
    { href: '#brand', label: 'Brand Profile' },
    { href: '#wordpress', label: 'WordPress' },
    { href: '#niche', label: 'Niche settings' },
    { href: '#pinterest', label: 'Pinterest' },
    { href: '#quick-links', label: 'Quick links' },
  ];

  return (
    <PageContainer>
      <ResourceHeader
        title={project.name}
        backHref="/projects"
        backLabel="Back to projects"
        actions={
          <>
            <Link href={`/pinterest?projectId=${project.id}`} className={cn(buttonVariants({ size: 'sm' }))}>
              <Sparkles aria-hidden="true" />
              Generate Pins
            </Link>
            <Link href="/wordpress/blog-post" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              <FileText aria-hidden="true" />
              Generate article
            </Link>
            <Link href={`/projects/${project.id}/edit`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              <Pencil aria-hidden="true" />
              Edit Project
            </Link>
          </>
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

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5" data-testid="project-health">
        {health.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={cn(
              'flex min-h-11 flex-col gap-0.5 rounded-xl border p-3 transition-colors hover:border-border',
              item.warn ? 'border-warning/25 bg-warning-soft' : 'border-border/60 bg-card'
            )}
          >
            <span className={cn('text-xs', item.warn ? 'text-warning' : 'text-muted-foreground')}>{item.label}</span>
            <span className={cn('text-base font-semibold', item.warn && 'text-warning')}>{item.value}</span>
            <span className="truncate text-xs text-muted-foreground">{item.sub}</span>
          </a>
        ))}
      </div>

      <nav aria-label="Project sections" className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-card p-1.5">
        {nav.map((item) => (
          <a key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">
            {item.label}
          </a>
        ))}
      </nav>

      <ProjectDialogsProvider projectId={project.id} categories={categoryOptions} boards={boardOptions} accounts={accountOptions}>
        <div className="flex flex-wrap items-start gap-5">
          <div className="min-w-0 flex-[999_1_600px] space-y-5">
            <CollapsibleSection
              id="brand"
              title="Brand Profile"
              description="Tone, audience and style of the brand — sent with every generation"
              actions={
                <Link href={`/projects/${project.id}/edit`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  Edit
                </Link>
              }
            >
              {project.description ? (
                <ExpandableText text={project.description} className="text-sm leading-relaxed text-muted-foreground" />
              ) : (
                <p className="text-sm text-muted-foreground">No brand profile set yet.</p>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              id="wordpress"
              title="WordPress"
              description="Connected site, categories and the Content Streams they feed"
              actions={
                <Link href={`/wordpress/categories#project-${project.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  Manage categories
                </Link>
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div className={cn('rounded-xl border p-3', wordpressSite ? 'border-success/25 bg-success-soft' : 'border-border/60')}>
                    <p className="text-xs text-muted-foreground">Connection</p>
                    {wordpressSite ? (
                      <>
                        <a href={wordpressSite.site_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-sm font-medium text-primary hover:underline">
                          {wordpressSite.site_url.replace(/^https?:\/\//, '')}
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                        </a>
                        <p className="truncate text-xs text-muted-foreground">User: {wordpressSite.wp_username}</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-0.5 text-sm font-medium">Not connected</p>
                        <Link href={`/projects/${project.id}/edit`} className="text-xs font-medium text-primary hover:underline">
                          Connect WordPress
                        </Link>
                      </>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">OmniFlow articles</p>
                    <p className="mt-0.5 text-lg font-semibold">{articles.length}</p>
                    <p className="text-xs text-muted-foreground">{publishedCount} published or scheduled</p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Pinterest generations</p>
                    <p className="mt-0.5 text-lg font-semibold">{generationCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">All accounts of this project</p>
                  </div>
                </div>

                {categoryRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No WordPress category in this project yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table className="w-full min-w-[520px] text-sm" data-testid="wordpress-category-table">
                      <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-medium">Category</th>
                          <th scope="col" className="px-3 py-2 font-medium">Content Stream</th>
                          <th scope="col" className="px-3 py-2 font-medium">Pinterest account</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Articles</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryRows.map((row) => (
                          <tr key={row.id} className="border-t border-border/60">
                            <td className="px-3 py-2 font-medium">{row.name}</td>
                            <td className={cn('px-3 py-2', row.streams.length === 0 && 'text-warning')}>
                              {row.streams.length ? row.streams.map((s) => s.name).join(', ') : 'No stream'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{row.accounts.length ? row.accounts.join(', ') : '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.articles}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {/* select('*') simply has no niche_settings key before migration 041: defaults. */}
            <CollapsibleSection
              id="niche"
              title="Niche settings"
              description="Recommended for your niche — used by Pinterest and WordPress"
              defaultOpen={false}
              testId="niche-settings"
            >
              <NicheSettingsSection
                projectId={project.id}
                niche={project.niche ?? null}
                initialSettings={nicheSettings}
                streams={liveStreams.map((s) => ({ id: s.id, name: s.name }))}
                categories={categoryOptions}
                boards={boardOptions}
                embedded
              />
            </CollapsibleSection>

            <CollapsibleSection
              id="pinterest"
              title="Pinterest"
              description="Account → Content Stream → Board → Section"
              actions={<PinterestSectionActions />}
            >
              <ProjectPinterestSection
                projectId={project.id}
                accounts={workspaceAccounts}
                streams={streams}
                archivedAccounts={structure.accounts.length - liveAccounts.length}
              />
            </CollapsibleSection>
          </div>

          <aside className="min-w-0 flex-[1_1_280px] space-y-5">
            <section id="needs-attention" aria-labelledby="needs-attention-title" className="scroll-mt-20 space-y-2.5">
              <h2 id="needs-attention-title" className="text-base font-semibold">
                Needs attention
              </h2>
              <ProjectTodoPanel
                todos={todos}
                accounts={liveAccounts.map((a) => ({ id: a.id, name: a.name }))}
                categories={categoryOptions}
                legacyBoardsByStream={legacyBoardsByStream}
              />
            </section>

            <section id="quick-links" aria-labelledby="quick-links-title" className="scroll-mt-20 space-y-2.5 rounded-2xl border border-border/60 bg-card p-4">
              <h2 id="quick-links-title" className="text-base font-semibold">
                Quick links
              </h2>
              <div className="flex flex-col gap-1.5">
                {[
                  { href: `/history?project=${project.id}`, label: 'View Pinterest History' },
                  { href: `/wordpress/history?project=${project.id}`, label: 'View WordPress History' },
                  { href: `/pinterest-accounts?project=${project.id}`, label: 'Pinterest Accounts' },
                  { href: `/wordpress/categories#project-${project.id}`, label: 'Manage Categories' },
                  { href: '/boards', label: 'Boards & CSV export' },
                  { href: '/dashboard', label: 'Command Center' },
                ].map((link) => (
                  <Link key={link.href} href={link.href} className="rounded-lg bg-muted/50 px-3 py-2 text-sm hover:bg-muted">
                    {link.label} →
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </ProjectDialogsProvider>
    </PageContainer>
  );
}
