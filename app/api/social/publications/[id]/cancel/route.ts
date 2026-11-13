import { handleFacebookScheduleChange } from '@/lib/social/facebook-schedule-route';

/** "Cancel schedule" (TASK-100): a cancelled post is never published by the queue. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleFacebookScheduleChange(request, id, 'cancel');
}
