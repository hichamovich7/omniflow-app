import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { StatusDot } from '@/components/ui/status-dot';
import { ArrowRight, Sparkles, FolderOpen, Clock, Zap } from 'lucide-react';
import { LANGUAGE_LABELS } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';

function statusToVariant(status: string) {
  switch (status) {
    case 'completed': return 'success' as const;
    case 'processing': return 'processing' as const;
    case 'failed': return 'error' as const;
    default: return 'neutral' as const;
  }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [generationsResult, pinsResult, profileResult, projectsResult, recentResult] = await Promise.all([
    supabase.from('generations').select('id', { count: 'exact', head: true }),
    supabase.from('pins').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('credits_balance, name').single(),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase
      .from('generations')
      .select('id, keyword, language, pins_requested, status, created_at, projects(name)')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const totalGenerations = generationsResult.count ?? 0;
  const totalPins = pinsResult.count ?? 0;
  const totalProjects = projectsResult.count ?? 0;
  const credits = profileResult.data?.credits_balance ?? 0;
  const userName = profileResult.data?.name;
  const recentGenerations = recentResult.data ?? [];

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
          <p className="text-[13px] text-muted-foreground">
            Your AI content workspace is ready.
          </p>
        </div>
        <Link
          href="/pinterest"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" />
          Generate Content
        </Link>
      </div>

      {/* Quick Actions — hero prominence */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/pinterest"
          className="group relative overflow-hidden rounded-xl border border-primary/20 bg-primary/3 p-5 transition-colors hover:bg-primary/6"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Zap className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Pinterest Generator</p>
              <p className="text-xs text-muted-foreground">Create optimized pins with AI</p>
            </div>
          </div>
          <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/30 transition-transform group-hover:translate-x-0.5" />
        </Link>
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
              <Clock className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">View History</p>
              <p className="text-xs text-muted-foreground">Browse past generations</p>
            </div>
          </div>
          <ArrowRight className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Metrics — secondary, compact */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Generations', value: totalGenerations },
          { label: 'Pins Created', value: totalPins },
          { label: 'Projects', value: totalProjects },
          { label: 'Credits', value: credits },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/60 bg-card px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {stat.label}
            </p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-medium">Recent Activity</h2>
          {recentGenerations.length > 0 && (
            <Link
              href="/history"
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
            </Link>
          )}
        </div>

        {recentGenerations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 py-14 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
              <Sparkles className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No activity yet</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Start by creating your first generation.
            </p>
            <Link
              href="/pinterest"
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
            >
              Generate content <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/60">
            {recentGenerations.map((gen) => {
              const projects = gen.projects as { name: string }[] | { name: string } | null;
              const projectName = Array.isArray(projects) ? projects[0]?.name : projects?.name;
              return (
                <Link
                  key={gen.id}
                  href={`/pinterest/${gen.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 first:rounded-t-xl last:rounded-b-xl"
                >
                  <StatusDot variant={statusToVariant(gen.status)} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{gen.keyword}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {projectName ?? 'No project'} · {LANGUAGE_LABELS[gen.language as SupportedLanguage] ?? gen.language} · {gen.pins_requested} pins
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {timeAgo(gen.created_at)}
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
