import { describe, expect, it } from 'vitest';
import { originMatchKeys, originMatches, parseOrigin } from '../shared/origin';

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
});
