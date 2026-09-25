import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';
import { getStatusPresentation, statusToVariant, type WorkflowStatus } from '@/lib/utils/status';

interface StatusBadgeProps {
  /** A stored status value. Unknown values render a readable neutral badge. */
  status: WorkflowStatus | (string & {}) | null | undefined;
  /** Overrides the label only; the tone still comes from `status`. */
  label?: string;
  showDot?: boolean;
  className?: string;
}

// Canonical workflow-status badge. Label and tone come from `lib/utils/status.ts`,
// so the text always carries the meaning and color only reinforces it.
export function StatusBadge({ status, label, showDot = false, className }: StatusBadgeProps) {
  const presentation = getStatusPresentation(status);
  return (
    <Badge variant={presentation.tone} className={cn('gap-1.5', className)}>
      {showDot && <StatusDot variant={statusToVariant(status)} className="size-1.5" />}
      {label ?? presentation.label}
    </Badge>
  );
}
