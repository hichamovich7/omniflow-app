import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialContentGeneration, SocialContentGenerationInsert } from '@/lib/social/social-content';
import type { SocialContentListItem } from '@/lib/queries/social-content';
import type { RequestReservation } from '@/lib/social/facebook-derived-posts';

/**
 * Facebook drafts of one article and creation of a draft from an image
 * (TASK-101 extension / TASK-103, migration 051). The caller's own session:
 * every query filters on `user_id` on top of RLS.
 */

const MISSING_CODES = new Set(['PGRST205', '42P01', 'PGRST204', '42703']);

function code(error: unknown): string {
  return (error as { code?: string } | null)?.code ?? '';
}

type ArticleColumns = Pick<
  SocialContentGeneration,
  'id' | 'source_wordpress_generation_id' | 'source_wordpress_site_id' | 'source_wordpress_article_id' | 'source_pinterest_generation_id'
>;

/** The caller's Facebook drafts of the same article (newest first) — the draft itself when its source is gone. */
export async function listArticleFacebookPosts(supabase: SupabaseClient, userId: string, draft: ArticleColumns, limit = 50): Promise<SocialContentListItem[]> {
  let query = supabase.from('social_content_generations').select('*, projects(name)').eq('user_id', userId).eq('platform', 'facebook');
  if (draft.source_wordpress_generation_id) query = query.eq('source_wordpress_generation_id', draft.source_wordpress_generation_id);
  else if (draft.source_wordpress_site_id && draft.source_wordpress_article_id) {
    query = query.eq('source_wordpress_site_id', draft.source_wordpress_site_id).eq('source_wordpress_article_id', draft.source_wordpress_article_id);
  } else if (draft.source_pinterest_generation_id) query = query.eq('source_pinterest_generation_id', draft.source_pinterest_generation_id);
  else query = query.eq('id', draft.id);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []) as SocialContentListItem[];
}

export async function findDraftByRequestId(supabase: SupabaseClient, userId: string, requestId: string): Promise<SocialContentGeneration | null> {
  const { data } = await supabase
    .from('social_content_generations')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'facebook')
    .eq('creation_request_id', requestId)
    .maybeSingle();
  return (data as SocialContentGeneration | null) ?? null;
}

export async function insertDerivedDraft(
  supabase: SupabaseClient,
  row: SocialContentGenerationInsert
): Promise<{ row: SocialContentGeneration | null; reason?: 'conflict' | 'migration_required' | 'error' }> {
  const { data, error } = await supabase.from('social_content_generations').insert(row).select('*').single();
  if (!error && data) return { row: data as SocialContentGeneration };
  const errorCode = code(error);
  // Codes only — never the content.
  console.error(`[facebook] derived post save failed: ${errorCode || 'no row returned'}`);
  if (errorCode === '23505') return { row: null, reason: 'conflict' };
  return { row: null, reason: MISSING_CODES.has(errorCode) ? 'migration_required' : 'error' };
}

/**
 * social_draft_creation_requests (migration 052) — atomic reservation of a
 * "Create new post with this image" request id, before the quota and any AI
 * call. INSERT on the PRIMARY KEY (user_id, request_id) is the lock: only
 * one caller gets `reserved`. A `pending` row is never taken over (stale →
 * `expired`): its AI call may still be running or already billed. Only a
 * `failed` row (released before anything was consumed) is taken over, by
 * ONE conditional UPDATE (re-checked under the row lock, so two takeovers
 * cannot both succeed).
 */
export function supabaseDraftRequestStore(supabase: SupabaseClient, userId: string, staleMs: number) {
  return {
    async reserve(requestId: string, parentId: string, variantId: string | null, now: Date = new Date()): Promise<RequestReservation> {
      const { error } = await supabase
        .from('social_draft_creation_requests')
        .insert({ user_id: userId, request_id: requestId, parent_generation_id: parentId, variant_id: variantId, status: 'pending' });
      if (!error) return { status: 'reserved' };
      const errorCode = code(error);
      if (MISSING_CODES.has(errorCode)) return { status: 'migration_required' };
      if (errorCode !== '23505') {
        console.error(`[facebook] draft request reservation failed: ${errorCode || 'unknown'}`);
        return { status: 'in_progress' }; // fail closed: never generate without a reservation
      }

      const { data } = await supabase
        .from('social_draft_creation_requests')
        .select('parent_generation_id, status, updated_at')
        .eq('user_id', userId)
        .eq('request_id', requestId)
        .maybeSingle();
      const row = data as { parent_generation_id: string; status: 'pending' | 'completed' | 'failed'; updated_at: string } | null;
      if (!row) return { status: 'in_progress' };
      if (row.parent_generation_id !== parentId) return { status: 'other_parent' };
      if (row.status === 'completed') return { status: 'completed' };
      if (row.status === 'pending') {
        return now.getTime() - new Date(row.updated_at).getTime() > staleMs ? { status: 'expired' } : { status: 'in_progress' };
      }

      const { data: taken } = await supabase
        .from('social_draft_creation_requests')
        .update({ status: 'pending', updated_at: now.toISOString() })
        .eq('user_id', userId)
        .eq('request_id', requestId)
        .eq('parent_generation_id', parentId)
        .eq('status', 'failed')
        .select('request_id');
      return (taken ?? []).length === 1 ? { status: 'reserved' } : { status: 'in_progress' };
    },
    async complete(requestId: string, generationId: string): Promise<void> {
      const { error } = await supabase
        .from('social_draft_creation_requests')
        .update({ status: 'completed', generation_id: generationId, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('request_id', requestId);
      if (error) console.error(`[facebook] draft request completion failed: ${code(error) || 'unknown'}`);
    },
    async fail(requestId: string): Promise<void> {
      const { error } = await supabase
        .from('social_draft_creation_requests')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('request_id', requestId)
        .eq('status', 'pending');
      if (error) console.error(`[facebook] draft request release failed: ${code(error) || 'unknown'}`);
    },
  };
}
