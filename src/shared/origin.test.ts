import { describe, expect, it } from 'vitest';
import { originMatches, originMatchKeys, parseOrigin } from '../shared/origin';

describe('parseOrigin', () => {
  it('accepts bare URLs', () => {
    expect(parseOrigin('https://example.com')?.hostname).toBe('example.com');
  });
  it('accepts hostname-only input by upgrading to https', () => {
    expect(parseOrigin('example.com')?.hostname).toBe('example.com');
  });
  it('returns null for garbage', () => {
    expect(parseOrigin(' ')).toBeNull();
    expect(parseOrigin('://oops')).toBeNull();
  });
});

describe('originMatches', () => {
  it('exact host match passes', () => {
    expect(originMatches('https://github.com', 'https://github.com/foo')).toBe(true);
  });
  it('subdomain matches parent on dotted boundary', () => {
    expect(originMatches('https://github.com', 'https://gist.github.com')).toBe(true);
  });
  it('different hosts do not match', () => {
    expect(originMatches('https://github.com', 'https://evilgithub.com')).toBe(false);
  });
  it('cross-protocol does not match', () => {
    expect(originMatches('https://github.com', 'http://github.com')).toBe(false);
  });
  it('a bare public suffix never broad-matches its subdomains', () => {
    // alice.github.io and bob.github.io are unrelated sites.
    expect(originMatches('https://github.io', 'https://alice.github.io')).toBe(false);
    expect(originMatches('https://co.uk', 'https://bank.co.uk')).toBe(false);
  });
  it('exact subdomain under a public suffix still matches itself', () => {
    expect(originMatches('https://alice.github.io', 'https://alice.github.io/x')).toBe(true);
    expect(originMatches('https://alice.github.io', 'https://bob.github.io')).toBe(false);
  });
  it('IP host requires exact match including port', () => {
    expect(originMatches('http://127.0.0.1:8080', 'http://127.0.0.1:8080/x')).toBe(true);
    expect(originMatches('http://127.0.0.1:8080', 'http://127.0.0.1:9090')).toBe(false);
  });
});

describe('originMatchKeys', () => {
  it('returns most → least specific', () => {
    expect(originMatchKeys('https://gist.github.com/x')).toEqual([
      'https://gist.github.com',
      'https://github.com',
    ]);
  });
  it('single-level host returns one key', () => {
    expect(originMatchKeys('https://github.com')).toEqual(['https://github.com']);
  });
  it('IPs only return themselves', () => {
    expect(originMatchKeys('http://127.0.0.1:8080')).toEqual(['http://127.0.0.1:8080']);
  });
  it('does not emit a bare public suffix as a broad key', () => {
    // Registrable domain under github.io is the 3-label host, not "github.io".
    expect(originMatchKeys('https://alice.github.io')).toEqual(['https://alice.github.io']);
    // A deeper host narrows to the registrable domain, never the suffix.
    expect(originMatchKeys('https://x.alice.github.io')).toEqual([
      'https://x.alice.github.io',
      'https://alice.github.io',
    ]);
  });
});
