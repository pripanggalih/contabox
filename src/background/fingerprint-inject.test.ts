import { describe, expect, it } from 'vitest';
import { findInsertionOffset, injectCspNonce } from './fingerprint-engine';

const enc = (s: string) => new TextEncoder().encode(s);

describe('findInsertionOffset', () => {
  it('inserts right after <head>', () => {
    const html = '<!doctype html><html><head><title>x</title></head>';
    const off = findInsertionOffset(enc(html));
    expect(html.slice(off, off + 7)).toBe('<title>');
  });

  it('falls back to after <html> when no head', () => {
    const html = '<!doctype html><html><body>hi</body></html>';
    const off = findInsertionOffset(enc(html));
    expect(html.slice(off, off + 6)).toBe('<body>');
  });

  it('waits (-1) for <head> to close even if <html> is already complete', () => {
    // We prefer injecting inside <head>, so hold until its '>' arrives.
    expect(findInsertionOffset(enc('<!doctype html><html><head'))).toBe(-1);
  });

  it('is case-insensitive', () => {
    const html = '<!DOCTYPE HTML><HTML><HEAD>';
    expect(findInsertionOffset(enc(html))).toBe(html.length);
  });
});

describe('injectCspNonce', () => {
  it('appends the nonce to an existing script-src', () => {
    const out = injectCspNonce("default-src 'self'; script-src 'self'", 'abc');
    expect(out).toContain("script-src 'self' 'nonce-abc'");
  });

  it('prefers script-src-elem when present', () => {
    const out = injectCspNonce("script-src 'self'; script-src-elem 'self'", 'abc');
    expect(out).toContain("script-src-elem 'self' 'nonce-abc'");
    expect(out).not.toContain("script-src 'self' 'nonce-abc'");
  });

  it('replaces a lone none rather than appending (which would be ignored)', () => {
    const out = injectCspNonce("script-src 'none'", 'abc');
    expect(out).toBe("script-src 'nonce-abc'");
  });

  it('derives script-src from default-src when no script directive exists', () => {
    const out = injectCspNonce("default-src 'self' https:", 'abc');
    expect(out).toContain("script-src 'self' https: 'nonce-abc'");
    // default-src is left intact.
    expect(out).toContain("default-src 'self' https:");
  });

  it('leaves policies that do not govern scripts untouched', () => {
    const out = injectCspNonce("img-src 'self'", 'abc');
    expect(out).toBe("img-src 'self'");
  });
});
