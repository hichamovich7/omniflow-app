import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

export type WorkflowStatus =
  | 'queued'
  | 'generating'
  | 'processing'
  | 'ready'
  | 'reviewing'
  | 'published'
  | 'scheduled'
  | 'failed';

interface StatusBadgeProps {
  status: WorkflowStatus;
  label?: string;
  showDot?: boolean;
  className?: string;
}

type StatusPresentation = {
  label: string;
  badgeVariant: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
  dotVariant: 'success' | 'warning' | 'error' | 'neutral' | 'processing';
};

// Visual mapping only — labels and the rules that decide a status live elsewhere.
// In-progress and planned states are primary (blue = progress, docs/DESIGN.md);
// warning is reserved for states that need attention.
const statusPresentation: Record<WorkflowStatus, StatusPresentation> = {
  queued: { label: 'Queued', badgeVariant: 'neutral', dotVariant: 'neutral' },
  generating: { label: 'Generating', badgeVariant: 'primary', dotVariant: 'processing' },
  processing: { label: 'Processing', badgeVariant: 'primary', dotVariant: 'processing' },
  ready: { label: 'Ready', badgeVariant: 'success', dotVariant: 'success' },
  reviewing: { label: 'Reviewing', badgeVariant: 'neutral', dotVariant: 'neutral' },
  published: { label: 'Published', badgeVariant: 'success', dotVariant: 'success' },
  scheduled: { label: 'Scheduled', badgeVariant: 'primary', dotVariant: 'processing' },
  failed: { label: 'Failed', badgeVariant: 'danger', dotVariant: 'error' },
};

export function StatusBadge({ status, label, showDot = false, className }: StatusBadgeProps) {
  const presentation = statusPresentation[status];
  return (
    <Badge variant={presentation.badgeVariant} className={cn('gap-1.5', className)}>
      {showDot && <StatusDot variant={presentation.dotVariant} className="size-1.5" />}
      {label ?? presentation.label}
    </Badge>
  );
}
