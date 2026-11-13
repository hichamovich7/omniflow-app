import { handleFacebookScheduleChange } from '@/lib/social/facebook-schedule-route';

/** "Reschedule" (TASK-100): new date / time / time zone for a post still scheduled — never another Page. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleFacebookScheduleChange(request, id, 'reschedule');
}
