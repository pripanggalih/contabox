/**
 * Crypto helpers — PBKDF2 (key derivation) + AES-GCM (encryption).
 *
 * Use only Web Crypto. Never bring in a third-party crypto library.
 *
 * Output formats:
 *   - All ciphertext / IV / salt blobs are base64-encoded for easy storage.
 *   - 12-byte IV per record (AES-GCM standard); generated fresh every encrypt.
 *   - 16-byte salt (one per install, stored in `meta`).
 *   - 600,000 PBKDF2 iterations (OWASP 2023 baseline).
 */

export const PBKDF2_ITERATIONS = 600_000;
export const SALT_LEN = 16;
export const IV_LEN = 12;
export const KEY_LEN = 256;

/* ---------- base64 ---------- */

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s);
}

export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- random ---------- */

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/* ---------- KDF ---------- */

export async function importPasswordKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(password);
  return crypto.subtle.importKey('raw', enc as BufferSource, { name: 'PBKDF2' }, false, [
    'deriveKey',
    'deriveBits',
  ]);
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordKey = await importPasswordKey(password);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: KEY_LEN },
    false,
    ['encrypt', 'decrypt'],
  );
}

/* ---------- encrypt / decrypt ---------- */

export interface Encrypted {
  cipher: string;
  iv: string;
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<Encrypted> {
  const iv = randomBytes(IV_LEN);
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as BufferSource,
  );
  return { cipher: bytesToBase64(new Uint8Array(buf)), iv: bytesToBase64(iv) };
}

export async function decryptString(key: CryptoKey, payload: Encrypted): Promise<string> {
  const cipher = base64ToBytes(payload.cipher);
  const iv = base64ToBytes(payload.iv);
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipher as BufferSource,
  );
  return new TextDecoder().decode(buf);
}
