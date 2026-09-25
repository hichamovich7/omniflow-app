import { Badge } from '@/components/ui/badge';
import {
  CREATIVE_WARNING_LABELS,
  getPinCreativeDiagnostics,
} from '@/lib/pinterest/creative-diagnostics';
import type { PinQualityStatus } from '@/lib/pinterest/quality-gate';
import type { PinterestAngle } from '@/types/pinterest';
import type { Pin } from '@/types/database';

const GENERATION_MODE_LABELS: Record<Pin['visual_format'], string> = {
  'ai-integrated': 'AI Integrated',
  'photo-only': 'Photo Only',
  photo: 'Legacy Composite',
  'text-overlay': 'Legacy Composite',
};

export function getPinGenerationModeLabel(visualFormat: Pin['visual_format']): string {
  return GENERATION_MODE_LABELS[visualFormat];
}

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
  pin: Pick<Pin, 'visual_format' | 'image_analysis' | 'title_banner_template'>;
  showWarnings?: boolean;
}) {
  const diagnostics = getPinCreativeDiagnostics(pin);
  const isLegacy = pin.visual_format === 'photo' || pin.visual_format === 'text-overlay';
  const warningLabels = diagnostics.warnings.slice(0, 2).map((warning) =>
    CREATIVE_WARNING_LABELS[warning]
  );

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="pin-creative-diagnostics">
      <Badge variant="outline" className="bg-background/70">
        {getPinGenerationModeLabel(pin.visual_format)}
      </Badge>
      <Badge variant="outline" className="bg-background/70">
        {diagnostics.angle ? ANGLE_LABELS[diagnostics.angle] : 'Angle unavailable'}
      </Badge>
      {isLegacy && <>
        <Badge variant="outline" className="bg-background/70">
          {diagnostics.template ? formatCreativeLabel(diagnostics.template) : 'Template unavailable'}
        </Badge>
        <Badge variant="outline" className="bg-background/70">
          {diagnostics.position ? formatCreativeLabel(diagnostics.position) : 'Position unavailable'}
        </Badge>
        <Badge
          variant={diagnostics.status ? QUALITY_VARIANTS[diagnostics.status] : 'outline'}
        >
          {diagnostics.status ?? 'Not evaluated'}
        </Badge>
      </>}
      {!isLegacy && (
        <Badge variant="outline">
          Visual review needed
        </Badge>
      )}
      {isLegacy && showWarnings && warningLabels.map((warning) => (
        <Badge key={warning} variant="outline">
          {warning}
        </Badge>
      ))}
      {isLegacy && showWarnings && diagnostics.warnings.length > warningLabels.length && (
        <Badge variant="outline">
          +{diagnostics.warnings.length - warningLabels.length}
        </Badge>
      )}
    </div>
  );
}
