/**
 * PIN hashing for per-container locks.
 *
 * PINs are typically 4–8 digits, so a fast hash like SHA-256 is brute-forcable
 * in seconds. We layer PBKDF2 (100k iterations, separate salt per container)
 * so a stolen IDB row still costs the attacker meaningful CPU per guess.
 *
 * Lower iteration count than the master vault password (600k) because:
 *   - PIN unlock happens on every container open; UX matters.
 *   - PIN entropy is intrinsically low — extra KDF rounds don't change the
 *     attacker's worst case much past ~100k.
 */
import { base64ToBytes, bytesToBase64, importPasswordKey, randomBytes } from './crypto';

const PIN_ITERATIONS = 100_000;
const PIN_SALT_LEN = 16;
const PIN_HASH_LEN = 32; // bytes

export interface HashedPin {
  hash: string; // base64
  salt: string; // base64
}

async function deriveBits(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await importPasswordKey(pin);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PIN_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    PIN_HASH_LEN * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<HashedPin> {
  const salt = randomBytes(PIN_SALT_LEN);
  const hash = await deriveBits(pin, salt);
  return { hash: bytesToBase64(hash), salt: bytesToBase64(salt) };
}

export async function verifyPin(pin: string, stored: HashedPin): Promise<boolean> {
  try {
    const salt = base64ToBytes(stored.salt);
    const candidate = await deriveBits(pin, salt);
    const expected = base64ToBytes(stored.hash);
    return constantTimeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
