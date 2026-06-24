import { cn } from '@/lib/utils';

type StatusVariant = 'success' | 'warning' | 'error' | 'neutral' | 'processing';

interface StatusDotProps {
  variant: StatusVariant;
  className?: string;
}

const variantStyles: Record<StatusVariant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  neutral: 'bg-muted-foreground',
  processing: 'bg-primary animate-pulse',
};

export function StatusDot({ variant, className }: StatusDotProps) {
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', variantStyles[variant], className)}
      aria-hidden="true"
    />
  );
}
