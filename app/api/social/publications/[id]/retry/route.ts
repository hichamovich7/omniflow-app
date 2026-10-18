import { handleFacebookRetry } from '@/lib/social/facebook-retry-route';

export const maxDuration = 60;

/** Retry of the Facebook post step (TASK-068): failed, unknown or interrupted — checked on the Page first, never duplicated. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleFacebookRetry(request, id, 'post');
}
