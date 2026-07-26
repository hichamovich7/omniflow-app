import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '@/types/pinterest';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z
    .string()
    .trim()
    .max(10000, 'Description must be 10,000 characters or less')
    .nullable()
    .optional()
    .transform((v) => v || null),
  niche: z
    .string()
    .trim()
    .max(100, 'Niche must be 100 characters or less')
    .nullable()
    .optional()
    .transform((v) => v || null),
  default_language: z.enum(SUPPORTED_LANGUAGES, { message: 'Invalid language' }).nullable().optional(),
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
    .max(10000, 'Description must be 10,000 characters or less')
    .nullable()
    .optional()
    .transform((v) => v || null),
  niche: z
    .string()
    .trim()
    .max(100, 'Niche must be 100 characters or less')
    .nullable()
    .optional()
    .transform((v) => v || null),
  default_language: z.enum(SUPPORTED_LANGUAGES, { message: 'Invalid language' }).nullable().optional(),
  is_default: z.boolean().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
