import { readFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import {
  buildVersionState,
  recomposeExistingPin,
  type ManualRecompositionDependencies,
} from '@/lib/pinterest/manual-recomposition';
import {
  getPinImageStoragePath,
  getPinSourceStoragePath,
} from '@/lib/pinterest/pin-image-storage';
import {
  buildRecompositionPreviewKey,
  canApplyRecomposition,
  getRecompositionQualityLabel,
} from '@/lib/pinterest/recomposition-preview';
import type { QualityGateCompositionInput } from '@/lib/pinterest/quality-gate';
import type { PinImage } from '@/types/database';

const SOURCE = Buffer.from('existing-provider-photo');
const COLORS = { accentColor: { r: 40, g: 90, b: 150 }, textColor: '#ffffff' as const };

function qualityResult(input: QualityGateCompositionInput, overrides: Record<string, unknown> = {}) {
  return {
    buffer: Buffer.from('recomposed-pin'),
    template: input.selectedTemplate,
    position: input.selectedPosition,
    quality: {
      status: 'PASS',
      canExport: true,
      issues: [],
      signals: {
        textFit: true,
        contrastRatio: 7,
        safeAreaValid: true,
        visualComplexity: 0.2,
        templateCompatible: true,
        imageTextBalance: 0.18,
        excessiveRepetition: false,
      },
    },
    historyItem: {
      angle: input.angle,
      template: input.selectedTemplate,
      position: input.selectedPosition,
      imageTextBalance: 0.18,
      visualComplexity: 0.2,
    },
    attempts: [],
    diagnostics: {},
    ...overrides,
  };
}

function dependencies(
  onQualityGate?: (input: QualityGateCompositionInput) => Record<string, unknown>
): ManualRecompositionDependencies {
  return {
    extractAccent: async () => COLORS,
    composeCta: async (imageBuffer) => imageBuffer,
    selectTemplate: async () => ({
      template: 'editorial',
      position: 'bottom',
      fallbackReason: null,
      candidates: [],
    }),
    composeHeadline: async (input) =>
      qualityResult(input, onQualityGate?.(input)) as never,
  };
}

function version(id: string, versionNumber: number, isActive: boolean): PinImage {
  return {
    id,
    pin_id: 'pin-1',
    storage_path: `user-1/pin-1/${versionNumber}.png`,
    url: `https://example.test/${versionNumber}.png`,
    is_active: isActive,
    version: versionNumber,
    image_model: 'existing-provider-model',
    created_at: `2026-09-${String(versionNumber).padStart(2, '0')}T00:00:00.000Z`,
  };
}

test.describe('Pinterest manual recomposition', () => {
  test('has no AI generation dependency and passes the stored bitmap to local rendering', async () => {
    const moduleSource = readFileSync('lib/pinterest/manual-recomposition.ts', 'utf8');
    const routeSource = readFileSync('app/api/pinterest/pin-images/recompose/route.ts', 'utf8');
    expect(moduleSource).not.toContain("from '@/lib/ai/engine'");
    expect(routeSource).not.toContain("from '@/lib/ai/engine'");

    const localDependencies = dependencies();
    let receivedSource: Buffer | null = null;
    localDependencies.composeCta = async (imageBuffer) => {
      receivedSource = imageBuffer;
      return imageBuffer;
    };

    await recomposeExistingPin({
      sourceImageBuffer: SOURCE,
      overlayText: 'A useful headline',
      angle: 'curiosity',
      ctaText: 'Save this Pin',
      templateChoice: 'auto',
      positionChoice: 'auto',
    }, localDependencies);

    expect(receivedSource).toBe(SOURCE);
  });

  test('applies an explicit template and position through the Quality Gate', async () => {
    let gatedInput: QualityGateCompositionInput | null = null;
    const result = await recomposeExistingPin({
      sourceImageBuffer: SOURCE,
      overlayText: 'A useful headline',
      angle: 'curiosity',
      ctaText: 'Save this Pin',
      templateChoice: 'minimal',
      positionChoice: 'top',
    }, dependencies((input) => {
      gatedInput = input;
      return {};
    }));

    expect(gatedInput).toMatchObject({ selectedTemplate: 'minimal', selectedPosition: 'top' });
    expect(result.template).toBe('minimal');
    expect(result.position).toBe('top');
    expect(result.quality.status).toBe('PASS');
  });

  test('uses the Phase 5 selector for Auto choices', async () => {
    const result = await recomposeExistingPin({
      sourceImageBuffer: SOURCE,
      overlayText: 'A useful headline',
      angle: 'article-promise',
      ctaText: 'Save this Pin',
      templateChoice: 'auto',
      positionChoice: 'auto',
    }, dependencies());

    expect(result.template).toBe('editorial');
    expect(result.position).toBe('bottom');
  });

  test('returns the safe fallback chosen when the requested layout is invalid', async () => {
    const result = await recomposeExistingPin({
      sourceImageBuffer: SOURCE,
      overlayText: 'A headline that needs a safer fallback',
      angle: 'curiosity',
      ctaText: 'Save this Pin',
      templateChoice: 'minimal',
      positionChoice: 'top',
    }, dependencies(() => ({
      template: 'editorial',
      position: 'bottom',
      quality: {
        status: 'WARN',
        canExport: true,
        issues: [{ code: 'incompatible-template', severity: 'WARN' }],
        signals: {
          textFit: true,
          contrastRatio: 5.2,
          safeAreaValid: true,
          visualComplexity: 0.3,
          templateCompatible: true,
          imageTextBalance: 0.2,
          excessiveRepetition: false,
        },
      },
    })));

    expect(result.template).toBe('editorial');
    expect(result.position).toBe('bottom');
    expect(result.quality.status).toBe('WARN');
  });

  test('creates a new active version while preserving every previous version', () => {
    const oldVersions = [version('image-2', 2, true), version('image-1', 1, false)];
    const nextVersion = version('image-3', 3, false);
    const result = buildVersionState(oldVersions, nextVersion);

    expect(result).toHaveLength(3);
    expect(result.find((item) => item.id === 'image-3')?.is_active).toBe(true);
    expect(result.find((item) => item.id === 'image-2')?.is_active).toBe(false);
    expect(result.map((item) => item.id)).toEqual(['image-3', 'image-2', 'image-1']);
  });

  test('derives final and raw companion paths without a database column', () => {
    const finalPath = getPinImageStoragePath('user-1', 'pin-1', 4);
    expect(finalPath).toBe('user-1/pin-1/4.png');
    expect(getPinSourceStoragePath(finalPath)).toBe('user-1/pin-1/4.source.png');
    expect(getPinSourceStoragePath('legacy-path')).toBe('legacy-path.source');
  });

  test('changes the preview identity when template or position changes', () => {
    const initial = buildRecompositionPreviewKey('pin-1', 'auto', 'auto');
    const templateChanged = buildRecompositionPreviewKey('pin-1', 'minimal', 'auto');
    const positionChanged = buildRecompositionPreviewKey('pin-1', 'minimal', 'bottom');

    expect(templateChanged).not.toBe(initial);
    expect(positionChanged).not.toBe(templateChanged);
  });

  test('blocks Apply for unresolved or failed preview quality', () => {
    expect(canApplyRecomposition('PASS')).toBe(true);
    expect(canApplyRecomposition('WARN')).toBe(true);
    expect(canApplyRecomposition('RECOMPOSE')).toBe(false);
    expect(canApplyRecomposition('FAIL')).toBe(false);
    expect(canApplyRecomposition(null)).toBe(false);
  });

  test('provides explicit accessible labels for every Quality Gate status', () => {
    expect(getRecompositionQualityLabel('PASS')).toContain('PASS');
    expect(getRecompositionQualityLabel('WARN')).toContain('WARN');
    expect(getRecompositionQualityLabel('RECOMPOSE')).toContain('RECOMPOSE');
    expect(getRecompositionQualityLabel('FAIL')).toContain('FAIL');
  });

  test('preview route is read-only and has no image-provider dependency', () => {
    const routeSource = readFileSync(
      'app/api/pinterest/pin-images/recompose/preview/route.ts',
      'utf8'
    );

    expect(routeSource).not.toContain("from '@/lib/ai/engine'");
    expect(routeSource).not.toContain('.insert(');
    expect(routeSource).not.toContain('.update(');
    expect(routeSource).not.toContain('.delete(');
    expect(routeSource).not.toContain('.upload(');
  });
});
