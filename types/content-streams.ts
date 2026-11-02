/**
 * `planned` = prepared for later, not started yet (migration 036). Never
 * counted as active, never recommended — unrelated to a Pin's planned
 * publish_date.
 */
export type ContentStreamStatus = 'active' | 'planned' | 'warming' | 'paused' | 'archived';

export interface ContentStream {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  wordpress_category_id: string | null;
  target_pins_per_day: number | null;
  target_articles_per_week: number | null;
  target_buffer_days: number | null;
  status: ContentStreamStatus;
  /** Migration 047 — null = legacy stream, not linked to a Pinterest account yet. Absent before 047. */
  pinterest_account_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentStreamInsert = Omit<
  ContentStream,
  'id' | 'wordpress_category_id' | 'target_pins_per_day' | 'target_articles_per_week' | 'target_buffer_days' | 'status' | 'created_at' | 'updated_at'
> & {
  id?: string;
  wordpress_category_id?: string | null;
  target_pins_per_day?: number | null;
  target_articles_per_week?: number | null;
  target_buffer_days?: number | null;
  status?: ContentStreamStatus;
  pinterest_account_id?: string | null;
};

/**
 * content_stream_boards row. Migration 047 added `id`, `section_id`,
 * `is_primary`, `is_active`, `weight`, `updated_at` (see
 * ContentStreamDestination in types/pinterest-accounts.ts); they are optional
 * here so readers written before 047 keep compiling unchanged.
 */
export interface ContentStreamBoard {
  id?: string;
  content_stream_id: string;
  board_id: string;
  section_id?: string | null;
  user_id: string;
  is_primary?: boolean;
  is_active?: boolean;
  weight?: number;
  created_at: string;
  updated_at?: string;
}

export type ContentStreamBoardInsert = Omit<ContentStreamBoard, 'id' | 'created_at' | 'updated_at'>;

/** manual = typed in by the user; external = reported from another publishing tool. */
export type PublishingActivitySource = 'manual' | 'external';

/**
 * published = confirmed as live outside OmniFlow (today or earlier);
 * expected  = planned in another tool for that day, not confirmed yet
 * (migration 038). Only `published` rows are ever counted as published.
 */
export type PublishingActivityStatus = 'published' | 'expected';

/**
 * Pins published outside OmniFlow for one stream on one local day
 * (migration 035). Never linked to `pins` rows and never a Pinterest stat.
 */
export interface StreamPublishingActivity {
  id: string;
  user_id: string;
  content_stream_id: string;
  /** Local YYYY-MM-DD. */
  activity_date: string;
  published_count: number;
  note: string | null;
  source: PublishingActivitySource;
  status: PublishingActivityStatus;
  created_at: string;
  updated_at: string;
}
