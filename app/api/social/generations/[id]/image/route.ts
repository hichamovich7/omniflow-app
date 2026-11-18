import { handleSelectImage } from '@/lib/social/facebook-image-variants-route';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleSelectImage(request, id);
}
