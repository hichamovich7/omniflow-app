import { readPinterestStrategyAngle } from '@/lib/pinterest/strategy';
import type { PinSummary } from '@/lib/ai/prompts/wordpress-from-pins-prompt';
import type { Pin } from '@/types/database';

/**
 * Pins → article (method A) editorial context. Pure helpers, no Supabase and
 * no provider call, so the route and the offline tests share exactly the same
 * mapping from a `pins` row to the PinSummary the prompts receive.
 */

export type PinContextSource = Pick<
  Pin,
  'title' | 'description' | 'keywords' | 'overlay_text' | 'image_analysis' | 'board' | 'board_id' | 'board_section' | 'link_url'
>;

const MAX_STYLE_LIST_ITEMS = 4;

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, MAX_STYLE_LIST_ITEMS)
    .map((item) => item.trim());
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Compact, human-readable summary of `pins.image_analysis` — the JSON text
 * written at Pin generation (reference-image style attributes, TASK-013, plus
 * the Strategy Engine angle). These are style notes, not a description of what
 * the image shows. Null when the column is empty, malformed or carries none of
 * these fields, so the prompt never pretends an analysis exists.
 */
export function summarizePinImageAnalysis(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const analysis = parsed as Record<string, unknown>;

  const parts: string[] = [];
  const mood = readString(analysis.mood);
  if (mood) parts.push(`mood: ${mood}`);
  const lighting = readString(analysis.lightingStyle);
  if (lighting) parts.push(`lighting: ${lighting}`);
  const colors = readStringList(analysis.colorPalette);
  if (colors.length > 0) parts.push(`colors: ${colors.join(', ')}`);
  const materials = readStringList(analysis.materials);
  if (materials.length > 0) parts.push(`materials: ${materials.join(', ')}`);
  const angle = readPinterestStrategyAngle(raw);
  if (angle) parts.push(`editorial angle: ${angle}`);

  return parts.length > 0 ? parts.join('; ') : null;
}

/** Only an absolute http(s) URL is ever forwarded — anything else is dropped, never repaired. */
export function normalizePinLinkUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Maps the selected `pins` rows (already ordered by the caller) to the
 * PinSummary list the outline and article prompts receive.
 * `contentStreamNameByBoardId` comes from content_stream_boards — a Pin whose
 * board is not linked to a live stream simply has no Content Stream.
 */
export function buildPinSummaries(
  pins: PinContextSource[],
  contentStreamNameByBoardId: ReadonlyMap<string, string> = new Map()
): PinSummary[] {
  return pins.map((pin) => ({
    title: pin.title,
    description: pin.description,
    keywords: pin.keywords,
    overlayText: nullIfBlank(pin.overlay_text),
    imageAnalysis: summarizePinImageAnalysis(pin.image_analysis),
    board: nullIfBlank(pin.board),
    boardSection: nullIfBlank(pin.board_section),
    contentStream: pin.board_id ? nullIfBlank(contentStreamNameByBoardId.get(pin.board_id)) : null,
    linkUrl: normalizePinLinkUrl(pin.link_url),
  }));
}

/** Distinct real destination URLs of the selected Pins, in Pin order. */
export function collectPinLinkUrls(pins: PinSummary[]): string[] {
  const urls: string[] = [];
  for (const pin of pins) {
    if (pin.linkUrl && !urls.includes(pin.linkUrl)) urls.push(pin.linkUrl);
  }
  return urls;
}

/**
 * Every URL the pins article may contain besides the automatic verified
 * source: the Pins' own link_url values, then the user's optional External
 * URL — de-duplicated, never rewritten.
 */
export function collectPinsAuthorizedUrls(pins: PinSummary[], manualExternalUrl?: string | null): string[] {
  const urls = collectPinLinkUrls(pins);
  const manual = normalizePinLinkUrl(manualExternalUrl);
  if (manual && !urls.includes(manual)) urls.push(manual);
  return urls;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keeps only the first Markdown link to `url`; any later `[text](url)` link
 * becomes its plain anchor text. The URL itself is never modified and image
 * syntax (`![alt](url)`) is left alone.
 */
export function keepFirstLinkOnly(content: string, url: string): string {
  const pattern = new RegExp(`(!?)\\[([^\\]]*)\\]\\(${escapeRegExp(url)}(?:\\s+"[^"]*")?\\)`, 'g');
  let seen = false;
  return content.replace(pattern, (match: string, bang: string, text: string) => {
    if (bang) return match;
    if (!seen) {
      seen = true;
      return match;
    }
    return text;
  });
}
