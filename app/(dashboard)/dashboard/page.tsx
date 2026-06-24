import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { PageContainer } from '@/components/ui/page-container';
import { StatusDot } from '@/components/ui/status-dot';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { FileText, Image, Coins, ArrowRight } from 'lucide-react';
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

  const [generationsResult, pinsResult, profileResult, recentResult] = await Promise.all([
    supabase.from('generations').select('id', { count: 'exact', head: true }),
    supabase.from('pins').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('credits_balance').single(),
    supabase
      .from('generations')
      .select('id, keyword, language, pins_requested, status, created_at, projects(name)')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const totalGenerations = generationsResult.count ?? 0;
  const totalPins = pinsResult.count ?? 0;
  const credits = profileResult.data?.credits_balance ?? 0;
  const recentGenerations = recentResult.data ?? [];

  return (
    <PageContainer>
      <PageHeader title="Dashboard" description="Overview of your content workspace">
        <Link href="/pinterest" className={buttonVariants({ size: 'sm' })}>
          New Generation
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="Total Generations"
          value={totalGenerations}
          icon={FileText}
        />
        <MetricCard
          title="Total Pins"
          value={totalPins}
          icon={Image}
        />
        <MetricCard
          title="Available Credits"
          value={credits}
          icon={Coins}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent Activity</h2>
          {recentGenerations.length > 0 && (
            <Link
              href="/history"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
            </Link>
          )}
        </div>

        {recentGenerations.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No activity yet. Start by creating a generation.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border divide-y">
            {recentGenerations.map((gen) => {
              const projects = gen.projects as { name: string }[] | { name: string } | null;
              const projectName = Array.isArray(projects) ? projects[0]?.name : projects?.name;
              return (
                <Link
                  key={gen.id}
                  href={`/pinterest/${gen.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <StatusDot variant={statusToVariant(gen.status)} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{gen.keyword}</p>
                    <p className="text-xs text-muted-foreground">
                      {projectName ?? 'Unknown project'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-xs">
                      {LANGUAGE_LABELS[gen.language as SupportedLanguage] ?? gen.language}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(gen.created_at)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
