/**
 * Structured, one-line logs for the WordPress publish flow (TASK-FIX-058).
 * Only identifiers, step names, durations, HTTP codes and short enum-like
 * results are ever written — never credentials, article content or HTML.
 */

export interface PublishLogContext {
  attemptId: string;
  generationId?: string;
  articleId?: string;
}

export interface PublishLogFields {
  ms?: number;
  http?: number;
  wpPostId?: number | null;
  result?: string;
  count?: number;
}

export interface PublishLogger {
  step(step: string, fields?: PublishLogFields): void;
  warn(step: string, fields?: PublishLogFields): void;
}

const PREFIX = '[wordpress publish]';

// Results are short codes chosen by the caller; still capped and stripped of
// anything that could carry free text into the log line.
function safeResult(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 60);
}

export function formatPublishLogLine(context: PublishLogContext, step: string, fields: PublishLogFields = {}): string {
  const parts = [`${PREFIX} attempt=${context.attemptId}`];
  if (context.generationId) parts.push(`generation=${context.generationId}`);
  if (context.articleId) parts.push(`article=${context.articleId}`);
  parts.push(`step=${safeResult(step)}`);
  if (fields.ms !== undefined) parts.push(`ms=${Math.round(fields.ms)}`);
  if (fields.http !== undefined) parts.push(`http=${fields.http}`);
  if (fields.wpPostId !== undefined) parts.push(`wp_post_id=${fields.wpPostId ?? 'none'}`);
  if (fields.count !== undefined) parts.push(`count=${fields.count}`);
  if (fields.result !== undefined) parts.push(`result=${safeResult(fields.result)}`);
  return parts.join(' ');
}

export function createPublishLogger(context: PublishLogContext): PublishLogger {
  return {
    step: (step, fields) => console.info(formatPublishLogLine(context, step, fields)),
    warn: (step, fields) => console.warn(formatPublishLogLine(context, step, fields)),
  };
}

export const silentPublishLogger: PublishLogger = { step: () => {}, warn: () => {} };
