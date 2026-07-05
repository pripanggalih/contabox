import type { AutoRule } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { autoRuleEngine } from './auto-rule-engine';

function rule(pattern: string, patternType: AutoRule['patternType']): AutoRule {
  return {
    id: 't',
    pattern,
    patternType,
    containerId: 'c',
    enabled: true,
    order: 0,
    action: 'open-in',
    createdAt: 0,
  };
}

describe('AutoRuleEngine.matchOne — domain', () => {
  it('matches exact host and subdomains on a dotted boundary', () => {
    expect(autoRuleEngine.matchOne(rule('example.com', 'domain'), 'https://example.com/x')).toBe(
      true,
    );
    expect(autoRuleEngine.matchOne(rule('example.com', 'domain'), 'https://app.example.com/')).toBe(
      true,
    );
  });

  it('does NOT match look-alike hosts (the substring bug it replaces)', () => {
    expect(
      autoRuleEngine.matchOne(rule('example.com', 'domain'), 'https://evil-example.com/'),
    ).toBe(false);
    expect(
      autoRuleEngine.matchOne(rule('example.com', 'domain'), 'https://example.com.evil.net/'),
    ).toBe(false);
    expect(
      autoRuleEngine.matchOne(rule('example.com', 'domain'), 'https://x.com/?ref=example.com'),
    ).toBe(false);
  });

  it('substring still matches raw (unchanged behavior)', () => {
    expect(
      autoRuleEngine.matchOne(rule('example.com', 'substring'), 'https://evil-example.com/'),
    ).toBe(true);
  });
});
