import {
  base64ToBytes,
  bytesToBase64,
  decryptString,
  deriveKey,
  encryptString,
  randomBytes,
  SALT_LEN,
} from '@shared/crypto';
import { describe, expect, it } from 'vitest';

describe('crypto', () => {
  it('base64 round-trips', () => {
    const b = randomBytes(32);
    const back = base64ToBytes(bytesToBase64(b));
    expect(back).toEqual(b);
  });

  it('encrypts and decrypts', async () => {
    const salt = randomBytes(SALT_LEN);
    const key = await deriveKey('correct horse battery staple', salt);
    const enc = await encryptString(key, 'hello vault');
    const back = await decryptString(key, enc);
    expect(back).toBe('hello vault');
  });

  it('wrong password fails', async () => {
    const salt = randomBytes(SALT_LEN);
    const key1 = await deriveKey('right', salt);
    const key2 = await deriveKey('wrong', salt);
    const enc = await encryptString(key1, 'secret');
    await expect(decryptString(key2, enc)).rejects.toThrow();
  });
});
