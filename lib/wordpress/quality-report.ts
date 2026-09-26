import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArticleQualityReport } from '@/lib/wordpress/quality-check';

/**
 * Persistence of the Quality Gate V1 report (TASK-FIX-046) on
 * wordpress_generations.quality_report (jsonb, migration 037). The report
 * itself is computed by runArticleQualityCheck() (quality-check.ts).
 */

const qualityStatusSchema = z.enum(['passed', 'warning', 'failed']);

export const articleQualityReportSchema = z.object({
  status: qualityStatusSchema,
  qualityIssues: z.array(z.string()),
  warnings: z.array(z.string()),
  checks: z.array(
    z.object({
      key: z.string().min(1),
      status: qualityStatusSchema,
      message: z.string(),
    })
  ),
});

/**
 * Reads a stored quality_report value. Anything that is not a valid report
 * (null for articles generated before the Quality Gate, or a malformed row)
 * becomes null, so the review page never renders untrusted JSON.
 */
export function parseQualityReport(value: unknown): ArticleQualityReport | null {
  const parsed = articleQualityReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Best-effort write, separate from the status update on purpose: if the
 * column is missing (migration 037 not applied yet) or the write fails, the
 * generation stays "completed" and only the report is lost — logged, never thrown.
 */
export async function saveQualityReport(
  supabase: SupabaseClient,
  generationId: string,
  report: ArticleQualityReport,
  logTag: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('wordpress_generations')
      .update({ quality_report: report })
      .eq('id', generationId);
    if (error) console.warn(`[${logTag}] quality report not saved:`, error.message);
  } catch (err) {
    console.warn(`[${logTag}] quality report not saved:`, err instanceof Error ? err.message : err);
  }
}
