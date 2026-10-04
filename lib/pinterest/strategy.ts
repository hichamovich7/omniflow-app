import type { BannerTemplate } from '@/lib/validations/pinterest';
import { PINTEREST_ANGLES, type PinterestAngle } from '@/types/pinterest';

const STRATEGY_METADATA_KEY = '_pinterestStrategy';

export const ANGLE_TEMPLATE_MAP: Record<PinterestAngle, readonly BannerTemplate[]> = {
  curiosity: ['minimal', 'editorial'],
  'problem-solution': ['editorial', 'split'],
  listicle: ['magazine'],
  discovery: ['minimal', 'editorial'],
  'article-promise': ['editorial', 'split'],
};

export interface PinterestStrategyPin {
  angle: PinterestAngle;
  title: string;
  description: string;
  image_prompt: string;
}

export type PinterestStrategyIssueCode =
  | 'angle-coverage'
  | 'near-duplicate-title'
  | 'near-duplicate-variant'
  | 'unsupported-claim';

export interface PinterestStrategyIssue {
  code: PinterestStrategyIssueCode;
  message: string;
  pinIndexes?: [number, number];
}

const TITLE_SIMILARITY_LIMIT = 0.8;
// Descriptions and image prompts legitimately share niche vocabulary and
// structural instructions. Reserve this guard for almost-identical variants;
// broader diversity is already enforced by the stricter title comparison.
const VARIANT_SIMILARITY_LIMIT = 0.95;
const CLAIM_TOKEN_GROUPS = [
  {
    label: 'free',
    tokens: ['free', 'gratis', 'gratuit', 'gratuite', 'gratuitement', 'kostenlos'],
  },
  {
    label: 'beginner/easy',
    tokens: [
      'beginner',
      'beginners',
      'easy',
      'simple',
      'facile',
      'faciles',
      'debutant',
      'debutants',
      'principiante',
      'principiantes',
      'facil',
      'einfach',
      'anfanger',
      'anfaenger',
    ],
  },
] as const;

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeText(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeText(right).split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection++;
  }
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

/**
 * Balanced angle order for a batch of any size (custom number of Pins):
 * round-robin over the five angles, so every angle is used once before any
 * repeats and the counts never differ by more than one. 5 → each once,
 * 10 → each twice, 7 → the first two angles twice.
 */
export function buildPinterestAnglePlan(pinsRequested: number): PinterestAngle[] {
  const size = Math.max(0, Math.floor(pinsRequested));
  return Array.from({ length: size }, (_, index) => PINTEREST_ANGLES[index % PINTEREST_ANGLES.length]);
}

/** Allowed pins per angle in a balanced batch: floor(n/5) to ceil(n/5). */
function balancedAngleRange(pinsRequested: number): { min: number; max: number } {
  return {
    min: Math.floor(pinsRequested / PINTEREST_ANGLES.length),
    max: Math.ceil(pinsRequested / PINTEREST_ANGLES.length),
  };
}

function validateAngleCoverage(
  pins: PinterestStrategyPin[],
  pinsRequested: number
): PinterestStrategyIssue[] {
  // A partial batch is reported separately (route log); only a complete one
  // can be checked for balance.
  if (pins.length !== pinsRequested || pinsRequested < 1) return [];

  const { min, max } = balancedAngleRange(pinsRequested);
  const counts = new Map<PinterestAngle, number>(
    PINTEREST_ANGLES.map((angle) => [angle, 0])
  );
  for (const pin of pins) counts.set(pin.angle, (counts.get(pin.angle) ?? 0) + 1);

  const invalid = PINTEREST_ANGLES.filter((angle) => {
    const count = counts.get(angle) ?? 0;
    return count < min || count > max;
  });
  if (invalid.length === 0) return [];

  const expected = min === max ? `${min}` : `${min}-${max}`;
  return [{
    code: 'angle-coverage',
    message:
      `Expected ${expected} pin(s) per Pinterest angle for a batch of ${pinsRequested}; ` +
      invalid.map((angle) => `${angle}=${counts.get(angle) ?? 0}`).join(', '),
  }];
}

function validateTitleDiversity(pins: PinterestStrategyPin[]): PinterestStrategyIssue[] {
  const issues: PinterestStrategyIssue[] = [];
  for (let left = 0; left < pins.length; left++) {
    for (let right = left + 1; right < pins.length; right++) {
      const similarity = tokenSimilarity(pins[left].title, pins[right].title);
      if (similarity < TITLE_SIMILARITY_LIMIT) continue;
      issues.push({
        code: 'near-duplicate-title',
        message: `Titles ${left + 1} and ${right + 1} are too similar (${similarity.toFixed(2)})`,
        pinIndexes: [left, right],
      });
    }
  }
  return issues;
}

