import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or less')
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export const updateProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or less')
    .nullable()
    .optional()
    .transform((v) => v || null),
  is_default: z.boolean().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
