import {
  compositeBannerWithDiagnostics,
  type BannerCompositionDiagnostics,
  type CompositedBanner,
} from './compositing';
import { LOCAL_CONTRAST_TARGET, type CandidateZoneName } from './local-contrast';
import { ANGLE_TEMPLATE_MAP } from './strategy';
import { BannerCompositionError, type PixelRect } from './text-layout';
import type { AccentColorResult } from './color-extraction';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import type { PinterestAngle } from '@/types/pinterest';

export type PinQualityStatus = 'PASS' | 'WARN' | 'RECOMPOSE' | 'FAIL';

export type PinQualityIssueCode =
  | 'text-overflow'
  | 'low-contrast'
  | 'unsafe-area'
  | 'incompatible-template'
  | 'excessive-repetition'
  | 'local-complexity'
  | 'image-text-balance';

export interface PinQualityIssue {
  code: PinQualityIssueCode;
  severity: Exclude<PinQualityStatus, 'PASS'>;
}

export interface PinQualitySignals {
  textFit: boolean;
  contrastRatio: number;
  safeAreaValid: boolean;
  visualComplexity: number;
  templateCompatible: boolean;
  imageTextBalance: number;
  excessiveRepetition: boolean;
}

export interface PinQualityHistoryItem {
  angle: PinterestAngle;
  template: BannerTemplate;
  position: CandidateZoneName;
  imageTextBalance: number;
  visualComplexity: number;
}

export interface PinQualityResult {
  status: PinQualityStatus;
  canExport: boolean;
  issues: PinQualityIssue[];
  signals: PinQualitySignals;
}

export interface PinQualityGateInput {
  diagnostics: BannerCompositionDiagnostics;
  angle: PinterestAngle;
  history?: readonly PinQualityHistoryItem[];
}

const COMPLEXITY_WARN_THRESHOLD = 0.78;
const BALANCE_WARN_MIN = 0.025;
const BALANCE_WARN_MAX = 0.58;

