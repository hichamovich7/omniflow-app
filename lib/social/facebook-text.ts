import { containsUrl, stripUrls } from '@/lib/wordpress/article-context/sanitize';

/**
 * URL detection for Facebook text (TASK-068) — stricter than the shared
 * article hygiene: on top of scheme URLs, `www.` hosts and common TLDs, it
 * catches any `host.tld/path` and the country / generic TLDs a blog or shop
 * domain often uses. The only link of a Facebook post is the validated
 * permalink, added by code; anything that looks like a link in the model's
 * text or in a user's edit is removed (model) or refused (edit). Pure,
 * client-safe.
 */
const HOST_WITH_PATH = /\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\/[^\s<>"')\]]*/gi;
const EXTRA_TLD_HOST =
  /\b(?:[a-z0-9-]+\.)+(?:at|ch|nl|it|be|pt|pl|se|no|dk|fi|ie|us|ca|au|eu|me|tv|app|dev|xyz|online|store|test|link|ly|gl|to)\b/gi;

export function containsFacebookUrl(value: string): boolean {
  return containsUrl(value) || new RegExp(HOST_WITH_PATH.source, 'i').test(value) || new RegExp(EXTRA_TLD_HOST.source, 'i').test(value);
}

export function stripFacebookUrls(value: string): string {
  // Scheme / www URLs first (whole), then the extra host forms, then tidy the spacing.
  return stripUrls(stripUrls(value).replace(HOST_WITH_PATH, ' ').replace(EXTRA_TLD_HOST, ' '));
}
