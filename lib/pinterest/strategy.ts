import type { BannerTemplate } from '@/lib/validations/pinterest';
import { PINTEREST_ANGLES, type PinterestAngle } from '@/types/pinterest';

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

function validateAngleCoverage(
  pins: PinterestStrategyPin[],
  pinsRequested: number
): PinterestStrategyIssue[] {
  if (pins.length !== pinsRequested || (pinsRequested !== 5 && pinsRequested !== 10)) return [];

  const expectedPerAngle = pinsRequested / PINTEREST_ANGLES.length;
  const counts = new Map<PinterestAngle, number>(
    PINTEREST_ANGLES.map((angle) => [angle, 0])
  );
  for (const pin of pins) counts.set(pin.angle, (counts.get(pin.angle) ?? 0) + 1);

  const invalid = PINTEREST_ANGLES.filter((angle) => counts.get(angle) !== expectedPerAngle);
  if (invalid.length === 0) return [];

  return [{
    code: 'angle-coverage',
    message:
      `Expected ${expectedPerAngle} pin(s) per Pinterest angle for a batch of ${pinsRequested}; ` +
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

function validateTenPinVariants(pins: PinterestStrategyPin[], pinsRequested: number): PinterestStrategyIssue[] {
  if (pinsRequested !== 10 || pins.length !== 10) return [];

  const issues: PinterestStrategyIssue[] = [];
  for (const angle of PINTEREST_ANGLES) {
    const variants = pins
      .map((pin, index) => ({ pin, index }))
      .filter(({ pin }) => pin.angle === angle);
    if (variants.length !== 2) continue;

    const [first, second] = variants;
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
  sourceEvidence = ''
): PinterestStrategyIssue[] {
  return [
    ...validateAngleCoverage(pins, pinsRequested),
    ...validateTitleDiversity(pins),
    ...validateTenPinVariants(pins, pinsRequested),
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
