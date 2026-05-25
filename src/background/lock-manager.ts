/**
 * LockManager — runtime gate for locked containers.
 *
 * Locked semantics:
 *   - `ContainerExt.isLocked = true` is the persistent "this container should
 *     ask for credentials before opening" flag.
 *   - Whether the user has *currently* satisfied the unlock challenge for this
 *     session is held in-memory (`unlockedThisSession`). Cleared on browser
 *     restart, on `vault.lock`, or on manual relock.
 *
 * Side effects on lock state changes:
 *   - When a container becomes locked: hide all its open tabs (`tabs.hide`)
 *     so cookies/auth state aren't visible until unlock.
 *   - When unlocked: `tabs.show` to bring them back.
 *
 * Auth options (in order of precedence per container):
 *   1. PIN (per-container; PBKDF2-hashed at rest)
 *   2. Master vault password (when initialized + unlocked)
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import { type HashedPin, hashPin, verifyPin } from '@shared/pin';
import type { ContainerExt } from '@shared/types';
import { vault } from './vault';

export class LockManager {
  /**
   * cookieStoreIds the user has unlocked in this BG session. NEVER persisted.
   * Cleared on `relock`, `relockAll`, or vault lock.
   */
  private unlockedThisSession = new Set<string>();

  /** Tabs we previously hid because their container locked. Tracked so we can
   * accurately re-show only the ones we hid (vs. user-hidden tabs). */
  private hiddenTabs = new Set<number>();

  /** True if the container is locked AND not unlocked-in-session. */
  isEffectivelyLocked(ext: ContainerExt | undefined | null): boolean {
    if (!ext?.isLocked) return false;
    return !this.unlockedThisSession.has(ext.cookieStoreId);
  }

  /**
   * Throw if `cookieStoreId` is currently gated. Use at every code path that
   * opens tabs / hands out the container's cookies/storage.
   */
  async assertOpenAllowed(cookieStoreId: string): Promise<void> {
    const ext = await getDb().containers.get(cookieStoreId);
    if (this.isEffectivelyLocked(ext)) {
      throw new Error('container is locked — unlock from the sidebar before opening');
    }
  }

  /** Set / change PIN. Pass `null` to remove the PIN (keep `isLocked` flag). */
  async setPin(cookieStoreId: string, pin: string | null): Promise<void> {
    const existing = await getDb().containers.get(cookieStoreId);
    if (!existing) throw new Error('container not found');

    if (pin === null) {
      await getDb().containers.update(cookieStoreId, {
        lockPinHash: undefined,
        lockPinSalt: undefined,
      });
      return;
    }
    if (!/^\d{4,12}$/.test(pin)) {
      throw new Error('PIN must be 4–12 digits');
    }
    const hashed = await hashPin(pin);
    await getDb().containers.update(cookieStoreId, {
      lockPinHash: hashed.hash,
      lockPinSalt: hashed.salt,
    });
  }

  /**
   * Try to unlock with a credential. Order:
   *   - If container has PIN: only PIN accepted (don't fall back to master pw
   *     so users can scope sensitive containers tighter than the global vault).
   *   - Else: vault must be unlocked AND the supplied password must verify.
   *   - Else: no credential set → unlock succeeds (lock-flag-only mode).
   */
  async unlock(
    cookieStoreId: string,
    credential: { pin?: string; masterPassword?: string },
  ): Promise<void> {
    const ext = await getDb().containers.get(cookieStoreId);
    if (!ext) throw new Error('container not found');
    if (!ext.isLocked) {
      this.unlockedThisSession.add(cookieStoreId);
      return;
    }

    const hasPin = !!ext.lockPinHash && !!ext.lockPinSalt;
    if (hasPin) {
      if (!credential.pin) throw new Error('PIN required');
      const stored: HashedPin = {
        // biome-ignore lint/style/noNonNullAssertion: hasPin guard
        hash: ext.lockPinHash!,
        // biome-ignore lint/style/noNonNullAssertion: hasPin guard
        salt: ext.lockPinSalt!,
      };
      const ok = await verifyPin(credential.pin, stored);
      if (!ok) throw new Error('wrong PIN');
    } else {
      // Master-password gate. Vault must be initialized & unlocked.
      const status = await vault.status();
      if (!status.initialized) {
        // No PIN, no vault — accept open as a degraded mode. Strongly nudge
        // the user to set up one or the other in the UI.
        this.unlockedThisSession.add(cookieStoreId);
        await this.showHiddenTabs(cookieStoreId);
        return;
      }
      if (!status.unlocked) throw new Error('vault is locked');
    }

    this.unlockedThisSession.add(cookieStoreId);
    await this.showHiddenTabs(cookieStoreId);
  }

  /** Drop session-unlock for one container (e.g. user clicked "Lock now"). */
  async relock(cookieStoreId: string): Promise<void> {
    this.unlockedThisSession.delete(cookieStoreId);
    await this.hideTabsFor(cookieStoreId);
  }

  /** Drop session-unlock for every container. Called on vault.lock. */
  async relockAll(): Promise<void> {
    const ids = Array.from(this.unlockedThisSession);
    this.unlockedThisSession.clear();
    for (const id of ids) {
      await this.hideTabsFor(id);
    }
  }

  /**
   * Apply lock side-effects after `container.setLocked` flipped the flag.
   * - true  → hide tabs immediately (and drop session unlock if any).
   * - false → show tabs we previously hid for this container.
   */
  async applyLockState(cookieStoreId: string, locked: boolean): Promise<void> {
    if (locked) {
      this.unlockedThisSession.delete(cookieStoreId);
      await this.hideTabsFor(cookieStoreId);
    } else {
      await this.showHiddenTabs(cookieStoreId);
    }
  }

  /** True if a container's cookieStoreId has been unlocked this session. */
  isUnlockedInSession(cookieStoreId: string): boolean {
    return this.unlockedThisSession.has(cookieStoreId);
  }

  /* ---------- internals ---------- */

  private async hideTabsFor(cookieStoreId: string): Promise<void> {
    try {
      const tabs = await browser.tabs.query({ cookieStoreId });
      const ids = tabs.map((t) => t.id).filter((n): n is number => typeof n === 'number');
      if (ids.length === 0) return;
      const hide = (browser.tabs as { hide?: (ids: number[]) => Promise<number[]> }).hide;
      if (!hide) return; // tabHide permission not granted or API absent
      const hidden = await hide(ids).catch((err) => {
        console.warn('[contabox] tabs.hide failed', err);
        return [] as number[];
      });
      for (const id of hidden) this.hiddenTabs.add(id);
    } catch (err) {
      console.warn('[contabox] hideTabsFor failed', err);
    }
  }

  private async showHiddenTabs(cookieStoreId: string): Promise<void> {
    try {
      const tabs = await browser.tabs.query({ cookieStoreId });
      const ids = tabs
        .map((t) => t.id)
        .filter((n): n is number => typeof n === 'number')
        .filter((n) => this.hiddenTabs.has(n));
      if (ids.length === 0) return;
      const show = (browser.tabs as { show?: (ids: number[]) => Promise<void> }).show;
      if (!show) return;
      await show(ids).catch((err) => console.warn('[contabox] tabs.show failed', err));
      for (const id of ids) this.hiddenTabs.delete(id);
    } catch (err) {
      console.warn('[contabox] showHiddenTabs failed', err);
    }
  }
}

export const lockManager = new LockManager();
