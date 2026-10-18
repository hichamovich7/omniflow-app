import { decryptSecret, encryptSecret } from '@/lib/wordpress/crypto';

/**
 * Social access tokens (TASK-068) use their own key, SOCIAL_TOKEN_ENCRYPTION_KEY
 * (32 bytes, hex) — never the WordPress key, never a hard-coded value. A
 * missing or malformed key throws; the error message never contains the
 * token or the ciphertext.
 */
export const SOCIAL_TOKEN_KEY_ENV = 'SOCIAL_TOKEN_ENCRYPTION_KEY';

export function encryptSocialToken(token: string): string {
  return encryptSecret(token, SOCIAL_TOKEN_KEY_ENV);
}

export function decryptSocialToken(ciphertext: string): string {
  return decryptSecret(ciphertext, SOCIAL_TOKEN_KEY_ENV);
}
