import { z } from 'zod';

export const addBypassEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
});

export type AddBypassEmailInput = z.infer<typeof addBypassEmailSchema>;
