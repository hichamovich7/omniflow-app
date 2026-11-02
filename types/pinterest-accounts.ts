/**
 * TASK-091 (migration 047): Project → Pinterest Account → Content Stream →
 * Board → Section → Pin. Accounts, boards and sections are typed in by hand —
 * no Pinterest API connection, and never a password, cookie or token.
 */

export const PINTEREST_ACCOUNT_TYPES = ['business', 'personal'] as const;
export type PinterestAccountType = (typeof PINTEREST_ACCOUNT_TYPES)[number];

export const PINTEREST_ACCOUNT_STATUSES = ['active', 'paused', 'archived'] as const;
export type PinterestAccountStatus = (typeof PINTEREST_ACCOUNT_STATUSES)[number];

export interface PinterestAccount {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  username: string | null;
  profile_url: string | null;
  main_keyword: string | null;
  website_url: string | null;
  language: string | null;
  market: string | null;
  account_type: PinterestAccountType;
  status: PinterestAccountStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PinterestBoardSection {
  id: string;
  board_id: string;
  user_id: string;
  /** Kept exactly as typed. Unique per board, case-insensitively. */
  name: string;
  /** Reserved for a future Pinterest API sync; never required. */
  external_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * One row of content_stream_boards (migration 030, extended by 047): a
 * Pinterest destination of a Content Stream — a board, optionally one of its
 * sections. At most one primary per stream, and a primary is always active.
 */
export interface ContentStreamDestination {
  id: string;
  content_stream_id: string;
  board_id: string;
  section_id: string | null;
  user_id: string;
  is_primary: boolean;
  is_active: boolean;
  /** 1–100: share of the stream's Pins this destination receives. */
  weight: number;
  created_at: string;
  updated_at: string;
}
