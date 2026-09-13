import { expect, test } from 'playwright/test';
import type {
  BannerCompositionDiagnostics,
  CompositedBanner,
} from '@/lib/pinterest/compositing';
import {
  composeHeadlineWithQualityGate,
  PinQualityGate,
  type PinQualityHistoryItem,
  type QualityGateBannerComposer,
} from '@/lib/pinterest/quality-gate';

function diagnostics(
  overrides: Partial<BannerCompositionDiagnostics> = {}
): BannerCompositionDiagnostics {
  return {
    requestedTemplate: 'editorial',
    renderedTemplate: 'editorial',
    canvas: { width: 1000, height: 1500 },
    requestedPosition: 'top',
    chosenZone: 'top',
    brightness: 0.45,
    localContrast: 0.4,
    localVariance: 0.02,
    edgeDensity: 0.08,
    visualComplexity: 0.3,
    contrastRatio: 6.2,
    overlayApplied: false,
    overlay: null,
    textColor: '#FFFFFF',
    fallbackUsed: null,
    safeArea: { left: 50, right: 50, top: 60, bottom: 60 },
    bannerBounds: { x: 0, y: 60, width: 1000, height: 300 },
    textBounds: { x: 150, y: 130, width: 600, height: 90 },
    candidates: [],
    ...overrides,
  };
}

const gate = new PinQualityGate();

test.describe('Pinterest PinQualityGate', () => {
  test('returns PASS when every final-render signal is valid', () => {
    const result = gate.evaluate({ diagnostics: diagnostics(), angle: 'article-promise' });

    expect(result.status).toBe('PASS');
    expect(result.canExport).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.signals).toMatchObject({
      textFit: true,
      safeAreaValid: true,
      templateCompatible: true,
      excessiveRepetition: false,
    });
  });

  test('returns WARN for an angle/template incompatibility', () => {
    const result = gate.evaluate({
      diagnostics: diagnostics({ requestedTemplate: 'magazine', renderedTemplate: 'magazine' }),
      angle: 'curiosity',
    });

    expect(result.status).toBe('WARN');
    expect(result.canExport).toBe(true);
    expect(result.issues).toContainEqual({ code: 'incompatible-template', severity: 'WARN' });
  });

  test('returns RECOMPOSE for a recoverable final-render defect', () => {
    const result = gate.evaluate({
      diagnostics: diagnostics({ contrastRatio: 4.1 }),
      angle: 'article-promise',
    });

    expect(result.status).toBe('RECOMPOSE');
    expect(result.canExport).toBe(false);
  });

  test('returns FAIL for invalid text geometry', () => {
    const result = gate.evaluate({
      diagnostics: diagnostics({ textBounds: { x: 150, y: 130, width: 0, height: 90 } }),
      angle: 'article-promise',
    });

    expect(result.status).toBe('FAIL');
    expect(result.canExport).toBe(false);
  });

  test('requires recomposition when contrast is below 4.5', () => {
    const result = gate.evaluate({
      diagnostics: diagnostics({ contrastRatio: 4.49 }),
      angle: 'problem-solution',
    });

    expect(result.status).toBe('RECOMPOSE');
    expect(result.issues).toContainEqual({ code: 'low-contrast', severity: 'RECOMPOSE' });
  });

  test('fails when text overflows its rendered banner zone', () => {
    const result = gate.evaluate({
      diagnostics: diagnostics({ textBounds: { x: 700, y: 130, width: 350, height: 90 } }),
      angle: 'article-promise',
    });

    expect(result.status).toBe('FAIL');
    expect(result.issues).toContainEqual({ code: 'text-overflow', severity: 'FAIL' });
  });

  test('requires recomposition when text crosses a safe area', () => {
    const result = gate.evaluate({
      diagnostics: diagnostics({
        bannerBounds: { x: 0, y: 0, width: 1000, height: 300 },
        textBounds: { x: 150, y: 20, width: 600, height: 90 },
      }),
      angle: 'article-promise',
    });

    expect(result.status).toBe('RECOMPOSE');
    expect(result.issues).toContainEqual({ code: 'unsafe-area', severity: 'RECOMPOSE' });
  });

  test('warns when a variant is too similar to an earlier batch item', () => {
    const current = diagnostics();
    const first = gate.evaluate({ diagnostics: current, angle: 'article-promise' });
    const history: PinQualityHistoryItem[] = [{
      angle: 'article-promise',
      template: current.renderedTemplate,
      position: current.chosenZone,
      imageTextBalance: first.signals.imageTextBalance,
      visualComplexity: current.visualComplexity,
    }];
    const result = gate.evaluate({
      diagnostics: current,
      angle: 'article-promise',
      history,
    });

    expect(result.status).toBe('WARN');
    expect(result.issues).toContainEqual({ code: 'excessive-repetition', severity: 'WARN' });
  });

  test('warns on excessive local complexity without blocking a readable Pin', () => {
    const result = gate.evaluate({
      diagnostics: diagnostics({ visualComplexity: 0.9 }),
      angle: 'article-promise',
    });

    expect(result.status).toBe('WARN');
    expect(result.canExport).toBe(true);
    expect(result.issues).toContainEqual({ code: 'local-complexity', severity: 'WARN' });
  });

  test('warns when text overwhelms the image balance', () => {
    const result = gate.evaluate({
      diagnostics: diagnostics({
        textBounds: { x: 60, y: 70, width: 880, height: 220 },
      }),
      angle: 'article-promise',
    });

    expect(result.status).toBe('WARN');
    expect(result.canExport).toBe(true);
    expect(result.issues).toContainEqual({ code: 'image-text-balance', severity: 'WARN' });
  });

  test('recomposes the same bitmap successfully without a new AI image call', async () => {
    const sourceImage = Buffer.from('already-generated-photo');
    const receivedImages: Buffer[] = [];
    let compositionCount = 0;
    const compose: QualityGateBannerComposer = async (
      imageBuffer,
      _text,
      _position,
      _accentColor,
      _textColor,
      template,
      preferredPosition
    ): Promise<CompositedBanner> => {
      receivedImages.push(imageBuffer);
      const attempt = compositionCount++;
      return {
        buffer: Buffer.from(`composition-${attempt}`),
        diagnostics: diagnostics({
          requestedTemplate: template,
          renderedTemplate: template,
          chosenZone: preferredPosition,
          contrastRatio: attempt === 0 ? 4.2 : 6.1,
        }),
      };
    };

    const result = await composeHeadlineWithQualityGate(
      {
        imageBuffer: sourceImage,
        text: 'A readable Pinterest headline',
        angle: 'article-promise',
        accentColor: { r: 176, g: 122, b: 91 },
        textColor: '#ffffff',
        selectedTemplate: 'editorial',
        selectedPosition: 'top',
        allowedTemplates: ['editorial', 'split'],
      },
      { compose }
    );

    expect(compositionCount).toBe(2);
    expect(receivedImages.every((image) => image === sourceImage)).toBe(true);
    expect(result.quality.status).toBe('PASS');
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(['RECOMPOSE', 'PASS']);
  });
});