// Pins sharing an angle (any batch above five, e.g. 6, 7, 10 or 30) must be
// real variants — different promise and scene — not near-copies. Every pair
// within the same angle is compared; for 10 Pins this is the former
// two-variants-per-angle check.
function validateRepeatedAngleVariants(pins: PinterestStrategyPin[]): PinterestStrategyIssue[] {
  const issues: PinterestStrategyIssue[] = [];
  for (const angle of PINTEREST_ANGLES) {
    const variants = pins
      .map((pin, index) => ({ pin, index }))
      .filter(({ pin }) => pin.angle === angle);

    for (let left = 0; left < variants.length; left++) {
      for (let right = left + 1; right < variants.length; right++) {
        const first = variants[left];
        const second = variants[right];
        const descriptionSimilarity = tokenSimilarity(first.pin.description, second.pin.description);
        const imageSimilarity = tokenSimilarity(first.pin.image_prompt, second.pin.image_prompt);
        if (
          descriptionSimilarity < VARIANT_SIMILARITY_LIMIT &&
          imageSimilarity < VARIANT_SIMILARITY_LIMIT
        ) continue;

        issues.push({
          code: 'near-duplicate-variant',
          message:
            `${angle} variants ${first.index + 1} and ${second.index + 1} need different ` +
            `promises and scenes (description=${descriptionSimilarity.toFixed(2)}, image=${imageSimilarity.toFixed(2)})`,
          pinIndexes: [first.index, second.index],
        });
      }
    }
  }
  return issues;
}

function extractNumbers(value: string): Set<string> {
  return new Set(value.match(/\p{Number}+(?:[.,]\p{Number}+)?/gu) ?? []);
}

function includesClaimToken(value: string, tokens: readonly string[]): boolean {
  const words = new Set(normalizeText(value).split(' ').filter(Boolean));
  return tokens.some((token) => words.has(token));
}

function validateGroundedClaims(
  pins: PinterestStrategyPin[],
  sourceEvidence: string
): PinterestStrategyIssue[] {
  const evidenceNumbers = extractNumbers(sourceEvidence);
  const issues: PinterestStrategyIssue[] = [];

  pins.forEach((pin, index) => {
    const claims = `${pin.title}\n${pin.description}`;
    const unsupportedNumbers = [...extractNumbers(claims)].filter(
      (number) => !evidenceNumbers.has(number)
    );
    if (unsupportedNumbers.length > 0) {
      issues.push({
        code: 'unsupported-claim',
        message: `Pin ${index + 1} invents unsupported number(s): ${unsupportedNumbers.join(', ')}`,
      });
    }

    for (const group of CLAIM_TOKEN_GROUPS) {
      if (
        includesClaimToken(claims, group.tokens) &&
        !includesClaimToken(sourceEvidence, group.tokens)
      ) {
        issues.push({
          code: 'unsupported-claim',
          message: `Pin ${index + 1} uses an unsupported ${group.label} claim`,
        });
      }
    }
  });

  return issues;
}

export function validatePinterestStrategyBatch(
  pins: PinterestStrategyPin[],
  pinsRequested: number,
  sourceEvidence = '',
  options: { enforceBalancedAngles?: boolean } = {}
): PinterestStrategyIssue[] {
  return [
    ...(options.enforceBalancedAngles === false
      ? []
      : validateAngleCoverage(pins, pinsRequested)),
    ...validateTitleDiversity(pins),
    ...validateRepeatedAngleVariants(pins),
    ...validateGroundedClaims(pins, sourceEvidence),
  ];
}

export function selectHeadlineTemplateForAngle(
  angle: PinterestAngle,
  occurrence: number,
  allowedTemplates: readonly BannerTemplate[]
): BannerTemplate {
  const compatible = ANGLE_TEMPLATE_MAP[angle].filter((template) =>
    allowedTemplates.includes(template)
  );
  if (compatible.length > 0) return compatible[occurrence % compatible.length];
  return allowedTemplates[0] ?? 'clean-band';
}

export function attachPinterestStrategyMetadata(
  imageAnalysisJson: string | null,
  angle: PinterestAngle
): string {
  let metadata: Record<string, unknown> = {};
  if (imageAnalysisJson) {
    try {
      const parsed = JSON.parse(imageAnalysisJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed;
    } catch {
      // Malformed legacy data must not prevent a new pin from being generated.
    }
  }

  return JSON.stringify({
    ...metadata,
    [STRATEGY_METADATA_KEY]: { angle },
  });
}

export function readPinterestStrategyAngle(
  imageAnalysisJson: string | null
): PinterestAngle | null {
  if (!imageAnalysisJson) return null;
  try {
    const parsed = JSON.parse(imageAnalysisJson) as Record<string, unknown>;
    const strategy = parsed?.[STRATEGY_METADATA_KEY];
    if (!strategy || typeof strategy !== 'object') return null;
    const angle = (strategy as { angle?: unknown }).angle;
    return PINTEREST_ANGLES.includes(angle as PinterestAngle)
      ? (angle as PinterestAngle)
      : null;
  } catch {
    return null;
  }
}
