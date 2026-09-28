import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { saveNicheSettingsSchema, type NicheSettings } from '@/lib/niche/settings';
import { saveProjectNicheSettings } from '@/lib/queries/niche-settings';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * Saves a project's niche settings (migration 041). Body: `{ settings }`,
 * `settings: null` resets to OmniFlow's recommended values. Writes only
 * `projects.niche_settings`; returns 503 `migration_required` while the
 * column does not exist, so nothing else in the app depends on it.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Unauthorized', code: 'unauthorized' } },
      { status: 401 }
    );
  }

  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid project ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
      { status: 400 }
    );
  }

  const parsed = saveNicheSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { data: project } = await supabase.from('projects').select('id, user_id').eq('id', id).single();

  if (!project) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (project.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this project', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const result = await saveProjectNicheSettings(supabase, user.id, id, parsed.data.settings);

  if (!result.ok) {
    const status = result.code === 'migration_required' ? 503 : result.code === 'not_found' ? 404 : 500;
    return NextResponse.json<ApiResponse<null>>({ data: null, error: { message: result.message, code: result.code } }, { status });
  }

  return NextResponse.json<ApiResponse<{ settings: NicheSettings | null }>>({ data: { settings: result.settings }, error: null });
}
