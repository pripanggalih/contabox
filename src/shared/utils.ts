/** Misc utilities — pure, no side effects. */

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (RFC4122 v4 from Math.random — only used if Web Crypto unavailable)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function now(): number {
  return Date.now();
}

/**
 * Expand a name pattern with tokens.
 * Supported tokens:
 *   {n}       — sequence number, 1-based
 *   {n:NN}    — zero-padded sequence (e.g. {n:03} → 001)
 *   {date}    — yyyy-mm-dd of generation
 *   {uuid4}   — full uuid v4
 *   {uuid4:8} — first 8 chars of uuid
 *   {random:N}— N random alphanumeric chars
 */
export function expandPattern(pattern: string, index: number): string {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  return pattern.replace(/\{(\w+)(?::([^}]+))?\}/g, (_match, key: string, arg?: string) => {
    switch (key) {
      case 'n':
        return arg ? String(index).padStart(Number(arg), '0') : String(index);
      case 'date':
        return dateStr;
      case 'uuid4': {
        const id = uuid();
        return arg ? id.slice(0, Number(arg)) : id;
      }
      case 'random': {
        const n = arg ? Number(arg) : 5;
        return randomAlnum(n);
      }
      default:
        return _match;
    }
  });
}

export function randomAlnum(len: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) {
    // biome-ignore lint/style/noNonNullAssertion: bounded by len
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function debounce<T extends (...args: never[]) => unknown>(
  fn: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
