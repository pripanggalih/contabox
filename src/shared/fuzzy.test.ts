import { fuzzyMatches, fuzzyScore } from '@shared/fuzzy';
import { describe, expect, it } from 'vitest';

describe('fuzzy', () => {
  it('matches subsequences', () => {
    expect(fuzzyMatches('acm', 'acme-prod')).toBe(true);
    expect(fuzzyMatches('aprd', 'acme-prod')).toBe(true);
    expect(fuzzyMatches('xyz', 'acme-prod')).toBe(false);
  });
  it('rewards consecutive characters', () => {
    expect(fuzzyScore('acme', 'acme-prod')).toBeGreaterThan(fuzzyScore('acme', 'a-c-m-e-prod'));
  });
  it('rewards start-of-word', () => {
    expect(fuzzyScore('p', 'acme-prod')).toBeGreaterThan(fuzzyScore('p', 'spotify'));
  });
  it('empty query matches anything', () => {
    expect(fuzzyMatches('', 'acme-prod')).toBe(true);
  });
});
