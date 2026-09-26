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
};

export interface ContentStreamBoard {
  content_stream_id: string;
  board_id: string;
  user_id: string;
  created_at: string;
}

export type ContentStreamBoardInsert = Omit<ContentStreamBoard, 'created_at'>;

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
