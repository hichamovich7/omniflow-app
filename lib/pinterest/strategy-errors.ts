import type { ApiError, ApiErrorIssue } from '@/types/api';
import type {
  PinterestSafeguardField,
  PinterestSafeguardReason,
  PinterestStrategyIssue,
  PinterestStrategyIssueCode,
} from '@/lib/pinterest/strategy';

/**
 * User-facing form of a strategy-safeguard rejection. The safeguards
 * themselves (lib/pinterest/strategy.ts, lib/pinterest/article-briefs.ts,
 * validateDistinctAngles) are unchanged: this only explains which one failed,
 * on which Pin and field, and what to do. Every text here is built from fixed
 * templates and safe tokens (angle names, counts, digits, fixed-vocabulary
 * terms) — never from a prompt, a secret or raw model output.
 */

export const STRATEGY_SAFEGUARD_ERROR_CODE = 'strategy_safeguard_failed';

/** Bound on the issues returned to the browser (issueCount keeps the total). */
export const MAX_RESPONSE_ISSUES = 20;
const MAX_LOGGED_ISSUES = 10;
const MAX_STORED_ISSUE_MESSAGES = 3;

export type StrategySafeguardScope = 'batch' | 'pin';

export interface StrategySafeguardError extends ApiError {
  code: typeof STRATEGY_SAFEGUARD_ERROR_CODE;
  retryable: boolean;
  issues: ApiErrorIssue[];
  issueCount: number;
}

/**
 * Every safeguard depends on the model's (non-deterministic) output, so a new
 * attempt can pass. Kept per reason so a check that retrying cannot fix is
 * marked here, not guessed by the UI.
 */
const RETRYABLE: Record<PinterestSafeguardReason, boolean> = {
  UNBALANCED_ANGLES: true,
  DUPLICATE_ANGLE: true,
  ANGLE_MISMATCH: true,
  DUPLICATE_TITLE: true,
  DUPLICATE_PIN: true,
  UNSUPPORTED_NUMBER: true,
  UNSUPPORTED_CLAIM: true,
  MISSING_SOURCE_SECTION: true,
  DUPLICATE_SOURCE_SECTION: true,
  IMAGE_SUBJECT_MISMATCH: true,
  UNGROUNDED_IMAGE_ELEMENTS: true,
  UNGROUNDED_TEXT_ELEMENTS: true,
};

const FALLBACK_REASON: Record<PinterestStrategyIssueCode, PinterestSafeguardReason> = {
  'angle-coverage': 'UNBALANCED_ANGLES',
  'near-duplicate-title': 'DUPLICATE_TITLE',
  'near-duplicate-variant': 'DUPLICATE_PIN',
  'unsupported-claim': 'UNSUPPORTED_CLAIM',
};

const FIELD_LABEL: Record<PinterestSafeguardField, string> = {
  angle: 'angle',
  title: 'title',
  description: 'description',
  keywords: 'keywords',
  image_prompt: 'image description',
  sourceSectionId: 'article section',
};

function reasonOf(issue: PinterestStrategyIssue): PinterestSafeguardReason {
  return issue.reason ?? FALLBACK_REASON[issue.code];
}

function pinLabel(pinIndex: number | undefined, scope: StrategySafeguardScope): string {
  return scope === 'pin' || pinIndex === undefined ? 'The Pin' : `Pin ${pinIndex + 1}`;
}

