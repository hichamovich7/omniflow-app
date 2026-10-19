// Pinterest CSV UTM tracking (TASK-070). Pure functions: no network, no
// database, no AI. Applied only while building the CSV — `pins.link_url`
// and every other use of the URL stay untouched.

export const PINTEREST_UTM_SOURCE = 'pinterest';
export const PINTEREST_UTM_MEDIUM = 'organic';

// The three parameters OmniFlow owns. Any earlier value of these is replaced
// so an exported link never carries two `utm_source` (etc.). Other `utm_*`
// parameters (campaign, term…) belong to the user and are kept.
const OMNIFLOW_UTM_KEYS = ['utm_source', 'utm_medium', 'utm_content'] as const;

/** `pin-01`, `pin-02`, … `pin-99`, `pin-100` — from the 1-based CSV position. */
export function pinterestUtmContent(position: number): string {
  return `pin-${String(position).padStart(2, '0')}`;
}

/**
 * Adds `utm_source=pinterest&utm_medium=organic&utm_content=pin-XX` to an
 * absolute http(s) URL. Keeps every other query parameter exactly as written
 * and keeps the `#fragment`. An empty, relative or unparsable URL is returned
 * unchanged — a destination URL is never invented.
 */
export function addPinterestUtm(url: string | null | undefined, position: number): string {
  const raw = url?.trim() ?? '';
  if (!raw) return url ?? '';

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return url ?? '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url ?? '';

  // Filter the raw pairs instead of re-serializing URLSearchParams, so the
  // user's own parameters keep their original encoding byte for byte.
  const kept = parsed.search
    .replace(/^\?/, '')
    .split('&')
    .filter((pair) => {
      if (!pair) return false;
      const rawKey = pair.split('=')[0];
      let key = rawKey;
      try {
        key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      } catch {
        // Malformed escape: not one of ours, keep it as is.
      }
      return !(OMNIFLOW_UTM_KEYS as readonly string[]).includes(key);
    });

  const utm = new URLSearchParams({
    utm_source: PINTEREST_UTM_SOURCE,
    utm_medium: PINTEREST_UTM_MEDIUM,
    utm_content: pinterestUtmContent(position),
  }).toString();

  parsed.search = `?${[...kept, utm].join('&')}`;
  return parsed.toString();
}
