/**
 * Vault — encrypted store for secrets (proxy creds in M4; passwords/TOTP in M7).
 *
 * Design:
 *   - Master password derives an AES-GCM key via PBKDF2 (600k iters, per-install salt).
 *   - The derived key lives in a module-local variable while unlocked.
 *   - Verifier blob: encrypt a known string ("contabox-vault-v1") at unlock time
 *     to validate the password without exposing key material elsewhere.
 *   - Auto-lock: lock() called by inactivity timer (UI side) or on browser close.
 *
 * Never log or expose decrypted plaintext outside the caller's own scope.
 */
import { browser } from '@shared/browser';
import {
  type Encrypted,
  SALT_LEN,
  base64ToBytes,
  bytesToBase64,
  decryptString,
  deriveKey,
  encryptString,
  randomBytes,
} from '@shared/crypto';
import { getDb } from '@shared/db';
import type { VaultEntry, VaultEntryKind } from '@shared/types';
import { now, uuid } from '@shared/utils';

const SALT_KEY = 'vault.salt';
const VERIFIER_KEY = 'vault.verifier';
const VERIFIER_PLAIN = 'contabox-vault-v1';

interface VerifierRecord extends Encrypted {
  /* same shape; alias for clarity */
}

export interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
}

export interface VaultPlainEntry {
  id: string;
  scope: 'global' | 'container';
  containerId?: string;
  origin: string;
  kind: VaultEntryKind;
  label: string;
  secret: string;
  createdAt: number;
  updatedAt: number;
}

export class Vault {
  private key: CryptoKey | null = null;

  async status(): Promise<VaultStatus> {
    const salt = await getDb().meta.get(SALT_KEY);
    return { initialized: !!salt, unlocked: this.key !== null };
  }

  /** Initialize the vault with a fresh master password. */
  async initialize(password: string): Promise<void> {
    if ((await this.status()).initialized) {
      throw new Error('vault already initialized');
    }
    const salt = randomBytes(SALT_LEN);
    const key = await deriveKey(password, salt);
    const verifier = await encryptString(key, VERIFIER_PLAIN);

    await getDb().meta.put({ key: SALT_KEY, value: bytesToBase64(salt) });
    await getDb().meta.put({ key: VERIFIER_KEY, value: verifier });

    this.key = key;
  }

  /** Unlock with master password. Validates against verifier blob. */
  async unlock(password: string): Promise<void> {
    const saltRow = await getDb().meta.get(SALT_KEY);
    const verifierRow = await getDb().meta.get(VERIFIER_KEY);
    if (!saltRow || !verifierRow) {
      throw new Error('vault not initialized');
    }
    const salt = base64ToBytes(saltRow.value as string);
    const verifier = verifierRow.value as VerifierRecord;
    const key = await deriveKey(password, salt);

    const probe = await decryptString(key, verifier).catch(() => null);
    if (probe !== VERIFIER_PLAIN) {
      throw new Error('wrong password');
    }
    this.key = key;
  }

  lock(): void {
    this.key = null;
  }

  isUnlocked(): boolean {
    return this.key !== null;
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new Error('vault locked');
    return this.key;
  }

  async addEntry(input: Omit<VaultPlainEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const key = this.requireKey();
    const enc = await encryptString(key, input.secret);
    const row: VaultEntry = {
      id: uuid(),
      scope: input.scope,
      containerId: input.containerId,
      origin: input.origin,
      kind: input.kind,
      label: input.label,
      cipher: enc.cipher,
      iv: enc.iv,
      createdAt: now(),
      updatedAt: now(),
    };
    await getDb().vault.put(row);
    return row.id;
  }

  async updateEntry(id: string, secret: string): Promise<void> {
    const key = this.requireKey();
    const existing = await getDb().vault.get(id);
    if (!existing) throw new Error('vault entry not found');
    const enc = await encryptString(key, secret);
    await getDb().vault.put({
      ...existing,
      cipher: enc.cipher,
      iv: enc.iv,
      updatedAt: now(),
    });
  }

  async getSecret(id: string): Promise<string> {
    const key = this.requireKey();
    const row = await getDb().vault.get(id);
    if (!row) throw new Error('vault entry not found');
    return decryptString(key, { cipher: row.cipher, iv: row.iv });
  }

  async list(): Promise<Array<Omit<VaultEntry, 'cipher' | 'iv'>>> {
    const all = await getDb().vault.toArray();
    return all.map(({ cipher: _c, iv: _i, ...rest }) => {
      void _c;
      void _i;
      return rest;
    });
  }

  async deleteEntry(id: string): Promise<void> {
    await getDb().vault.delete(id);
  }

  /**
   * Persist a hint about unlock state to `storage.session` so other extension
   * pages can read "vault is unlocked right now" without holding the key.
   * The key itself never leaves the BG memory.
   */
  async syncUnlockedHint(): Promise<void> {
    try {
      await browser.storage.session?.set({ vaultUnlocked: this.isUnlocked() });
    } catch {
      /* session storage unavailable in some Firefox versions */
    }
  }

  /* ---------- auto-lock ---------- */

  private autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  private autoLockMinutes = 15;

  setAutoLockMinutes(min: number): void {
    this.autoLockMinutes = Math.max(0, min);
    this.scheduleAutoLock();
  }

  /**
   * Reset the inactivity countdown. Call after every command/UI interaction
   * known to be initiated by the user.
   */
  scheduleAutoLock(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
    if (!this.isUnlocked() || this.autoLockMinutes <= 0) return;
    this.autoLockTimer = setTimeout(
      () => {
        this.lock();
        void this.syncUnlockedHint();
      },
      this.autoLockMinutes * 60 * 1000,
    );
  }
}

export const vault = new Vault();
