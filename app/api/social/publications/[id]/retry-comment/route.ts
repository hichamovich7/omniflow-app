import { handleFacebookRetry } from '@/lib/social/facebook-retry-route';

export const maxDuration = 60;

/** "Retry comment" (TASK-068): the first comment only — the post already on the Page is never published again. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleFacebookRetry(request, id, 'comment');
}
