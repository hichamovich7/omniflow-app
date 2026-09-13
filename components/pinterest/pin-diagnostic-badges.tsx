import { Badge } from '@/components/ui/badge';
import {
  CREATIVE_WARNING_LABELS,
  getPinCreativeDiagnostics,
} from '@/lib/pinterest/creative-diagnostics';
import type { PinQualityStatus } from '@/lib/pinterest/quality-gate';
import type { PinterestAngle } from '@/types/pinterest';
import type { Pin } from '@/types/database';

const ANGLE_LABELS: Record<PinterestAngle, string> = {
  curiosity: 'Curiosity',
  'problem-solution': 'Problem → Solution',
  listicle: 'Listicle',
  discovery: 'Discovery',
  'article-promise': 'Article Promise',
};

const QUALITY_VARIANTS: Record<PinQualityStatus, 'success' | 'warning' | 'destructive'> = {
  PASS: 'success',
  WARN: 'warning',
  RECOMPOSE: 'warning',
  FAIL: 'destructive',
};

export function formatCreativeLabel(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function PinDiagnosticBadges({
  pin,
  showWarnings = true,
}: {
  pin: Pick<Pin, 'image_analysis' | 'title_banner_template'>;
  showWarnings?: boolean;
}) {
  const diagnostics = getPinCreativeDiagnostics(pin);
  const warningLabels = diagnostics.warnings.slice(0, 2).map((warning) =>
    CREATIVE_WARNING_LABELS[warning]
  );

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="pin-creative-diagnostics">
      <Badge variant="outline" className="bg-background/70 text-[10px] text-muted-foreground">
        {diagnostics.angle ? ANGLE_LABELS[diagnostics.angle] : 'Angle unavailable'}
      </Badge>
      <Badge variant="outline" className="bg-background/70 text-[10px] text-muted-foreground">
        {diagnostics.template ? formatCreativeLabel(diagnostics.template) : 'Template unavailable'}
      </Badge>
      <Badge variant="outline" className="bg-background/70 text-[10px] text-muted-foreground">
        {diagnostics.position ? formatCreativeLabel(diagnostics.position) : 'Position unavailable'}
      </Badge>
      <Badge
        variant={diagnostics.status ? QUALITY_VARIANTS[diagnostics.status] : 'outline'}
        className="text-[10px]"
      >
        {diagnostics.status ?? 'Not evaluated'}
      </Badge>
      {showWarnings && warningLabels.map((warning) => (
        <Badge key={warning} variant="outline" className="text-[10px] text-muted-foreground">
          {warning}
        </Badge>
      ))}
      {showWarnings && diagnostics.warnings.length > warningLabels.length && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          +{diagnostics.warnings.length - warningLabels.length}
        </Badge>
      )}
    </div>
  );
}
