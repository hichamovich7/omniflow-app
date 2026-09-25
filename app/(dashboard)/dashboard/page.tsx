import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { StatusDot } from '@/components/ui/status-dot';
import { Progress } from '@/components/ui/progress';
import { buttonVariants } from '@/components/ui/button';
import { PageState } from '@/components/shared/page-state';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { CommandCenterSection } from '@/components/dashboard/command-center-section';
import { MOCK_DAY_SUMMARY } from '@/lib/dashboard/command-center-mock';
import { buildCommandCenterKpis, resolveActiveProjects } from '@/lib/dashboard/build-command-center';
import { cn } from '@/lib/utils';
import { ArrowRight, ArrowUpRight, FolderOpen, FileText, Wand2, FilePlus2, Sparkles, TriangleAlert } from 'lucide-react';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import { timeAgo } from '@/lib/utils/format-date';
import { getStatusPresentation, statusToVariant } from '@/lib/utils/status';
import { getTrialGenerationLimit } from '@/lib/rate-limit';

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    generationsResult,
    pinsResult,
    profileResult,
    projectsListResult,
    articlesResult,
    recentPinterestResult,
    recentWordPressResult,
    bypassResult,
  ] = await Promise.all([
    supabase.from('generations').select('id', { count: 'exact', head: true }),
    supabase.from('pins').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('credits_balance, name, total_generations_used').single(),
    // Fetched as rows (not head-count) so Active Projects can link to a
    // matching real project by name — see lib/dashboard/build-command-center.ts
    supabase.from('projects').select('id, name'),
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
    // Same two signals checkRateLimit() itself uses (ADMIN_EMAIL + the
    // rate_limit_bypass table) — keeps this banner's "am I exempt" answer
    // consistent with what actually gets enforced server-side.
    supabase.rpc('is_rate_limit_bypassed'),
  ]);

  const totalGenerations = generationsResult.count ?? 0;
  const totalPins = pinsResult.count ?? 0;
  const realProjects = projectsListResult.data ?? [];
  const totalProjects = realProjects.length;
  const totalArticles = articlesResult.count ?? 0;
  const credits = profileResult.data?.credits_balance ?? 0;
  const userName = profileResult.data?.name;

  const commandCenterKpis = buildCommandCenterKpis({
    pinsCreated: totalPins,
    articlesGenerated: totalArticles,
    projects: totalProjects,
    generations: totalGenerations,
  });
  const activeProjects = resolveActiveProjects(realProjects);

  const isTrialExempt = user?.email === process.env.ADMIN_EMAIL || bypassResult.data === true;
  const trialLimit = getTrialGenerationLimit();
  const trialUsed = profileResult.data?.total_generations_used ?? 0;
  const trialLimitReached = trialUsed >= trialLimit;

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

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const quickActions = [
    { href: '/projects/new', icon: FolderOpen, label: 'New Project', description: 'Organize your content' },
    { href: '/pinterest', icon: Wand2, label: 'Generate Pinterest Pins', description: 'Create a new pin batch' },
    { href: '/wordpress/blog-post', icon: FilePlus2, label: 'Generate WordPress Article', description: 'Write a full SEO article' },
    { href: '/history', icon: Sparkles, label: 'Pinterest History', description: 'Browse past pin generations' },
    { href: '/wordpress/history', icon: FileText, label: 'WordPress History', description: 'Browse past articles' },
  ];

  return (
    <PageContainer>
      <DashboardHeader
        greeting={greeting}
        userName={userName}
        date={today}
        summary={MOCK_DAY_SUMMARY}
        credits={credits}
      />

      {/* Trial usage banner — lightweight lifetime cap distinct from the future
          Credits System (TASK-011/012, still PLANNED). Hidden for admin/bypassed
          accounts, since the cap never applies to them. See docs/DECISIONS.md. */}
      {!isTrialExempt && (
        <div
          className={cn(
            'rounded-xl border px-4 py-3',
            trialLimitReached
              ? 'border-destructive/20 bg-destructive/5'
              : 'border-border/60 bg-card'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {trialLimitReached && <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />}
              <p className={cn('text-sm font-medium', trialLimitReached && 'text-destructive')}>
                {trialLimitReached
                  ? 'Free trial limit reached'
                  : `${Math.min(trialUsed, trialLimit)} / ${trialLimit} free generations used`}
              </p>
            </div>
            {trialLimitReached && (
              <p className="text-sm text-muted-foreground">
                Contact {process.env.ADMIN_EMAIL ?? 'the site owner'} to continue.
              </p>
            )}
          </div>
          {!trialLimitReached && (
            <Progress className="mt-2" value={trialUsed} max={trialLimit} aria-label="Free generations used" />
          )}
        </div>
      )}

      {/* Command Center — KPIs, Today's Priorities, Active Projects, Weekly
          Progress (TASK-FIX-038). KPIs and Active Projects mix real Supabase
          data with mock goals; Today's Priorities and Weekly Progress stay
          fully mocked. See docs/tasks/TASK-COMMAND-CENTER-MVP.md. */}
      <div className="space-y-3">
        <div>
          <p className="text-label">Overview</p>
          <h2 className="text-section-title mt-1">Command Center</h2>
        </div>
        <CommandCenterSection kpis={commandCenterKpis} activeProjects={activeProjects} projects={realProjects} />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {quickActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group relative overflow-hidden rounded-xl border border-border/60 bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <action.icon className="h-4.5 w-4.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.description}</p>
              </div>
            </div>
            <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div><p className="text-label">Activity</p><h2 className="text-section-title mt-1">Recent activity</h2></div>
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
          <PageState variant="empty" title="No activity yet" description="Start a Pinterest generation or WordPress article to build your workspace history." icon={Sparkles} action={<Link href="/pinterest" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Generate content <ArrowRight className="h-3.5 w-3.5" /></Link>} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-surface divide-y divide-border/60">
            {recentActivity.map((item) => {
              const PlatformIcon = item.platform === 'pinterest' ? Sparkles : FileText;
              return (
                <Link
                  key={`${item.platform}-${item.id}`}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 first:rounded-t-xl last:rounded-b-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
                >
                  <StatusDot variant={statusToVariant(item.status)} />
                  <span className="sr-only">{getStatusPresentation(item.status).label}:</span>
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
