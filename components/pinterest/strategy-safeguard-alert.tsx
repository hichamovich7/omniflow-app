'use client';

import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isStrategySafeguardError, type StrategySafeguardError } from '@/lib/pinterest/strategy-errors';
import type { ApiError, ApiErrorIssue } from '@/types/api';

const FIELD_LABEL: Record<string, string> = {
  angle: 'Angle',
  title: 'Title',
  description: 'Description',
  image_prompt: 'Image description',
  sourceSectionId: 'Article section',
};

function issueLocation(issue: ApiErrorIssue): string | null {
  const parts = [
    issue.pinIndex !== undefined ? `Pin ${issue.pinIndex}` : null,
    issue.field ? FIELD_LABEL[issue.field] ?? issue.field : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function problemCount(error: StrategySafeguardError): string {
  return `${error.issueCount} problem${error.issueCount === 1 ? '' : 's'} found`;
}

export interface StrategySafeguardView {
  message: string;
  countLabel: string;
  items: Array<{ code: string; location: string | null; message: string; action: string }>;
  hiddenCount: number;
  /** "Try again" only when the server marked the error retryable and a retry exists. */
  showRetry: boolean;
}

/** What the alert shows — pure, so it is testable without a DOM. */
export function strategySafeguardView(error: StrategySafeguardError, canRetry: boolean): StrategySafeguardView {
  return {
    message: error.message,
    countLabel: problemCount(error),
    items: error.issues.map((issue) => ({
      code: issue.code,
      location: issueLocation(issue),
      message: issue.message,
      action: issue.action,
    })),
    hiddenCount: Math.max(0, error.issueCount - error.issues.length),
    showRetry: error.retryable && canRetry,
  };
}

/**
 * Explains a strategy-safeguard rejection (422 strategy_safeguard_failed):
 * which check failed, on which Pin and field, and what to do.
 */
export function StrategySafeguardAlert({
  error,
  onRetry,
  retrying = false,
}: {
  error: StrategySafeguardError;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const view = strategySafeguardView(error, Boolean(onRetry));
  return (
    <Alert data-testid="strategy-safeguard-error">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="font-medium">{view.message}</p>
          <p className="text-xs" data-testid="strategy-safeguard-count">{view.countLabel}</p>
        </div>
        <ul className="flex flex-col gap-1.5">
          {view.items.map((item, index) => (
            <li key={`${item.code}-${index}`} data-testid="strategy-safeguard-issue" data-code={item.code}>
              {item.location && <span className="font-medium">{item.location}: </span>}
              <span>{item.message}</span>
              <span className="block text-xs opacity-90">{item.action}</span>
            </li>
          ))}
        </ul>
        {view.hiddenCount > 0 && <p className="text-xs">…and {view.hiddenCount} more.</p>}
        {view.showRetry && (
          <div>
            <Button type="button" size="sm" variant="outline" loading={retrying} disabled={retrying} onClick={onRetry}>
              <RefreshCw data-icon="inline-start" />
              Try again
            </Button>
          </div>
        )}
      </div>
    </Alert>
  );
}

/**
 * Toast for an API error: a safeguard rejection gets its first problem and
 * recommended action (plus "Try again" only when retryable); any other error
 * keeps its plain message.
 */
export function toastApiError(error: ApiError | null | undefined, fallback: string, onRetry?: () => void) {
  if (!isStrategySafeguardError(error)) {
    toast.error(error?.message ?? fallback);
    return;
  }
  const [first] = error.issues;
  const more = error.issueCount - 1;
  toast.error(error.message, {
    description: first
      ? `${first.message} ${first.action}${more > 0 ? ` (+${more} more)` : ''}`
      : problemCount(error),
    ...(error.retryable && onRetry ? { action: { label: 'Try again', onClick: onRetry } } : {}),
  });
}