function describe(issue: PinterestStrategyIssue, scope: StrategySafeguardScope): { message: string; action: string } {
  const pin = pinLabel(issue.pinIndex, scope);
  const details = issue.details ?? [];
  const related = scope === 'batch' && issue.pinIndexes ? issue.pinIndexes[0] + 1 : undefined;
  const field = issue.field ? FIELD_LABEL[issue.field] : 'text';

  switch (reasonOf(issue)) {
    case 'UNBALANCED_ANGLES': {
      const [expected, ...found] = details;
      return {
        message:
          `The Pins do not cover the five Pinterest angles evenly` +
          (expected ? ` (expected ${expected} per angle${found.length ? `; got ${found.join(', ')}` : ''}).` : '.'),
        action: 'Try again — a new attempt usually balances the angles.',
      };
    }
    case 'DUPLICATE_ANGLE':
      return {
        message: `${pin} repeats the "${details[0] ?? 'same'}" angle; below 5 Pins, each angle may be used only once.`,
        action: 'Try again, or request 5 Pins or more.',
      };
    case 'ANGLE_MISMATCH':
      return {
        message: `${pin} was written with the "${details[1] ?? 'wrong'}" angle instead of "${details[0] ?? 'its own'}".`,
        action: 'Regenerate this Pin again.',
      };
    case 'DUPLICATE_TITLE':
      return {
        message: related
          ? `${pin}'s title is too close to Pin ${related}'s title.`
          : `${pin}'s title is too close to another Pin's title.`,
        action: 'Try again so each Pin gets a distinct title.',
      };
    case 'DUPLICATE_PIN':
      return {
        message:
          `${pin} is almost a copy of ${related ? `Pin ${related}` : 'another Pin'}` +
          `${details[0] ? ` (same "${details[0]}" angle)` : ''}: its ${field} needs a different promise or scene.`,
        action: 'Try again, or request fewer Pins so each angle needs fewer variants.',
      };
    case 'UNSUPPORTED_NUMBER':
      return {
        message:
          `${pin}'s ${field} uses a number that is not in the keyword or the source` +
          (details.length ? ` (${details.join(', ')}).` : '.'),
        action: 'Try again. If the number is right, add it to the keyword or the source article.',
      };
    case 'UNSUPPORTED_CLAIM':
      return {
        message: `${pin}'s ${field} makes a "${details[0] ?? 'factual'}" claim that the keyword or the source does not support.`,
        action: 'Try again. If the claim is true, include it in the keyword or the source article.',
      };
    case 'MISSING_SOURCE_SECTION':
      return {
        message: `${pin} is not linked to one of the article sections OmniFlow planned for it.`,
        action: 'Try again.',
      };
    case 'DUPLICATE_SOURCE_SECTION':
      return {
        message: related
          ? `Pins ${related} and ${(issue.pinIndex ?? 0) + 1} are built from the same article section.`
          : `${pin} reuses an article section already used by another Pin.`,
        action: 'Try again, or request fewer Pins than the article has sections.',
      };
    case 'IMAGE_SUBJECT_MISMATCH': {
      const subject = issue.subject;
      const list = (label: string, terms: string[] | undefined) => (terms?.length ? ` ${label}: ${terms.join(', ')}.` : '');
      return {
        message:
          `${pin} does not clearly represent the article section.` +
          list('Expected', subject?.expected) +
          list('Detected', subject?.detected) +
          list('Missing', subject?.missing),
        action: 'Try again, or review the article section.',
      };
    }
    case 'UNGROUNDED_IMAGE_ELEMENTS':
      return {
        message:
          `${pin}'s image adds elements the article never mentions` +
          (details.length ? `: ${details.join(', ')}.` : '.'),
        action: 'Try again.',
      };
    case 'UNGROUNDED_TEXT_ELEMENTS':
      return {
        message:
          `${pin}'s ${field} names elements the article never mentions` +
          (details.length ? `: ${details.join(', ')}.` : '.'),
        action: 'Try again.',
      };
  }
}

function toApiIssue(issue: PinterestStrategyIssue, scope: StrategySafeguardScope): ApiErrorIssue {
  const { message, action } = describe(issue, scope);
  return {
    code: reasonOf(issue),
    ...(scope === 'batch' && issue.pinIndex !== undefined ? { pinIndex: issue.pinIndex + 1 } : {}),
    ...(scope === 'batch' && issue.pinIndexes ? { relatedPinIndex: issue.pinIndexes[0] + 1 } : {}),
    ...(issue.field ? { field: issue.field } : {}),
    message,
    action,
  };
}

/**
 * `scope: 'batch'` — POST /api/pinterest/generate (Pin numbers shown);
 * `scope: 'pin'` — one Pin being regenerated (the Pin is already known).
 */
export function buildStrategySafeguardError(
  issues: PinterestStrategyIssue[],
  scope: StrategySafeguardScope = 'batch'
): StrategySafeguardError {
  const count = issues.length;
  const checks = `${count} quality check${count === 1 ? '' : 's'}`;
  return {
    code: STRATEGY_SAFEGUARD_ERROR_CODE,
    message:
      scope === 'batch'
        ? `The AI's Pins were rejected by ${checks}. Nothing was saved.`
        : `The regenerated Pin was rejected by ${checks}. The Pin was not changed.`,
    retryable: count > 0 && issues.every((issue) => RETRYABLE[reasonOf(issue)]),
    issues: issues.slice(0, MAX_RESPONSE_ISSUES).map((issue) => toApiIssue(issue, scope)),
    issueCount: count,
  };
}

/** Short text for generations.error_message (shown on the failed generation page). */
export function strategySafeguardSummary(error: StrategySafeguardError): string {
  const shown = error.issues.slice(0, MAX_STORED_ISSUE_MESSAGES).map((issue) => issue.message);
  const more = error.issueCount - shown.length;
  return [error.message, ...shown, more > 0 ? `(+${more} more)` : null].filter(Boolean).join(' ');
}

/**
 * One flattened log line: codes, step, Pin index, field, model and role only
 * — no issue message, no Pin text, no prompt, no secret.
 */
export function strategySafeguardLogLine(
  issues: PinterestStrategyIssue[],
  context: { step: 'generate' | 'regenerate'; model: string; role: string }
): string {
  return JSON.stringify({
    step: context.step,
    model: context.model,
    role: context.role,
    issueCount: issues.length,
    issues: issues.slice(0, MAX_LOGGED_ISSUES).map((issue) => ({
      reason: reasonOf(issue),
      code: issue.code,
      ...(issue.pinIndex !== undefined ? { pinIndex: issue.pinIndex } : {}),
      ...(issue.field ? { field: issue.field } : {}),
    })),
  });
}

/** Client-side narrowing of an API error to the structured safeguard form. */
export function isStrategySafeguardError(error: ApiError | null | undefined): error is StrategySafeguardError {
  return Boolean(
    error &&
      error.code === STRATEGY_SAFEGUARD_ERROR_CODE &&
      typeof error.retryable === 'boolean' &&
      Array.isArray(error.issues)
  );
}
