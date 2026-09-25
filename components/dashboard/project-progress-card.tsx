import Link from 'next/link';
import { Badge, type badgeVariants } from '@/components/ui/badge';
import { ProgressMetric } from '@/components/shared/metric-card';
import type { VariantProps } from 'class-variance-authority';
import type { ProjectProgress, ProjectStatus } from '@/types/dashboard';

interface ProjectProgressCardProps {
  project: ProjectProgress;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  'on-track': 'On Track',
  'at-risk': 'At Risk',
  paused: 'Paused',
};

const STATUS_BADGE_VARIANTS: Record<ProjectStatus, VariantProps<typeof badgeVariants>['variant']> = {
  'on-track': 'success',
  'at-risk': 'warning',
  paused: 'outline',
};

export function ProjectProgressCard({ project }: ProjectProgressCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-card-title">{project.name}</h3>
        <Badge variant={STATUS_BADGE_VARIANTS[project.status]}>{STATUS_LABELS[project.status]}</Badge>
      </div>

      <ProgressMetric
        className="mt-4"
        label="Progress"
        value={`${project.progressPercent}%`}
        progress={{ value: project.progressPercent, max: 100, label: `${project.name} progress` }}
      />

      <p className="mt-3 text-sm">
        <span className="text-muted-foreground">{project.mainKpiLabel}: </span>
        <span className="font-medium">{project.mainKpiValue}</span>
      </p>

      {/* Always rendered regardless of `href` — matching is only allowed to
          control whether the card links out, never whether Next action shows. */}
      <div className="mt-3 space-y-0.5">
        <p className="text-xs text-muted-foreground">Next action</p>
        <p className="text-sm font-medium text-foreground wrap-break-word">{project.nextAction}</p>
      </div>
    </>
  );

  if (project.href) {
    return (
      <Link
        href={project.href}
        className="block rounded-xl border border-border/60 bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {body}
      </Link>
    );
  }

  return <div className="rounded-xl border border-border/60 bg-surface p-5">{body}</div>;
}
