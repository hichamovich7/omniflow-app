import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { StatusDot } from '@/components/ui/status-dot';
import { GenerateContentMenu } from '@/components/dashboard/generate-content-menu';
import { ArrowRight, FolderOpen, FileText, Sparkles } from 'lucide-react';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { timeAgo } from '@/lib/utils/format-date';
import { statusToVariant } from '@/lib/utils/status';

interface ActivityItem {
  id: string;
  platform: 'pinterest' | 'wordpress';
  title: string;
  projectName: string | undefined;
  language: string;
  meta: string;
  status: string;
  created_at: string;
  href: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    generationsResult,
    pinsResult,
    profileResult,
    projectsResult,
    articlesResult,
    recentPinterestResult,
    recentWordPressResult,
  ] = await Promise.all([
    supabase.from('generations').select('id', { count: 'exact', head: true }),
    supabase.from('pins').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('credits_balance, name').single(),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('wordpress_articles').select('id', { count: 'exact', head: true }),
    supabase
      .from('generations')
      .select('id, keyword, language, pins_requested, status, created_at, projects(name)')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('wordpress_generations')
      .select('id, keyword, language, status, created_at, projects(name), wordpress_articles(title)')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const totalGenerations = generationsResult.count ?? 0;
  const totalPins = pinsResult.count ?? 0;
  const totalProjects = projectsResult.count ?? 0;
  const totalArticles = articlesResult.count ?? 0;
  const credits = profileResult.data?.credits_balance ?? 0;
  const userName = profileResult.data?.name;

  const pinterestActivity: ActivityItem[] = (recentPinterestResult.data ?? []).map((gen) => {
    const projects = gen.projects as { name: string }[] | { name: string } | null;
    const projectName = Array.isArray(projects) ? projects[0]?.name : projects?.name;
    return {
      id: gen.id,
      platform: 'pinterest',
      title: gen.keyword,
      projectName,
      language: gen.language,
      meta: `${gen.pins_requested} pins`,
      status: gen.status,
      created_at: gen.created_at,
      href: `/pinterest/${gen.id}`,
    };
  });

  const wordpressActivity: ActivityItem[] = (recentWordPressResult.data ?? []).map((gen) => {
    const projects = gen.projects as { name: string }[] | { name: string } | null;
    const projectName = Array.isArray(projects) ? projects[0]?.name : projects?.name;
    const articles = gen.wordpress_articles as { title: string }[] | { title: string } | null;
    const article = Array.isArray(articles) ? articles[0] : articles;
    return {
      id: gen.id,
      platform: 'wordpress',
      title: article?.title ?? gen.keyword,
      projectName,
      language: gen.language,
      meta: 'Article',
      status: gen.status,
      created_at: gen.created_at,
      href: `/wordpress/${gen.id}`,
    };
  });

  const recentActivity = [...pinterestActivity, ...wordpressActivity]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <PageContainer>
      {/* Greeting + Primary CTA */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight">
            {greeting}{userName ? `, ${userName}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your AI content workspace is ready.
          </p>
        </div>
        <GenerateContentMenu />
      </div>

      {/* Quick Actions — secondary shortcuts (Generate Content above is the one primary action) */}
      <div className="grid gap-6 sm:grid-cols-3">
        <Link
          href="/projects/new"
          className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-border hover:bg-muted/30"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <FolderOpen className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">New Project</p>
              <p className="text-xs text-muted-foreground">Organize your content</p>
            </div>
          </div>
          <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/history"
          className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-border hover:bg-muted/30"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Sparkles className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Pinterest History</p>
              <p className="text-xs text-muted-foreground">Browse past pin generations</p>
            </div>
          </div>
          <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/wordpress/history"
          className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-border hover:bg-muted/30"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <FileText className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">WordPress History</p>
              <p className="text-xs text-muted-foreground">Browse past articles</p>
            </div>
          </div>
          <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Metrics — secondary, compact */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Generations', value: totalGenerations },
          { label: 'Pins Created', value: totalPins },
          { label: 'Articles Generated', value: totalArticles },
          { label: 'Projects', value: totalProjects, href: '/projects' },
          { label: 'Credits', value: credits },
        ].map((stat) => {
          const content = (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                {stat.label}
              </p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight">{stat.value}</p>
            </>
          );

          if (stat.href) {
            return (
              <Link
                key={stat.label}
                href={stat.href}
                className="rounded-xl border border-border/60 bg-card px-4 py-3 transition-colors hover:border-border hover:bg-muted/30"
              >
                {content}
              </Link>
            );
          }

          return (
            <div key={stat.label} className="rounded-xl border border-border/60 bg-card px-4 py-3">
              {content}
            </div>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent Activity</h2>
          {recentActivity.length > 0 && (
            <Link
              href="/history"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
            </Link>
          )}
        </div>

        {recentActivity.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 py-14 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
              <Sparkles className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No activity yet</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Start by creating your first generation.
            </p>
            <Link
              href="/pinterest"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Generate content <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/60">
            {recentActivity.map((item) => {
              const PlatformIcon = item.platform === 'pinterest' ? Sparkles : FileText;
              return (
                <Link
                  key={`${item.platform}-${item.id}`}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 first:rounded-t-xl last:rounded-b-xl"
                >
                  <StatusDot variant={statusToVariant(item.status)} />
                  <PlatformIcon
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                    aria-label={item.platform === 'pinterest' ? 'Pinterest' : 'WordPress'}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.projectName ?? 'No project'} · {LANGUAGE_LABELS[item.language as SupportedLanguage] ?? item.language} · {item.meta}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(item.created_at)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
