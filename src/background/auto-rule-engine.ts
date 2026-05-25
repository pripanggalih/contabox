/**
 * AutoRuleEngine — URL → container routing.
 *
 * Listens to `webRequest.onBeforeRequest` for top-level navigations. When a
 * URL matches a rule whose target container differs from the request's
 * `cookieStoreId`, we cancel the request and reopen the URL in the target
 * container. (`browser.tabs.create` keyed by `cookieStoreId`.)
 *
 * Rule patterns: substring, glob (`*` wildcard), or regex (`/pattern/flags`).
 * First-match wins by `order`; user-controlled in the rule editor.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import type { AutoRule } from '@shared/types';
import { now, uuid } from '@shared/utils';

export class AutoRuleEngine {
  private rules: AutoRule[] = [];
  private attached = false;

  async attach(): Promise<void> {
    if (this.attached) return;
    await this.refresh();
    const wr = (browser as { webRequest?: typeof browser.webRequest }).webRequest;
    if (!wr?.onBeforeRequest) return;

    wr.onBeforeRequest.addListener(
      this.handle as never,
      { urls: ['<all_urls>'], types: ['main_frame'] as never },
      ['blocking'] as never,
    );
    this.attached = true;
  }

  async refresh(): Promise<void> {
    const all = await getDb().rules.toArray();
    this.rules = all.filter((r) => r.enabled).sort((a, b) => a.order - b.order);
  }

  private handle = (details: {
    url: string;
    cookieStoreId?: string;
    tabId?: number;
  }): { cancel?: boolean } => {
    if (!details.url) return {};
    const match = this.match(details.url);
    if (!match) return {};
    if (details.cookieStoreId === match.containerId) return {};

    // Open in target container, kill original request.
    void this.reopen(details.url, match.containerId, details.tabId);
    return { cancel: true };
  };

  private async reopen(url: string, cookieStoreId: string, originalTabId?: number): Promise<void> {
    try {
      await browser.tabs.create({ cookieStoreId, url });
      if (originalTabId && originalTabId > 0) {
        try {
          await browser.tabs.remove(originalTabId);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.warn('[contabox] auto-rule reopen failed', err);
    }
  }

  /** First matching rule wins. */
  match(url: string): AutoRule | null {
    for (const r of this.rules) {
      if (this.matchOne(r, url)) return r;
    }
    return null;
  }

  /** Public for the rule editor's "live test" pane. */
  matchOne(rule: AutoRule, url: string): boolean {
    switch (rule.patternType) {
      case 'substring':
        return url.includes(rule.pattern);
      case 'glob':
        return globToRegex(rule.pattern).test(url);
      case 'regex':
        try {
          return new RegExp(rule.pattern).test(url);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /* ---- CRUD ---- */

  list(): Promise<AutoRule[]> {
    return getDb().rules.orderBy('order').toArray();
  }

  async create(input: Omit<AutoRule, 'id' | 'createdAt' | 'order'>): Promise<AutoRule> {
    const last = await getDb().rules.orderBy('order').last();
    const row: AutoRule = {
      ...input,
      id: uuid(),
      order: (last?.order ?? -1) + 1,
      createdAt: now(),
    };
    await getDb().rules.put(row);
    await this.refresh();
    return row;
  }

  async update(id: string, patch: Partial<AutoRule>): Promise<AutoRule> {
    const existing = await getDb().rules.get(id);
    if (!existing) throw new Error('rule not found');
    const next = { ...existing, ...patch, id: existing.id };
    await getDb().rules.put(next);
    await this.refresh();
    return next;
  }

  async delete(id: string): Promise<{ id: string }> {
    await getDb().rules.delete(id);
    await this.refresh();
    return { id };
  }
}

/** Translate a glob pattern (`*` and `?`) into an anchored RegExp. */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

export const autoRuleEngine = new AutoRuleEngine();
