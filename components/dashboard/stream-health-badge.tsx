import { Badge } from '@/components/ui/badge';
import type { StreamHealth } from '@/types/dashboard';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'purple' | 'neutral' | 'outline';

export const STREAM_HEALTH_PRESENTATION: Record<StreamHealth, { label: string; variant: BadgeVariant }> = {
  'on-track': { label: 'On track', variant: 'success' },
  'needs-content': { label: 'Needs content', variant: 'warning' },
  'create-now': { label: 'Create now', variant: 'danger' },
  warming: { label: 'Warming', variant: 'purple' },
  paused: { label: 'Paused', variant: 'neutral' },
  planned: { label: 'Planned', variant: 'outline' },
  'needs-setup': { label: 'Needs setup', variant: 'outline' },
};

/** Text carries the meaning; color only reinforces it. */
export function StreamHealthBadge({ health }: { health: StreamHealth }) {
  const { label, variant } = STREAM_HEALTH_PRESENTATION[health];
  return <Badge variant={variant}>{label}</Badge>;
}
