import { base32Decode, parseOtpauthUri, secondsRemaining, totp } from '@shared/totp';
import { describe, expect, it } from 'vitest';

describe('totp', () => {
  // RFC 6238 test vector: secret = "12345678901234567890" (ASCII) which
  // base32-encodes to "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ".
  const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('decodes base32', () => {
    const bytes = base32Decode(SECRET);
    expect(new TextDecoder().decode(bytes)).toBe('12345678901234567890');
  });

  it('matches RFC 6238 test vectors (8-digit)', async () => {
    const code = await totp(SECRET, { digits: 8, now: 59_000 });
    expect(code).toBe('94287082');
  });

  it('produces 6-digit codes', async () => {
    const code = await totp(SECRET, { now: 59_000 });
    expect(code).toMatch(/^\d{6}$/);
  });

  it('parses otpauth URI', () => {
    const r = parseOtpauthUri(
      `otpauth://totp/Acme:alice?secret=${SECRET}&issuer=Acme&period=30&digits=6`,
    );
    expect(r.secret).toBe(SECRET);
    expect(r.issuer).toBe('Acme');
    expect(r.label).toBe('Acme:alice');
  });

  it('seconds remaining is within window', () => {
    const r = secondsRemaining(30, 0);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(30);
  });
});
