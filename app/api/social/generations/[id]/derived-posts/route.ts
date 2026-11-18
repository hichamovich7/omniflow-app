import { handleCreateDerivedPost } from '@/lib/social/facebook-derived-posts-route';

// Up to two text generations (one corrective retry) plus WordPress GETs — same as "Generate Facebook post".
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleCreateDerivedPost(request, id);
}
