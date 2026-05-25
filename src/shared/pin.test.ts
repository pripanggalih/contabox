import { describe, expect, it } from 'vitest';
import { hashPin, verifyPin } from '../shared/pin';

describe('pin', () => {
  it('verifies correct PIN', async () => {
    const stored = await hashPin('123456');
    expect(await verifyPin('123456', stored)).toBe(true);
  });
  it('rejects wrong PIN', async () => {
    const stored = await hashPin('123456');
    expect(await verifyPin('123457', stored)).toBe(false);
  });
  it('produces different hashes per call (salted)', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a.hash).not.toBe(b.hash);
    expect(a.salt).not.toBe(b.salt);
  });
  it('returns false on malformed stored hash', async () => {
    expect(await verifyPin('1234', { hash: 'not-base64???', salt: 'also-bad' })).toBe(false);
  });
});
