import { z } from 'zod';

// TASK-091 (migration 047): a board can belong to one Pinterest account of its
// project (null = legacy board), be deactivated, and carry an optional
// external id for a future Pinterest API sync.
const boardAccountFields = {
  pinterestAccountId: z.string().uuid('Invalid Pinterest account ID').nullable().optional(),
  isActive: z.boolean().optional(),
  externalId: z
    .string()
    .max(200, 'External ID must be 200 characters or less')
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    }),
};

export const createBoardSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  ...boardAccountFields,
});

export const updateBoardSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').optional(),
  ...boardAccountFields,
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

/** Column values for the provided board fields only (camelCase input → boards columns). */
export function boardRow(input: UpdateBoardInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.pinterestAccountId !== undefined) row.pinterest_account_id = input.pinterestAccountId;
  if (input.isActive !== undefined) row.is_active = input.isActive;
  if (input.externalId !== undefined) row.external_id = input.externalId;
  return row;
}
