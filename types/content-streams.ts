export type ContentStreamStatus = 'active' | 'warming' | 'paused' | 'archived';

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
