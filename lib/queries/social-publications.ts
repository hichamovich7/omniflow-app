import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLICATION_STALE_LOCK_MS, type SocialPublication } from '@/lib/social/facebook-publication';

/**
 * social_publications (migration 046, TASK-068) — the caller's own session,
 * RLS plus a user_id filter on every query. No secret is stored here.
 *
 * The "claim" functions are conditional UPDATEs: they move a row into a
 * running step only from a state where that step may run, so two clicks or
 * two tabs can never run the same step twice.
 */

export type PublicationPatch = Partial<Omit<SocialPublication, 'id' | 'user_id' | 'project_id' | 'created_at' | 'updated_at'>>;

export type NewPublication = Omit<SocialPublication, 'id' | 'created_at' | 'updated_at'>;

export interface PublicationStore {
  findForGeneration(generationId: string, pageId: string): Promise<SocialPublication | null>;
  /** null + conflict when a row for this content and Page already exists. */
  insert(row: NewPublication): Promise<{ row: SocialPublication | null; conflict: boolean }>;
  /** Post step: from failed / unknown / a stale publishing lock. */
  claimPost(id: string, now: Date, patch: PublicationPatch): Promise<SocialPublication | null>;
  /** Comment step: post published, comment failed / unknown / stale pending. */
  claimComment(id: string, now: Date): Promise<SocialPublication | null>;
  update(id: string, patch: PublicationPatch): Promise<SocialPublication | null>;
}

export function supabasePublicationStore(supabase: SupabaseClient, userId: string): PublicationStore {
  const table = () => supabase.from('social_publications');
  const staleBefore = (now: Date) => new Date(now.getTime() - PUBLICATION_STALE_LOCK_MS).toISOString();

  return {
    async findForGeneration(generationId, pageId) {
      const { data } = await table()
        .select('*')
        .eq('user_id', userId)
        .eq('social_content_generation_id', generationId)
        .eq('external_account_id', pageId)
        .maybeSingle();
      return (data as SocialPublication | null) ?? null;
    },

    async insert(row) {
      const { data, error } = await table().insert(row).select('*').single();
      if (error) {
        const code = (error as { code?: string }).code ?? '';
        if (code !== '23505') console.error(`[facebook] publication insert failed: ${code || 'unknown'}`);
        return { row: null, conflict: code === '23505' };
      }
      return { row: data as SocialPublication, conflict: false };
    },

    async claimPost(id, now, patch) {
      const { data } = await table()
        .update({ ...patch, status: 'publishing', locked_at: now.toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .is('external_post_id', null)
        .or(`status.in.(failed,unknown),and(status.eq.publishing,locked_at.lt.${staleBefore(now)}),and(status.eq.publishing,locked_at.is.null)`)
        .select('*');
      return ((data ?? []) as SocialPublication[])[0] ?? null;
    },

    async claimComment(id, now) {
      const { data } = await table()
        .update({ comment_status: 'pending', locked_at: now.toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('comment_requested', true)
        .not('external_post_id', 'is', null)
        .or(`comment_status.in.(failed,unknown),and(comment_status.eq.pending,locked_at.lt.${staleBefore(now)}),and(comment_status.eq.pending,locked_at.is.null)`)
        .select('*');
      return ((data ?? []) as SocialPublication[])[0] ?? null;
    },

    async update(id, patch) {
      const { data, error } = await table().update(patch).eq('id', id).eq('user_id', userId).select('*').maybeSingle();
      if (error) console.error(`[facebook] publication update failed: ${(error as { code?: string }).code ?? 'unknown'}`);
      return (data as SocialPublication | null) ?? null;
    },
  };
}

export async function getSocialPublication(supabase: SupabaseClient, userId: string, id: string): Promise<SocialPublication | null> {
  const { data } = await supabase.from('social_publications').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  return (data as SocialPublication | null) ?? null;
}

/** Latest publication of each saved content (history list and detail page). Missing table → empty. */
export async function listPublicationsForGenerations(
  supabase: SupabaseClient,
  userId: string,
  generationIds: string[]
): Promise<Record<string, SocialPublication>> {
  if (generationIds.length === 0) return {};
  const { data, error } = await supabase
    .from('social_publications')
    .select('*')
    .eq('user_id', userId)
    .in('social_content_generation_id', generationIds)
    .order('created_at', { ascending: false });
  if (error || !data) return {};
  const byGeneration: Record<string, SocialPublication> = {};
  for (const row of data as SocialPublication[]) {
    if (row.social_content_generation_id && !byGeneration[row.social_content_generation_id]) {
      byGeneration[row.social_content_generation_id] = row;
    }
  }
  return byGeneration;
}
