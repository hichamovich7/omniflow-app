import { handleGenerateImageVariants } from '@/lib/social/facebook-image-variants-route';

// Up to 3 image calls run in parallel (TASK-101).
export const maxDuration = 180;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleGenerateImageVariants(request, id);
}
