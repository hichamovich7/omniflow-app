import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { facebookPageCategorySchema } from '@/lib/validations/facebook';
import { setFacebookPageCategoryMapping } from '@/lib/queries/facebook-page-mappings';
import { jsonError } from '@/lib/social/facebook-server';
import type { FacebookPageCategoryMapping } from '@/lib/social/facebook-pages';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * "WordPress category → Facebook Page" of a project (TASK-102, migration
 * 053). Body `{ categoryId, pageId }`; `pageId: null` removes the
 * suggestion. The project, the category and the connected Page must all
 * belong to the caller and to this project. Only a suggestion for the Page
 * selector: an existing publication or schedule is never changed by it.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');

  const { id } = await params;
  if (!isValidUuid(id)) return jsonError(400, 'invalid_id', 'Invalid project ID');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Invalid JSON body');
  }
  const parsed = facebookPageCategorySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);

  const result = await setFacebookPageCategoryMapping(supabase, user.id, { projectId: id, ...parsed.data });
  if (!result.ok) return jsonError(result.status, result.code, result.message);
  return NextResponse.json<ApiResponse<{ mapping: FacebookPageCategoryMapping | null }>>({ data: { mapping: result.mapping }, error: null });
}
