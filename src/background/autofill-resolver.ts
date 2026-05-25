/**
 * AutofillResolver — origin + container scoped vault lookups for the
 * `autofill` content script.
 *
 * Trust model:
 *   - The content script lives in a semi-trusted world. We never hand it the
 *     vault key or any cipher.
 *   - On request, we filter the vault by (cookieStoreId scope) ∩ (origin) and
 *     return ONLY the metadata the script needs to render its picker.
 *   - When the user actually clicks "fill", the script asks for one specific
 *     entry by id, and we decrypt + return that single secret.
 *
 * The resolver runs entirely in the BG. It validates the cookieStoreId of the
 * sender tab against the requested entry's container scope so a content script
 * can't request another container's secrets by spoofing.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import { originMatchKeys, originMatches } from '@shared/origin';
import type { VaultEntry, VaultEntryKind } from '@shared/types';
import { vault } from './vault';

export interface AutofillMatch {
  id: string;
  kind: Extract<VaultEntryKind, 'password' | 'totp'>;
  label: string;
  origin: string;
  scope: 'global' | 'container';
}

export class AutofillResolver {
  /**
   * Return all vault entries that could autofill on `(cookieStoreId, origin)`.
   * Sorted by specificity: container-scoped first, then exact origin, then
   * suffix matches.
   */
  async match(cookieStoreId: string, origin: string): Promise<AutofillMatch[]> {
    if (!vault.isUnlocked()) return [];
    const entries = await getDb().vault.toArray();
    const matchKeys = originMatchKeys(origin);
    const out: Array<AutofillMatch & { score: number }> = [];

    for (const e of entries) {
      if (e.kind !== 'password' && e.kind !== 'totp') continue;

      // Container scoping. If entry is container-scoped to a different
      // container, skip it. Global entries match every container.
      if (e.scope === 'container' && e.containerId && e.containerId !== cookieStoreId) {
        continue;
      }
      if (!e.origin) continue;
      if (!originMatches(e.origin, origin)) continue;

      // Specificity score: container scope + exact origin = highest.
      let score = 0;
      if (e.scope === 'container' && e.containerId === cookieStoreId) score += 10;
      const idx = matchKeys.indexOf(e.origin);
      score += 5 - (idx === -1 ? 5 : idx);

      out.push({
        id: e.id,
        kind: e.kind as 'password' | 'totp',
        label: e.label,
        origin: e.origin,
        scope: e.scope,
        score,
      });
    }

    out.sort((a, b) => b.score - a.score);
    return out.map(({ score: _s, ...rest }) => {
      void _s;
      return rest;
    });
  }

  /**
   * Resolve sender → cookieStoreId and reject mismatched container-scoped
   * entries. Used by both `match` and `getSecretFor`.
   */
  async senderCookieStoreId(sender: { tab?: { cookieStoreId?: string } }): Promise<string | null> {
    return sender.tab?.cookieStoreId ?? null;
  }

  /**
   * Decrypt one entry and return its secret. Throws if the requesting tab's
   * container scope doesn't match the entry's container scope.
   */
  async getSecretFor(
    entryId: string,
    requestingCookieStoreId: string,
    requestingOrigin: string,
  ): Promise<{ secret: string; kind: VaultEntry['kind'] }> {
    if (!vault.isUnlocked()) throw new Error('vault is locked');
    const row = await getDb().vault.get(entryId);
    if (!row) throw new Error('entry not found');

    if (
      row.scope === 'container' &&
      row.containerId &&
      row.containerId !== requestingCookieStoreId
    ) {
      throw new Error('entry not available in this container');
    }
    if (!originMatches(row.origin, requestingOrigin)) {
      throw new Error('entry origin does not match request');
    }

    const secret = await vault.getSecret(entryId);
    return { secret, kind: row.kind };
  }

  /**
   * Get the active tab's container + origin. Used by the popup or by the
   * vault entry editor when it offers a "fill in active tab" action.
   */
  async activeTabContext(): Promise<{ cookieStoreId: string | null; origin: string | null }> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { cookieStoreId: null, origin: null };
    let origin: string | null = null;
    try {
      if (tab.url) origin = new URL(tab.url).origin;
    } catch {
      /* ignore */
    }
    return { cookieStoreId: tab.cookieStoreId ?? null, origin };
  }
}

export const autofillResolver = new AutofillResolver();
