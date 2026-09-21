import type { z } from 'zod';
import { openRouterPinsResponseSchema } from '@/lib/validations/pinterest';

export type PinterestGenerationPlan = z.infer<typeof openRouterPinsResponseSchema>;

/**
 * Why a model response was rejected. `truncated` means the JSON ended before
 * it was complete (an unterminated string or unclosed object/array) — the
 * signature of a response cut off by the output-token limit.
 */
export type PinterestPlanFailureKind =
  | 'empty'
  | 'no_json'
  | 'truncated'
  | 'ambiguous'
  | 'invalid_json'
  | 'invalid_schema';

/** Shown to the user. Never includes any part of the model response. */
export const PIN_PLAN_FAILURE_MESSAGE =
  'The AI could not create a complete Pin plan. No images were generated. Please try again.';

const PREVIEW_HEAD_LENGTH = 160;
const PREVIEW_TAIL_LENGTH = 120;
const MAX_LOGGED_ISSUES = 10;

export interface PinterestPlanDiagnostics {
  kind: PinterestPlanFailureKind;
  responseLength: number;
  /** Start of the response, whitespace-collapsed and truncated. */
  preview: string;
  /** End of the response (only when it is longer than the preview) — shows where a truncation happened. */
  tail: string;
  detail?: string;
  issues?: Array<{ path: string; code: string }>;
}

function redact(value: string): string {
  return value
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [redacted]');
}

function collapse(value: string): string {
  return redact(value.replace(/\s+/g, ' ').trim());
}

/**
 * Controlled failure for a model response that is not a complete, valid Pin
 * plan. The message is generic on purpose: the raw response is never part of
 * the error, only of the size-limited `diagnostics()` meant for server logs.
 */
export class PinterestPlanError extends Error {
  readonly kind: PinterestPlanFailureKind;
  readonly responseLength: number;
  private readonly head: string;
  private readonly end: string;
  private readonly detail?: string;
  private readonly issues?: Array<{ path: string; code: string }>;

  constructor(
    kind: PinterestPlanFailureKind,
    raw: string,
    options: { detail?: string; issues?: Array<{ path: string; code: string }> } = {}
  ) {
    super(`Pinterest generation plan rejected: ${kind}`);
    this.name = 'PinterestPlanError';
    this.kind = kind;
    this.responseLength = raw.length;
    this.head = collapse(raw.slice(0, PREVIEW_HEAD_LENGTH));
    this.end = raw.length > PREVIEW_HEAD_LENGTH ? collapse(raw.slice(-PREVIEW_TAIL_LENGTH)) : '';
    this.detail = options.detail;
    this.issues = options.issues;
  }

  diagnostics(): PinterestPlanDiagnostics {
    return {
      kind: this.kind,
      responseLength: this.responseLength,
      preview: this.head,
      tail: this.end,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.issues ? { issues: this.issues } : {}),
    };
  }
}

type Located =
  | { kind: 'found'; start: number; end: number }
  | { kind: 'truncated'; reason: 'unterminated_string' | 'unclosed_structure' }
  | { kind: 'mismatch' }
  | { kind: 'none' };

/**
 * Finds the first complete JSON object/array in `text` with a string-aware
 * bracket scan. It never guesses: when the value does not close before the end
 * of the text it reports `truncated` and nothing is completed or repaired.
 */
function locateFirstJsonValue(text: string): Located {
  const start = text.search(/[{[]/);
  if (start === -1) return { kind: 'none' };

  const closers: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      closers.push('}');
    } else if (char === '[') {
      closers.push(']');
    } else if (char === '}' || char === ']') {
      if (closers.pop() !== char) return { kind: 'mismatch' };
      if (closers.length === 0) return { kind: 'found', start, end: index + 1 };
    }
  }

  return { kind: 'truncated', reason: inString ? 'unterminated_string' : 'unclosed_structure' };
}

function parseJsonValue(text: string, raw: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new PinterestPlanError('invalid_json', raw, {
      detail: error instanceof Error ? error.message : 'JSON.parse failed',
    });
  }
}

/**
 * Turns the planning model's raw text into a validated Pin plan, or throws a
 * `PinterestPlanError`.
 *
 * Accepted: a complete JSON value, optionally wrapped in a Markdown code fence
 * or surrounded by plain text that contains no other bracket. Anything else —
 * including a truncated response — is rejected: it is never repaired, closed
 * artificially or completed, and no pin is ever invented. The result is
 * validated against the existing Zod contract before it is returned.
 */
export function parsePinterestGenerationPlan(raw: string): PinterestGenerationPlan {
  const text = raw.replace(/^﻿/, '').trim();
  if (!text) throw new PinterestPlanError('empty', raw);

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    const located = locateFirstJsonValue(text);

    if (located.kind === 'none') throw new PinterestPlanError('no_json', raw);
    if (located.kind === 'truncated') {
      throw new PinterestPlanError('truncated', raw, { detail: located.reason });
    }
    if (located.kind === 'mismatch') {
      throw new PinterestPlanError('invalid_json', raw, { detail: 'mismatched brackets' });
    }

    // Only the Markdown fence or plain prose may surround the value. Another
    // bracket outside it means we cannot tell which value is the plan.
    const outside = text.slice(0, located.start) + text.slice(located.end);
    if (/[{}[\]]/.test(outside)) {
      throw new PinterestPlanError('ambiguous', raw, {
        detail: 'text around the JSON value contains more JSON-like content',
      });
    }

    value = parseJsonValue(text.slice(located.start, located.end), raw);
  }

  const validated = openRouterPinsResponseSchema.safeParse(value);
  if (!validated.success) {
    throw new PinterestPlanError('invalid_schema', raw, {
      issues: validated.error.issues.slice(0, MAX_LOGGED_ISSUES).map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
      })),
    });
  }

  return validated.data;
}
