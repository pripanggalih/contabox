import { expandPattern } from '@shared/utils';
import { describe, expect, it } from 'vitest';

describe('expandPattern', () => {
  it('replaces {n}', () => {
    expect(expandPattern('acme-{n}', 7)).toBe('acme-7');
  });
  it('zero-pads {n:NN}', () => {
    expect(expandPattern('acme-{n:03}', 7)).toBe('acme-007');
    expect(expandPattern('acme-{n:04}', 42)).toBe('acme-0042');
  });
  it('supports {date}', () => {
    expect(expandPattern('{date}-x', 1)).toMatch(/^\d{4}-\d{2}-\d{2}-x$/);
  });
  it('supports {uuid4:8}', () => {
    expect(expandPattern('id-{uuid4:8}', 1)).toMatch(/^id-[0-9a-f]{8}$/);
  });
  it('passes unknown tokens through', () => {
    expect(expandPattern('hello-{unknown}', 1)).toBe('hello-{unknown}');
  });
});
