import type { PinQualityIssueCode, PinQualityStatus } from './quality-gate';
import { readPinterestStrategyAngle } from './strategy';
import { BANNER_TEMPLATES, type BannerTemplate } from '@/lib/validations/pinterest';
import { PINTEREST_ANGLES, type PinterestAngle } from '@/types/pinterest';
import type { Pin } from '@/types/database';

const CREATIVE_DIAGNOSTICS_METADATA_KEY = '_pinterestCreativeDiagnostics';
const QUALITY_STATUSES: readonly PinQualityStatus[] = ['PASS', 'WARN', 'RECOMPOSE', 'FAIL'];
const QUALITY_ISSUES: readonly PinQualityIssueCode[] = [
  'text-overflow',
  'low-contrast',
  'unsafe-area',
  'incompatible-template',
  'excessive-repetition',
  'local-complexity',
  'image-text-balance',
];

export interface PersistedCreativeDiagnostics {
  status: PinQualityStatus;
  warnings: PinQualityIssueCode[];
  template: BannerTemplate;
  position: 'top' | 'bottom';
}

export interface PinCreativeDiagnostics {
  angle: PinterestAngle | null;
  template: BannerTemplate | null;
  position: 'top' | 'bottom' | null;
  status: PinQualityStatus | null;
  warnings: PinQualityIssueCode[];
}

export interface CreativeDiagnosticFilters {
  quality: PinQualityStatus | 'NEEDS_REVIEW' | 'ALL';
  angle: PinterestAngle | 'ALL';
  template: BannerTemplate | 'ALL';
}

export interface BatchCreativeDiagnostics {
  templateCount: number;
  combinationCount: number;
  coveredAngles: PinterestAngle[];
  missingAngles: PinterestAngle[];
  repetitionsDetected: number;
}

export const CREATIVE_WARNING_LABELS: Record<PinQualityIssueCode, string> = {
  'text-overflow': 'Text overflow',
  'low-contrast': 'Low contrast',
  'unsafe-area': 'Unsafe area',
  'incompatible-template': 'Template mismatch',
  'excessive-repetition': 'Repeated composition',
  'local-complexity': 'Busy image area',
  'image-text-balance': 'Image/text imbalance',
};

function parseMetadata(imageAnalysisJson: string | null): Record<string, unknown> | null {
  if (!imageAnalysisJson) return null;
  try {
    const parsed = JSON.parse(imageAnalysisJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function attachPinterestCreativeDiagnostics(
  imageAnalysisJson: string | null,
  diagnostics: PersistedCreativeDiagnostics
): string {
  const metadata = parseMetadata(imageAnalysisJson) ?? {};
  return JSON.stringify({
    ...metadata,
    [CREATIVE_DIAGNOSTICS_METADATA_KEY]: diagnostics,
  });
}

export function readPinterestCreativeDiagnostics(
  imageAnalysisJson: string | null
): PersistedCreativeDiagnostics | null {
  const metadata = parseMetadata(imageAnalysisJson);
  const value = metadata?.[CREATIVE_DIAGNOSTICS_METADATA_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (
    !QUALITY_STATUSES.includes(candidate.status as PinQualityStatus) ||
    !BANNER_TEMPLATES.includes(candidate.template as BannerTemplate) ||
    (candidate.position !== 'top' && candidate.position !== 'bottom') ||
    !Array.isArray(candidate.warnings)
  ) {
    return null;
  }

  const warnings = candidate.warnings.filter((warning): warning is PinQualityIssueCode =>
    QUALITY_ISSUES.includes(warning as PinQualityIssueCode)
  );
  return {
    status: candidate.status as PinQualityStatus,
    template: candidate.template as BannerTemplate,
    position: candidate.position,
    warnings,
  };
}

export function getPinCreativeDiagnostics(
  pin: Pick<Pin, 'image_analysis' | 'title_banner_template'>
): PinCreativeDiagnostics {
  const persisted = readPinterestCreativeDiagnostics(pin.image_analysis);
  return {
    angle: readPinterestStrategyAngle(pin.image_analysis),
    template: persisted?.template ?? pin.title_banner_template,
    position: persisted?.position ?? null,
    status: persisted?.status ?? null,
    warnings: persisted?.warnings ?? [],
  };
}

export function filterPinsByCreativeDiagnostics<T extends Pick<Pin, 'image_analysis' | 'title_banner_template'>>(
  pins: readonly T[],
  filters: CreativeDiagnosticFilters
): T[] {
  return pins.filter((pin) => {
    const diagnostics = getPinCreativeDiagnostics(pin);
    const qualityMatches =
      filters.quality === 'ALL' ||
      (filters.quality === 'NEEDS_REVIEW'
        ? diagnostics.status === 'RECOMPOSE' || diagnostics.status === 'FAIL'
        : diagnostics.status === filters.quality);
    return (
      qualityMatches &&
      (filters.angle === 'ALL' || diagnostics.angle === filters.angle) &&
      (filters.template === 'ALL' || diagnostics.template === filters.template)
    );
  });
}

export function diagnoseCreativeBatch(
  pins: readonly Pick<Pin, 'image_analysis' | 'title_banner_template'>[]
): BatchCreativeDiagnostics {
  const diagnostics = pins.map(getPinCreativeDiagnostics);
  const templates = new Set(diagnostics.flatMap((item) => item.template ? [item.template] : []));
  const combinations = new Set(
    diagnostics.flatMap((item) =>
      item.template && item.position ? [`${item.template}/${item.position}`] : []
    )
  );
  const coveredAngles = PINTEREST_ANGLES.filter((angle) =>
    diagnostics.some((item) => item.angle === angle)
  );

  return {
    templateCount: templates.size,
    combinationCount: combinations.size,
    coveredAngles,
    missingAngles: PINTEREST_ANGLES.filter((angle) => !coveredAngles.includes(angle)),
    repetitionsDetected: diagnostics.filter((item) =>
      item.warnings.includes('excessive-repetition')
    ).length,
  };
}
