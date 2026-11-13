import { timingSafeEqual } from 'crypto';

/**
 * Cron routes (TASK-100): `Authorization: Bearer <CRON_SECRET>` — the header
 * Vercel Cron sends when CRON_SECRET is set — compared in constant time.
 * No secret, or a secret shorter than 16 characters, refuses every call.
 */
export function isAuthorizedCronRequest(request: Request, secret: string | undefined): boolean {
  const expected = secret?.trim();
  if (!expected || expected.length < 16) return false;
  const given = request.headers.get('authorization') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
