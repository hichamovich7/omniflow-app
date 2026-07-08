import { z } from 'zod';

export const createBoardSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
});

export const updateBoardSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').optional(),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
