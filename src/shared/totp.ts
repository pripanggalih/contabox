/**
 * TOTP — RFC 6238 time-based one-time password generator.
 *
 * Uses Web Crypto's HMAC-SHA1. Standard parameters: 30s step, 6 digits.
 * Accepts base32-encoded secrets (the format used by `otpauth://` URIs).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(secret: string): Uint8Array {
  const cleaned = secret.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of cleaned) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export interface TotpOptions {
  digits?: number;
  period?: number;
  algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-512';
  /** Override "now" for tests. */
  now?: number;
}

export async function totp(secret: string, opts: TotpOptions = {}): Promise<string> {
  const digits = opts.digits ?? 6;
  const period = opts.period ?? 30;
  const algorithm = opts.algorithm ?? 'SHA-1';
  const t = Math.floor((opts.now ?? Date.now()) / 1000 / period);

  const counter = new ArrayBuffer(8);
  const view = new DataView(counter);
  view.setBigUint64(0, BigInt(t));

  const keyBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));

  const offset = (sig[sig.length - 1] ?? 0) & 0x0f;
  const code =
    (((sig[offset] ?? 0) & 0x7f) << 24) |
    (((sig[offset + 1] ?? 0) & 0xff) << 16) |
    (((sig[offset + 2] ?? 0) & 0xff) << 8) |
    ((sig[offset + 3] ?? 0) & 0xff);

  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, '0');
}

/** Seconds remaining in the current TOTP window. */
export function secondsRemaining(period = 30, now = Date.now()): number {
  return period - (Math.floor(now / 1000) % period);
}

/**
 * Parse `otpauth://totp/Issuer:label?secret=BASE32&issuer=Issuer&period=30&digits=6`.
 */
export function parseOtpauthUri(uri: string): {
  label: string;
  issuer: string | null;
  secret: string;
  period: number;
  digits: number;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
} {
  const url = new URL(uri);
  if (url.protocol !== 'otpauth:') throw new Error('not an otpauth URI');
  if (url.host !== 'totp') throw new Error('only TOTP supported');

  const params = url.searchParams;
  const secret = params.get('secret');
  if (!secret) throw new Error('missing secret');

  const labelRaw = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const issuer = params.get('issuer');
  return {
    label: labelRaw,
    issuer,
    secret,
    period: Number(params.get('period') ?? 30),
    digits: Number(params.get('digits') ?? 6),
    algorithm: (params.get('algorithm') ?? 'SHA-1').toUpperCase() as
      | 'SHA-1'
      | 'SHA-256'
      | 'SHA-512',
  };
}
