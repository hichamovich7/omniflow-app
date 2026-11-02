import { z } from 'zod';
import { PINTEREST_ACCOUNT_STATUSES, PINTEREST_ACCOUNT_TYPES } from '@/types/pinterest-accounts';
import { BOARD_SECTION_FORBIDDEN_CHARS } from '@/lib/validations/pinterest';

/** Trimmed optional text: '' / whitespace → null (cleared), absent → undefined (unchanged). */
function optionalText(max: number, label: string) {
  return z
    .string()
    .max(max, `${label} must be ${max} characters or less`)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    });
}

function optionalUrl(label: string) {
  return optionalText(500, label).refine(
    (value) => value == null || z.string().url().safeParse(value).success,
    { message: `${label} must be a valid URL` }
  );
}

const accountName = z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less');

const accountFields = {
  username: optionalText(100, 'Username'),
  profileUrl: optionalUrl('Profile URL'),
  mainKeyword: optionalText(200, 'Main keyword'),
  websiteUrl: optionalUrl('Website URL'),
  language: optionalText(40, 'Language'),
  market: optionalText(60, 'Market'),
  notes: optionalText(2000, 'Notes'),
};

export const pinterestAccountTypeSchema = z.enum(PINTEREST_ACCOUNT_TYPES);
export const pinterestAccountStatusSchema = z.enum(PINTEREST_ACCOUNT_STATUSES);

export const createPinterestAccountSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: accountName,
  ...accountFields,
  accountType: pinterestAccountTypeSchema.default('business'),
  status: pinterestAccountStatusSchema.default('active'),
});

export const updatePinterestAccountSchema = z.object({
  name: accountName.optional(),
  ...accountFields,
  accountType: pinterestAccountTypeSchema.optional(),
  status: pinterestAccountStatusSchema.optional(),
});

// Same name rule as pins.board_section (migration 032): no "/" (Pinterest's
// Board/Section separator in the CSV), "\" or line break. Kept exactly as
// typed apart from the surrounding spaces.
const sectionName = z
  .string()
  .trim()
  .min(1, 'Section name is required')
  .max(100, 'Section name must be 100 characters or less')
  .refine((value) => !BOARD_SECTION_FORBIDDEN_CHARS.test(value), {
    message: 'Section name cannot contain "/", "\\", or line breaks.',
  });

export const createBoardSectionSchema = z.object({
  boardId: z.string().uuid('Invalid board ID'),
  name: sectionName,
  externalId: optionalText(200, 'External ID'),
});

export const updateBoardSectionSchema = z.object({
  name: sectionName.optional(),
  externalId: optionalText(200, 'External ID'),
  isActive: z.boolean().optional(),
});

export type CreatePinterestAccountInput = z.infer<typeof createPinterestAccountSchema>;
export type UpdatePinterestAccountInput = z.infer<typeof updatePinterestAccountSchema>;
export type CreateBoardSectionInput = z.infer<typeof createBoardSectionSchema>;
export type UpdateBoardSectionInput = z.infer<typeof updateBoardSectionSchema>;

/** Row values for an account insert / update (only the provided fields). */
export function pinterestAccountRow(input: Partial<CreatePinterestAccountInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.username !== undefined) row.username = input.username;
  if (input.profileUrl !== undefined) row.profile_url = input.profileUrl;
  if (input.mainKeyword !== undefined) row.main_keyword = input.mainKeyword;
  if (input.websiteUrl !== undefined) row.website_url = input.websiteUrl;
  if (input.language !== undefined) row.language = input.language;
  if (input.market !== undefined) row.market = input.market;
  if (input.notes !== undefined) row.notes = input.notes;
  if (input.accountType !== undefined) row.account_type = input.accountType;
  if (input.status !== undefined) row.status = input.status;
  return row;
}
