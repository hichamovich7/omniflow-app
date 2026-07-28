import { z } from 'zod';

const siteUrlField = z.string().trim().url('Enter a valid URL, e.g. https://example.com');
const wpUsernameField = z.string().trim().min(1, 'WP Username is required').max(200);
const applicationPasswordField = z.string().min(1, 'Application Password is required').max(500);

export const testConnectionSchema = z.object({
  siteUrl: siteUrlField,
  wpUsername: wpUsernameField,
  applicationPassword: applicationPasswordField,
});

export const createWordPressSiteSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  siteUrl: siteUrlField,
  wpUsername: wpUsernameField,
  applicationPassword: applicationPasswordField,
});

// Full replace only — WordPress auth validity is a property of the whole
// (siteUrl, wpUsername, applicationPassword) triple, and the credential
// triple is always re-tested server-side before any write, so a partial
// update would let a client change the URL/username without re-validating
// the resulting combination.
export const updateWordPressSiteSchema = z.object({
  siteUrl: siteUrlField,
  wpUsername: wpUsernameField,
  applicationPassword: applicationPasswordField,
});

export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
export type CreateWordPressSiteInput = z.infer<typeof createWordPressSiteSchema>;
export type UpdateWordPressSiteInput = z.infer<typeof updateWordPressSiteSchema>;
