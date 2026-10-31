import type { z } from 'zod';
import { openRouterPinsResponseSchema } from '@/lib/validations/pinterest';
import type { ApiErrorIssue } from '@/types/api';

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

const MAX_LOGGED_ISSUES = 10;

/**
 * What a rejected response may tell the server logs (TASK-FIX-084): its
 * failure kind, length, a fixed-vocabulary detail and the schema paths and
 * Zod codes at fault. Never any part of the response itself.
 */
export interface PinterestPlanDiagnostics {
  kind: PinterestPlanFailureKind;
  responseLength: number;
  /** Fixed vocabulary only ("unterminated_string", "mismatched brackets"…). */
  detail?: string;
  issues?: Array<{ path: string; code: string }>;
  issueCount?: number;
}

/**
 * Controlled failure for a model response that is not a complete, valid Pin
 * plan. The message is generic on purpose, and no part of the raw response
 * is kept — not even for the server logs.
 */
export class PinterestPlanError extends Error {
  readonly kind: PinterestPlanFailureKind;
  readonly responseLength: number;
  private readonly detail?: string;
  private readonly issues?: Array<{ path: string; code: string }>;
  private readonly issueCount?: number;

  constructor(
    kind: PinterestPlanFailureKind,
    raw: string,
    options: { detail?: string; issues?: Array<{ path: string; code: string }>; issueCount?: number } = {}
  ) {
    super(`Pinterest generation plan rejected: ${kind}`);
    this.name = 'PinterestPlanError';
    this.kind = kind;
    this.responseLength = raw.length;
    this.detail = options.detail;
    this.issues = options.issues;
    this.issueCount = options.issueCount;
  }

  diagnostics(): PinterestPlanDiagnostics {
    return {
      kind: this.kind,
      responseLength: this.responseLength,
      ...(this.detail ? { detail: this.detail } : {}),
      ...(this.issues ? { issues: this.issues } : {}),
      ...(this.issueCount !== undefined ? { issueCount: this.issueCount } : {}),
    };
  }
}

/**
 * The 422 issues of a rejected plan (TASK-FIX-084): one per schema path at
 * fault ("pins.0.integratedText.cta"), with the Zod code — never the value
 * the model wrote.
 */
export function planErrorIssues(error: PinterestPlanError): ApiErrorIssue[] {
  return (error.diagnostics().issues ?? []).map((issue) => {
    const pin = /^pins\.(\d+)\./.exec(issue.path);
    return {
      code: issue.code,
      ...(pin ? { pinIndex: Number(pin[1]) + 1 } : {}),
      field: issue.path,
      message: `The AI returned an invalid value for ${issue.path || 'the Pin plan'} (${issue.code}).`,
      action: 'Try again.',
    };
  });
}

export type IntegratedTextElement = 'headline' | 'subtitle' | 'cta';

/**
 * AI Integrated (TASK-FIX-084): an on-image element the user turned off is
 * never used (resolveAiIntegratedText drops it), so whatever the model
 * wrote for it — null, "", "None", a long text — is removed before the
 * schema check instead of failing the whole plan. Enabled elements and
 * unknown keys keep the strict validation.
 */
function withoutDisabledIntegratedText(value: unknown, disabled: readonly IntegratedTextElement[]): unknown {
  if (disabled.length === 0 || !value || typeof value !== 'object' || !Array.isArray((value as { pins?: unknown }).pins)) return value;
  const plan = value as { pins: unknown[] };
  return {
    ...plan,
    pins: plan.pins.map((pin) => {
      if (!pin || typeof pin !== 'object') return pin;
      const text = (pin as { integratedText?: unknown }).integratedText;
      if (!text || typeof text !== 'object' || Array.isArray(text)) return pin;
      const kept = { ...(text as Record<string, unknown>) };
      for (const element of disabled) delete kept[element];
      return { ...pin, integratedText: kept };
    }),
  };
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
  } catch {
    // JSON.parse messages quote the response ("Unexpected token … is not valid JSON"): fixed detail only.
    throw new PinterestPlanError('invalid_json', raw, { detail: 'JSON.parse failed' });
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
export function parsePinterestGenerationPlan(
  raw: string,
  options: { disabledIntegratedText?: readonly IntegratedTextElement[] } = {}
): PinterestGenerationPlan {
  return parsePinterestPlanWith(raw, openRouterPinsResponseSchema, (value) =>
    withoutDisabledIntegratedText(value, options.disabledIntegratedText ?? [])
  );
}

/**
 * Same JSON extraction and rejection rules as `parsePinterestGenerationPlan`,
 * validated against another contract (e.g. the text-only "Regenerate text"
 * answer, TASK-082).
 */
export function parsePinterestPlanWith<T extends z.ZodType>(raw: string, schema: T, prepare?: (value: unknown) => unknown): z.output<T> {
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

  const validated = schema.safeParse(prepare ? prepare(value) : value);
  if (!validated.success) {
    throw new PinterestPlanError('invalid_schema', raw, {
      issues: validated.error.issues.slice(0, MAX_LOGGED_ISSUES).map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
      })),
      issueCount: validated.error.issues.length,
    });
  }

  return validated.data;
}
