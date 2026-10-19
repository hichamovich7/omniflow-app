import { z } from 'zod';

/**
 * Pin Destination URL (TASK-071): the clean link stored in `pins.link_url`.
 * Client-safe (no server import). It is set by the user (form, history) or
 * taken from the verified permalink of an existing WordPress post — never
 * built from a title or a slug, never sent to the AI, never stored with UTM
 * parameters (those are added to the CSV only, see lib/analytics/utm.ts).
 */

export const DESTINATION_URL_MAX_LENGTH = 2048;

export const INVALID_DESTINATION_URL_MESSAGE =
  'Enter a full destination URL starting with http:// or https:// (e.g. https://example.com/article/).';
export const DESTINATION_URL_TOO_LONG_MESSAGE = 'The destination URL is too long.';

export const NO_PERMALINK_PIN_WARNING =
  'No public link was found for this WordPress post (not published yet, or its link could not be verified). The Pins were saved without a destination URL — add one from the generation page.';

/** An absolute http(s) URL with a host and no credentials or spaces. */
export function isHttpDestinationUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (!url.hostname || url.username || url.password) return false;
  return true;
}

const destinationUrlString = z
  .string()
  .trim()
  .max(DESTINATION_URL_MAX_LENGTH, DESTINATION_URL_TOO_LONG_MESSAGE);

/** Optional field of the generation form: blank → undefined, otherwise a valid http(s) URL kept as typed (trimmed). */
export const optionalDestinationUrlSchema = destinationUrlString
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || isHttpDestinationUrl(value), {
    message: INVALID_DESTINATION_URL_MESSAGE,
  });

/** Edit from the history: blank or null removes the link (null). */
export const nullableDestinationUrlSchema = z
  .union([z.null(), destinationUrlString])
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isHttpDestinationUrl(value), {
    message: INVALID_DESTINATION_URL_MESSAGE,
  });

/** Client-side check of a destination URL field — same rule as the API. */
export function validateDestinationUrl(
  value: string
): { ok: true; value: string | null } | { ok: false; message: string } {
  const parsed = nullableDestinationUrlSchema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: parsed.error.issues[0].message };
}

export type PinDestinationSource = 'manual' | 'wordpress_permalink' | null;

/**
 * The `pins.link_url` of a new generation: the URL the user typed, else the
 * verified permalink of the existing WordPress post the Pins come from, else
 * none. Only an existing-post source without a usable permalink warns.
 */
export function resolvePinDestination(input: {
  manualUrl?: string | null;
  source?: { sourceType: 'omniflow_article' | 'external_wordpress_post'; permalink?: string | null } | null;
}): { linkUrl: string | null; source: PinDestinationSource; warning: string | null } {
  if (input.manualUrl) return { linkUrl: input.manualUrl, source: 'manual', warning: null };
  if (input.source?.sourceType === 'external_wordpress_post') {
    const permalink = input.source.permalink && isHttpDestinationUrl(input.source.permalink) ? input.source.permalink : null;
    return permalink
      ? { linkUrl: permalink, source: 'wordpress_permalink', warning: null }
      : { linkUrl: null, source: null, warning: NO_PERMALINK_PIN_WARNING };
  }
  return { linkUrl: null, source: null, warning: null };
}
