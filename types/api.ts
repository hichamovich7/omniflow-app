/**
 * One problem found in an AI response (strategy safeguards — see
 * lib/pinterest/strategy-errors.ts). User-facing text only: never a prompt,
 * a secret or raw model output.
 */
export interface ApiErrorIssue {
  code: string;
  /** 1-based Pin number in the batch; absent for a batch-wide problem. */
  pinIndex?: number;
  /** 1-based number of the other Pin of a pair (duplicates). */
  relatedPinIndex?: number;
  field?: string;
  message: string;
  action: string;
}

export interface ApiError {
  message: string;
  code: string;
  /** Present on structured errors: true only when trying again can succeed. */
  retryable?: boolean;
  issues?: ApiErrorIssue[];
  /** Total problems found (issues may be capped). */
  issueCount?: number;
}

export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };
