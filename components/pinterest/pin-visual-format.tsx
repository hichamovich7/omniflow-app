import { Badge } from '@/components/ui/badge';
import { describeVisualFormatSources, readPinVisualFormat } from '@/lib/social/pin-display';

/**
 * Visual format of a Pin (TASK-079). The badge appears only on composed
 * Pins (dense grids stay unchanged); the details line names the format of
 * every Pin — "Classic" when no template was stored.
 */

export function PinVisualFormatBadge({ imageAnalysis }: { imageAnalysis: string | null }) {
  const format = readPinVisualFormat(imageAnalysis);
  if (!format.composed) return null;
  const sources = describeVisualFormatSources(format.sources);
  return (
    <Badge
      variant="purple"
      className="w-fit"
      title={[
        `Visual format: ${format.label}`,
        format.layout && format.panelCount ? `Layout: ${format.layout} · ${format.panelCount} step panels` : null,
        sources,
        ...format.warnings,
      ]
        .filter(Boolean)
        .join('\n')}
      data-testid="pin-visual-format"
    >
      {format.label}
    </Badge>
  );
}

export function PinVisualFormatDetails({ imageAnalysis }: { imageAnalysis: string | null }) {
  const format = readPinVisualFormat(imageAnalysis);
  const sources = describeVisualFormatSources(format.sources);
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground" data-testid="pin-visual-format-details">
      <div className="flex flex-wrap items-center gap-1.5">
        <span>
          Visual format: <span className="font-medium text-foreground">{format.label}</span>
        </span>
        {format.composed && (
          <Badge variant={format.status === 'rendered' ? 'success' : 'outline'} className="w-fit text-xs">
            {format.status === 'rendered' ? 'Composed by OmniFlow' : 'Composition pending'}
          </Badge>
        )}
      </div>
      {format.layout && format.panelCount && (
        <span data-testid="pin-visual-format-layout">
          Layout: {format.layout} · {format.panelCount} step panels · {format.imageCalls} image generations
        </span>
      )}
      {sources && <span className="break-words">{sources}</span>}
      {format.warnings.map((warning) => (
        <span key={warning} className="text-warning">
          {warning}
        </span>
      ))}
    </div>
  );
}
