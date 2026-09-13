import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import {
  attachPinterestCreativeDiagnostics,
  diagnoseCreativeBatch,
  filterPinsByCreativeDiagnostics,
  getPinCreativeDiagnostics,
  readPinterestCreativeDiagnostics,
} from '@/lib/pinterest/creative-diagnostics';
import { attachPinterestStrategyMetadata } from '@/lib/pinterest/strategy';
import type { PinQualityIssueCode, PinQualityStatus } from '@/lib/pinterest/quality-gate';
import type { BannerTemplate } from '@/lib/validations/pinterest';
import type { PinterestAngle } from '@/types/pinterest';
import type { Pin } from '@/types/database';

function diagnosticPin({
  angle,
  template,
  position = 'top',
  status = 'PASS',
  warnings = [],
}: {
  angle: PinterestAngle;
  template: BannerTemplate;
  position?: 'top' | 'bottom';
  status?: PinQualityStatus;
  warnings?: PinQualityIssueCode[];
}): Pick<Pin, 'image_analysis' | 'title_banner_template'> {
  const strategy = attachPinterestStrategyMetadata(null, angle);
  return {
    title_banner_template: template,
    image_analysis: attachPinterestCreativeDiagnostics(strategy, {
      status,
      warnings,
      template,
      position,
    }),
  };
}

test('exposes angle, template, position, Quality Gate status and warnings', () => {
  const pin = diagnosticPin({
    angle: 'problem-solution',
    template: 'split',
    position: 'bottom',
    status: 'WARN',
    warnings: ['local-complexity'],
  });

  expect(getPinCreativeDiagnostics(pin)).toEqual({
    angle: 'problem-solution',
    template: 'split',
    position: 'bottom',
    status: 'WARN',
    warnings: ['local-complexity'],
  });
  expect(readPinterestCreativeDiagnostics(pin.image_analysis)?.status).toBe('WARN');
});

test('filters Pins by quality, angle and template', () => {
  const pins = [
    diagnosticPin({ angle: 'curiosity', template: 'minimal' }),
    diagnosticPin({ angle: 'listicle', template: 'magazine', status: 'WARN' }),
    diagnosticPin({ angle: 'discovery', template: 'editorial', status: 'FAIL' }),
  ];

  expect(filterPinsByCreativeDiagnostics(pins, {
    quality: 'WARN', angle: 'ALL', template: 'ALL',
  })).toHaveLength(1);
  expect(filterPinsByCreativeDiagnostics(pins, {
    quality: 'ALL', angle: 'curiosity', template: 'minimal',
  })).toHaveLength(1);
  expect(filterPinsByCreativeDiagnostics(pins, {
    quality: 'NEEDS_REVIEW', angle: 'ALL', template: 'ALL',
  })).toHaveLength(1);
});

test('reports complete angle coverage for a batch of five', () => {
  const pins = [
    diagnosticPin({ angle: 'curiosity', template: 'minimal' }),
    diagnosticPin({ angle: 'problem-solution', template: 'split' }),
    diagnosticPin({ angle: 'listicle', template: 'magazine' }),
    diagnosticPin({ angle: 'discovery', template: 'editorial' }),
    diagnosticPin({ angle: 'article-promise', template: 'editorial', position: 'bottom' }),
  ];
  const result = diagnoseCreativeBatch(pins);

  expect(result.coveredAngles).toHaveLength(5);
  expect(result.missingAngles).toEqual([]);
  expect(result.templateCount).toBe(4);
  expect(result.combinationCount).toBe(5);
});

test('reports visual diversity and existing repetition warnings for a batch of ten', () => {
  const angles: PinterestAngle[] = [
    'curiosity', 'problem-solution', 'listicle', 'discovery', 'article-promise',
  ];
  const templates: BannerTemplate[] = ['minimal', 'editorial', 'magazine', 'split', 'editorial'];
  const pins = angles.flatMap((angle, index) => [
    diagnosticPin({ angle, template: templates[index], position: 'top' }),
    diagnosticPin({
      angle,
      template: index === 2 ? 'magazine' : index % 2 === 0 ? 'editorial' : 'split',
      position: 'bottom',
      status: index === 0 ? 'WARN' : 'PASS',
      warnings: index === 0 ? ['excessive-repetition'] : [],
    }),
  ]);
  const result = diagnoseCreativeBatch(pins);

  expect(result.coveredAngles).toHaveLength(5);
  expect(result.templateCount).toBeGreaterThanOrEqual(4);
  expect(result.combinationCount).toBeGreaterThanOrEqual(6);
  expect(result.repetitionsDetected).toBe(1);
});

test('keeps legacy Pins without diagnostics compatible', () => {
  expect(getPinCreativeDiagnostics({
    image_analysis: '{malformed',
    title_banner_template: 'clean-band',
  })).toEqual({
    angle: null,
    template: 'clean-band',
    position: null,
    status: null,
    warnings: [],
  });
});

test('Batch Review opens the existing Change layout flow', () => {
  const tableSource = readFileSync('components/pinterest/pin-table.tsx', 'utf8');
  const batchSource = readFileSync('components/pinterest/pin-batch-review-dialog.tsx', 'utf8');

  expect(batchSource).toContain('onClick={() => onChangeLayout(pin)}');
  expect(batchSource).toContain('Change layout');
  expect(tableSource).toContain('setRecomposePin(pin)');
  expect(tableSource).toContain('<RecomposePinDialog');
});

test('successful generation and recomposition persist diagnostics in existing image_analysis', () => {
  const generationRoute = readFileSync('app/api/pinterest/generate-images/route.ts', 'utf8');
  const recompositionRoute = readFileSync('app/api/pinterest/pin-images/recompose/route.ts', 'utf8');

  expect(generationRoute).toContain('attachPinterestCreativeDiagnostics');
  expect(recompositionRoute).toContain('attachPinterestCreativeDiagnostics');
  expect(recompositionRoute).toContain('composition.quality.issues.map');
});
