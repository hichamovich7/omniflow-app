import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const hex = process.env.WORDPRESS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('WORDPRESS_ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error('WORDPRESS_ENCRYPTION_KEY must be a 32-byte (64 hex character) key');
  }
  return key;
}

/**
 * Encrypts a secret (e.g. a WordPress Application Password) with AES-256-GCM.
 * Output encoding: base64(iv[12B] || authTag[16B] || ciphertext) — a single
 * self-contained string that fits one text column.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * Decrypts a value produced by encryptSecret(). Throws a generic error on
 * any failure (wrong key, tampered/corrupted ciphertext) — never include the
 * ciphertext or any derived plaintext in the thrown message.
 */
export function decryptSecret(ciphertext: string): string {
  try {
    const key = getKey();
    const raw = Buffer.from(ciphertext, 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('Failed to decrypt stored secret');
  }
}
