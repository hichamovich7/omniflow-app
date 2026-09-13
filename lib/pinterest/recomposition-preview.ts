import type {
  ManualPositionChoice,
  ManualTemplateChoice,
} from '@/lib/pinterest/manual-recomposition';
import type { PinQualityIssueCode, PinQualityStatus } from '@/lib/pinterest/quality-gate';

export type RecompositionPreviewIssueCode =
  | PinQualityIssueCode
  | 'quality-gate-unresolved'
  | 'quality-gate-failed';

export interface RecompositionPreviewState {
  status: PinQualityStatus;
  issues: RecompositionPreviewIssueCode[];
  template: string;
  position: string;
}

const ISSUE_LABELS: Record<RecompositionPreviewIssueCode, string> = {
  'text-overflow': 'Headline text does not fit inside the export-safe area.',
  'low-contrast': 'Local contrast remains below 4.5:1.',
  'unsafe-area': 'Text crosses a Pinterest safe area.',
  'incompatible-template': 'The selected template is not ideal for this content angle.',
  'excessive-repetition': 'This layout is very similar to another variant.',
  'local-complexity': 'The selected image zone is visually busy.',
  'image-text-balance': 'The image and text proportions are not fully balanced.',
  'quality-gate-unresolved': 'No safe automatic recomposition resolved every blocking issue.',
  'quality-gate-failed': 'The rendered layout failed an export-safety requirement.',
};

export function buildRecompositionPreviewKey(
  pinId: string,
  template: ManualTemplateChoice,
  position: ManualPositionChoice
): string {
  return `${pinId}:${template}:${position}`;
}

export function canApplyRecomposition(status: PinQualityStatus | null): boolean {
  return status === 'PASS' || status === 'WARN';
}

export function getRecompositionQualityLabel(status: PinQualityStatus): string {
  return `Quality Gate · ${status}`;
}

export function getRecompositionIssueLabel(code: RecompositionPreviewIssueCode): string {
  return ISSUE_LABELS[code];
}
