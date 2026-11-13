import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLICATION_STALE_LOCK_MS, type PublicationStatus, type SocialPublication } from '@/lib/social/facebook-publication';

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
  /** Post step: from failed / unknown / cancelled (TASK-100) / a stale publishing lock. */
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
        .or(`status.in.(failed,unknown,cancelled),and(status.eq.publishing,locked_at.lt.${staleBefore(now)}),and(status.eq.publishing,locked_at.is.null)`)
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

/**
 * Scheduling (TASK-100, migration 048). Every write is a conditional UPDATE
 * on the current status and "no Facebook post yet", filtered by the owner:
 * a schedule, a reschedule, a cancel and the cron's claim can never both
 * win on the same row — whichever lands first, the other gets null.
 */
export interface ScheduleStore {
  findForGeneration(generationId: string, pageId: string): Promise<SocialPublication | null>;
  insert(row: NewPublication): Promise<{ row: SocialPublication | null; conflict: boolean }>;
  /** Moves a row with no Facebook post from one of `from` and applies `patch`; null when the row is no longer in `from`. */
  transition(id: string, from: PublicationStatus[], patch: PublicationPatch): Promise<SocialPublication | null>;
  /** Cron: scheduled + due → publishing (locked). Null when cancelled, rescheduled later or claimed by another run. */
  claimScheduled(id: string, now: Date, patch: PublicationPatch): Promise<SocialPublication | null>;
}

export function supabaseScheduleStore(supabase: SupabaseClient, userId: string): ScheduleStore {
  const table = () => supabase.from('social_publications');
  const base = supabasePublicationStore(supabase, userId);
  return {
    findForGeneration: base.findForGeneration,
    insert: base.insert,

    async transition(id, from, patch) {
      const { data, error } = await table()
        .update(patch)
        .eq('id', id)
        .eq('user_id', userId)
        .is('external_post_id', null)
        .in('status', from)
        .select('*');
      if (error) console.error(`[facebook] schedule update failed: ${(error as { code?: string }).code ?? 'unknown'}`);
      return ((data ?? []) as SocialPublication[])[0] ?? null;
    },

    async claimScheduled(id, now, patch) {
      const { data, error } = await table()
        .update({ ...patch, status: 'publishing', locked_at: now.toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'scheduled')
        .is('external_post_id', null)
        .lte('scheduled_at', now.toISOString())
        .select('*');
      if (error) console.error(`[facebook] scheduled claim failed: ${(error as { code?: string }).code ?? 'unknown'}`);
      return ((data ?? []) as SocialPublication[])[0] ?? null;
    },
  };
}

/**
 * Cron only (service-role client): the oldest due scheduled publications,
 * every user. Each row is then handled with stores bound to its own user_id.
 */
export async function listDueScheduledPublications(admin: SupabaseClient, now: Date, limit: number): Promise<SocialPublication[]> {
  const { data, error } = await admin
    .from('social_publications')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error(`[facebook] due scheduled publications could not be read: ${(error as { code?: string }).code ?? 'unknown'}`);
    return [];
  }
  return (data ?? []) as SocialPublication[];
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