function rectContains(outer: PixelRect, inner: PixelRect): boolean {
  return (
    inner.width > 0 &&
    inner.height > 0 &&
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function isInsideSafeArea(diagnostics: BannerCompositionDiagnostics): boolean {
  const { textBounds } = diagnostics;
  const { width, height } = diagnostics.canvas;
  const { left, right, top, bottom } = diagnostics.safeArea;
  return (
    textBounds.x >= left &&
    textBounds.y >= top &&
    textBounds.x + textBounds.width <= width - right &&
    textBounds.y + textBounds.height <= height - bottom
  );
}

function calculateImageTextBalance(diagnostics: BannerCompositionDiagnostics): number {
  const textArea = diagnostics.textBounds.width * diagnostics.textBounds.height;
  const bannerArea = diagnostics.bannerBounds.width * diagnostics.bannerBounds.height;
  return bannerArea > 0 ? Math.min(1, Math.max(0, textArea / bannerArea)) : 1;
}

function isExcessiveRepetition(
  input: PinQualityGateInput,
  imageTextBalance: number
): boolean {
  return (input.history ?? []).some(
    (item) =>
      item.angle === input.angle &&
      item.template === input.diagnostics.renderedTemplate &&
      item.position === input.diagnostics.chosenZone &&
      Math.abs(item.imageTextBalance - imageTextBalance) <= 0.05 &&
      Math.abs(item.visualComplexity - input.diagnostics.visualComplexity) <= 0.1
  );
}

function statusFromIssues(issues: readonly PinQualityIssue[]): PinQualityStatus {
  if (issues.some((issue) => issue.severity === 'FAIL')) return 'FAIL';
  if (issues.some((issue) => issue.severity === 'RECOMPOSE')) return 'RECOMPOSE';
  return issues.length > 0 ? 'WARN' : 'PASS';
}

export class PinQualityGate {
  evaluate(input: PinQualityGateInput): PinQualityResult {
    const textFit = rectContains(input.diagnostics.bannerBounds, input.diagnostics.textBounds);
    const safeAreaValid = isInsideSafeArea(input.diagnostics);
    const templateCompatible = ANGLE_TEMPLATE_MAP[input.angle].includes(
      input.diagnostics.renderedTemplate
    );
    const imageTextBalance = calculateImageTextBalance(input.diagnostics);
    const excessiveRepetition = isExcessiveRepetition(input, imageTextBalance);
    const issues: PinQualityIssue[] = [];

    if (!textFit) issues.push({ code: 'text-overflow', severity: 'FAIL' });
    if (input.diagnostics.contrastRatio < LOCAL_CONTRAST_TARGET) {
      issues.push({ code: 'low-contrast', severity: 'RECOMPOSE' });
    }
    if (!safeAreaValid) issues.push({ code: 'unsafe-area', severity: 'RECOMPOSE' });
    if (!templateCompatible) {
      issues.push({ code: 'incompatible-template', severity: 'WARN' });
    }
    if (excessiveRepetition) {
      issues.push({ code: 'excessive-repetition', severity: 'WARN' });
    }
    if (input.diagnostics.visualComplexity > COMPLEXITY_WARN_THRESHOLD) {
      issues.push({ code: 'local-complexity', severity: 'WARN' });
    }
    if (imageTextBalance < BALANCE_WARN_MIN || imageTextBalance > BALANCE_WARN_MAX) {
      issues.push({ code: 'image-text-balance', severity: 'WARN' });
    }

    const status = statusFromIssues(issues);
    return {
      status,
      canExport: status === 'PASS' || status === 'WARN',
      issues,
      signals: {
        textFit,
        contrastRatio: input.diagnostics.contrastRatio,
        safeAreaValid,
        visualComplexity: input.diagnostics.visualComplexity,
        templateCompatible,
        imageTextBalance,
        excessiveRepetition,
      },
    };
  }
}

export interface QualityGateCompositionInput {
  imageBuffer: Buffer;
  text: string;
  angle: PinterestAngle;
  accentColor: AccentColorResult['accentColor'];
  textColor: AccentColorResult['textColor'];
  selectedTemplate: BannerTemplate;
  selectedPosition: CandidateZoneName;
  allowedTemplates: readonly BannerTemplate[];
  history?: readonly PinQualityHistoryItem[];
}

export interface QualityGateCompositionAttempt {
  template: BannerTemplate;
  position: CandidateZoneName;
  status: PinQualityStatus | 'COMPOSITION_ERROR';
  overlayApplied: boolean;
}

export interface QualityGateCompositionResult extends CompositedBanner {
  template: BannerTemplate;
  position: CandidateZoneName;
  quality: PinQualityResult;
  historyItem: PinQualityHistoryItem;
  attempts: QualityGateCompositionAttempt[];
}

export type QualityGateBannerComposer = (
  imageBuffer: Buffer,
  text: string,
  position: 'top',
  accentColor: AccentColorResult['accentColor'],
  textColor: AccentColorResult['textColor'],
  template: BannerTemplate,
  preferredPosition: CandidateZoneName
) => Promise<CompositedBanner>;

export interface QualityGateDependencies {
  compose?: QualityGateBannerComposer;
  gate?: PinQualityGate;
}

export class PinQualityGateError extends Error {
  constructor(
    message: string,
    readonly status: Extract<PinQualityStatus, 'RECOMPOSE' | 'FAIL'>
  ) {
    super(message);
    this.name = 'PinQualityGateError';
  }
}

function buildCompositionAttempts(
  input: QualityGateCompositionInput
): Array<{ template: BannerTemplate; position: CandidateZoneName }> {
  const compatibleTemplates = ANGLE_TEMPLATE_MAP[input.angle].filter((template) =>
    input.allowedTemplates.includes(template)
  );
  const positions: CandidateZoneName[] = [
    input.selectedPosition,
    input.selectedPosition === 'top' ? 'bottom' : 'top',
  ];
  const attempts = [
    { template: input.selectedTemplate, position: positions[0] },
    { template: input.selectedTemplate, position: positions[1] },
    ...compatibleTemplates.flatMap((template) =>
      positions.map((position) => ({ template, position }))
    ),
  ];

  return attempts.filter(
    (attempt, index) =>
      attempts.findIndex(
        (candidate) =>
          candidate.template === attempt.template && candidate.position === attempt.position
      ) === index
  );
}

function isTextFitError(error: unknown): boolean {
  return (
    error instanceof BannerCompositionError &&
    (error.message.includes('does not fit') || error.message.includes('empty'))
  );
}

export async function composeHeadlineWithQualityGate(
  input: QualityGateCompositionInput,
  dependencies: QualityGateDependencies = {}
): Promise<QualityGateCompositionResult> {
  const compose = dependencies.compose ?? compositeBannerWithDiagnostics;
  const gate = dependencies.gate ?? new PinQualityGate();
  const attempts: QualityGateCompositionAttempt[] = [];

  for (const candidate of buildCompositionAttempts(input)) {
    let composition: CompositedBanner;
    try {
      composition = await compose(
        input.imageBuffer,
        input.text,
        'top',
        input.accentColor,
        input.textColor,
        candidate.template,
        candidate.position
      );
    } catch (error) {
      if (!(error instanceof BannerCompositionError)) throw error;
      attempts.push({
        ...candidate,
        status: 'COMPOSITION_ERROR',
        overlayApplied: false,
      });
      if (isTextFitError(error)) {
        throw new PinQualityGateError('Headline text cannot fit inside an export-safe zone', 'FAIL');
      }
      continue;
    }

    const quality = gate.evaluate({
      diagnostics: composition.diagnostics,
      angle: input.angle,
      history: input.history,
    });
    attempts.push({
      ...candidate,
      status: quality.status,
      overlayApplied: composition.diagnostics.overlayApplied,
    });

    if (quality.status === 'FAIL') {
      throw new PinQualityGateError('Headline failed the export quality gate', 'FAIL');
    }
    if (quality.status === 'RECOMPOSE') continue;

    const historyItem: PinQualityHistoryItem = {
      angle: input.angle,
      template: composition.diagnostics.renderedTemplate,
      position: composition.diagnostics.chosenZone,
      imageTextBalance: quality.signals.imageTextBalance,
      visualComplexity: quality.signals.visualComplexity,
    };
    return {
      ...composition,
      template: historyItem.template,
      position: historyItem.position,
      quality,
      historyItem,
      attempts,
    };
  }

  throw new PinQualityGateError(
    'No export-safe headline composition passed the quality gate',
    'RECOMPOSE'
  );
}
