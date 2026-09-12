import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

export type WorkflowStatus = 'queued' | 'generating' | 'processing' | 'ready' | 'reviewing' | 'published' | 'scheduled' | 'failed';

interface StatusBadgeProps {
  status: WorkflowStatus;
  label?: string;
  showDot?: boolean;
  className?: string;
}

type StatusPresentation = {
  label: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline';
  dotVariant: 'success' | 'warning' | 'error' | 'neutral' | 'processing';
};

const statusPresentation: Record<WorkflowStatus, StatusPresentation> = {
  queued: { label: 'Queued', badgeVariant: 'secondary', dotVariant: 'neutral' },
  generating: { label: 'Generating', badgeVariant: 'warning', dotVariant: 'processing' },
  processing: { label: 'Processing', badgeVariant: 'warning', dotVariant: 'warning' },
  ready: { label: 'Ready', badgeVariant: 'success', dotVariant: 'success' },
  reviewing: { label: 'Reviewing', badgeVariant: 'outline', dotVariant: 'neutral' },
  published: { label: 'Published', badgeVariant: 'success', dotVariant: 'success' },
  scheduled: { label: 'Scheduled', badgeVariant: 'default', dotVariant: 'processing' },
  failed: { label: 'Failed', badgeVariant: 'destructive', dotVariant: 'error' },
};

export function StatusBadge({ status, label, showDot = false, className }: StatusBadgeProps) {
  const presentation = statusPresentation[status];
  return <Badge variant={presentation.badgeVariant} className={cn('gap-1.5', className)}>{showDot && <StatusDot variant={presentation.dotVariant} />}{label ?? presentation.label}</Badge>;
}
