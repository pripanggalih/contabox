/**
 * SyncEngine — orchestrates a manual two-way sync of the encrypted bundle to
 * Google Drive. Reuses BackupManager's crypto (PBKDF2/AES-GCM) so the blob on
 * Drive is the same shape as an encrypted backup.
 *
 * Flow per `sync()`:
 *   1. require vault unlocked (caller supplies the master password).
 *   2. collect local bundle; load `sync.base` (common ancestor, or empty).
 *   3. fetch remote meta; if revision unchanged since last sync, skip download
 *      (remote ≡ base). Otherwise download + decrypt + verify the bundle's own
 *      vault verifier against the supplied password (mismatch → reconcile).
 *   4. three-way merge(base, local, remote).
 *   5. write merged survivors back to Dexie (suppressed hooks preserve the
 *      merged `updatedAt` and don't re-dirty).
 *   6. re-wrap + upload the merged bundle; store the new revision + base.
 */
import {
  base64ToBytes,
  bytesToBase64,
  decryptString,
  deriveKey,
  type Encrypted,
  encryptString,
  randomBytes,
  SALT_LEN,
} from '@shared/crypto';
import { clearSyncDirty, getDb, isSyncDirty, setSuppressSyncStamp } from '@shared/db';
import {
  META_SYNC_BASE,
  META_SYNC_FILE_ID,
  META_SYNC_INCLUDE_SNAPSHOTS,
  META_SYNC_LAST_REVISION,
  META_VAULT_SALT,
  META_VAULT_VERIFIER,
} from '@shared/meta-keys';
import { syncBundleSchema } from '@shared/schemas';
import { diffToApply, mergeBundles } from '@shared/sync-merge';
import { EMPTY_BUNDLE, MERGE_TABLES, type SyncBundle } from '@shared/sync-types';
import { now } from '@shared/utils';
import { DriveClient } from './drive-client';
import { vault } from './vault';

// Registered once by the maintainer at Google Cloud Console → OAuth client
// (type "Web application"), redirect URI = browser.identity.getRedirectURL().
// Injected at build time; empty string → the Sync UI shows "not configured".
const OAUTH_CLIENT_ID = (import.meta.env?.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ?? '';

const FILE_NAME = 'contabox-vault.enc';
const VERIFIER_PLAIN = 'contabox-vault-v1';

interface WrappedBlob {
  salt: string;
  payload: Encrypted;
}

export interface SyncStatus {
  connected: boolean;
  unlocked: boolean;
  dirty: boolean;
  includeSnapshots: boolean;
  lastSyncedAt: number | null;
  blobSize: number | null;
}

export class SyncEngine {
  private lastSyncedAt: number | null = null;
  private lastBlobSize: number | null = null;
  constructor(private readonly drive: DriveClient) {}

  private async meta<T>(key: string): Promise<T | undefined> {
    return (await getDb().meta.get(key))?.value as T | undefined;
  }

  async status(): Promise<SyncStatus> {
    return {
      connected: !!(await this.meta<string>(META_SYNC_FILE_ID)),
      unlocked: vault.isUnlocked(),
      dirty: isSyncDirty(),
      includeSnapshots: (await this.meta<boolean>(META_SYNC_INCLUDE_SNAPSHOTS)) ?? false,
      lastSyncedAt: this.lastSyncedAt,
      blobSize: this.lastBlobSize,
    };
  }

  async connect(): Promise<{ connected: true }> {
    const token = await this.drive.authorize();
    const fileId = await this.drive.findOrCreateFile(token, FILE_NAME);
    await getDb().meta.put({ key: META_SYNC_FILE_ID, value: fileId });
    return { connected: true };
  }

  async disconnect(): Promise<void> {
    await getDb().meta.bulkDelete([META_SYNC_FILE_ID, META_SYNC_LAST_REVISION, META_SYNC_BASE]);
  }

  async setIncludeSnapshots(on: boolean): Promise<void> {
    await getDb().meta.put({ key: META_SYNC_INCLUDE_SNAPSHOTS, value: on });
  }

  private async collect(): Promise<SyncBundle> {
    const db = getDb();
    const includeSnapshots = (await this.meta<boolean>(META_SYNC_INCLUDE_SNAPSHOTS)) ?? false;
    const [containers, workspaces, templates, proxies, proxyPools, fingerprints, rules, vaultRows] =
      await Promise.all([
        db.containers.toArray(),
        db.workspaces.toArray(),
        db.templates.toArray(),
        db.proxies.toArray(),
        db.proxyPools.toArray(),
        db.fingerprints.toArray(),
        db.rules.toArray(),
        db.vault.toArray(),
      ]);
    const saltRow = await db.meta.get(META_VAULT_SALT);
    const verRow = await db.meta.get(META_VAULT_VERIFIER);
    return {
      containers,
      workspaces,
      templates,
      proxies,
      proxyPools,
      fingerprints,
      rules,
      vault: vaultRows,
      snapshots: includeSnapshots ? await db.snapshots.toArray() : undefined,
      vaultSalt: (saltRow?.value as string) ?? '',
      vaultVerifier: (verRow?.value as Encrypted) ?? { cipher: '', iv: '' },
    };
  }

  private async wrap(password: string, bundle: SyncBundle): Promise<string> {
    const salt = randomBytes(SALT_LEN);
    const key = await deriveKey(password, salt);
    const payload = await encryptString(key, JSON.stringify(bundle));
    return JSON.stringify({ salt: bytesToBase64(salt), payload } satisfies WrappedBlob);
  }

  /** Decode + decrypt the remote blob. Null when the password can't open it. */
  private async unwrap(password: string, body: string): Promise<SyncBundle | null> {
    let wrapped: WrappedBlob;
    try {
      wrapped = JSON.parse(body) as WrappedBlob;
    } catch {
      return null;
    }
    const key = await deriveKey(password, base64ToBytes(wrapped.salt));
    const plain = await decryptString(key, wrapped.payload).catch(() => null);
    if (plain === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(plain);
    } catch {
      return null;
    }
    const check = syncBundleSchema.safeParse(parsed);
    return check.success ? (check.data as unknown as SyncBundle) : null;
  }

  /** Confirm the supplied password matches the bundle's own vault verifier. */
  private async verifierMatches(password: string, bundle: SyncBundle): Promise<boolean> {
    if (!bundle.vaultSalt || !bundle.vaultVerifier.cipher) return true; // empty/first blob
    const key = await deriveKey(password, base64ToBytes(bundle.vaultSalt));
    const probe = await decryptString(key, bundle.vaultVerifier).catch(() => null);
    return probe === VERIFIER_PLAIN;
  }

  private async applyMerged(
    merged: SyncBundle,
    base: SyncBundle,
    adoptIdentity: boolean,
  ): Promise<void> {
    const db = getDb();
    const deletes = diffToApply(base, merged);
    setSuppressSyncStamp(true);
    try {
      await db.transaction(
        'rw',
        [
          db.containers,
          db.workspaces,
          db.templates,
          db.proxies,
          db.proxyPools,
          db.fingerprints,
          db.rules,
          db.vault,
          db.meta,
        ],
        async () => {
          for (const table of MERGE_TABLES) {
            const rows = merged[table] as unknown as Array<Record<string, unknown>>;
            if (rows.length) {
              await (
                db[table] as unknown as { bulkPut: (r: unknown[]) => Promise<unknown> }
              ).bulkPut(rows);
            }
            const del = deletes[table];
            if (del.length) {
              await (
                db[table] as unknown as { bulkDelete: (k: string[]) => Promise<void> }
              ).bulkDelete(del);
            }
          }
          if (adoptIdentity && merged.vaultSalt) {
            await db.meta.put({ key: META_VAULT_SALT, value: merged.vaultSalt });
            await db.meta.put({ key: META_VAULT_VERIFIER, value: merged.vaultVerifier });
          }
          await db.meta.put({ key: META_SYNC_BASE, value: merged });
        },
      );
    } finally {
      setSuppressSyncStamp(false);
    }
  }

  async sync(password: string): Promise<{ merged: number; conflict?: 'password-mismatch' }> {
    if (!vault.isUnlocked()) throw new Error('vault locked');
    const fileId = await this.meta<string>(META_SYNC_FILE_ID);
    if (!fileId) throw new Error('not connected');

    const token = await this.drive.authorize();
    const base = (await this.meta<SyncBundle>(META_SYNC_BASE)) ?? EMPTY_BUNDLE;
    const local = await this.collect();

    const meta = await this.drive.getMeta(token, fileId);
    const lastRev = await this.meta<string>(META_SYNC_LAST_REVISION);
    let remote: SyncBundle = base;
    let adoptIdentity = false;

    if (meta.headRevisionId && meta.headRevisionId !== lastRev && meta.size > 0) {
      const body = await this.drive.download(token, fileId);
      const decoded = await this.unwrap(password, body);
      if (decoded === null || !(await this.verifierMatches(password, decoded))) {
        return { merged: 0, conflict: 'password-mismatch' };
      }
      remote = decoded;
      // Fresh device with no local vault identity yet → adopt the remote one.
      adoptIdentity = !local.vaultSalt;
    }

    const merged = mergeBundles(base, local, remote);
    await this.applyMerged(merged, base, adoptIdentity);

    const uploaded = await this.wrap(password, merged);
    const { headRevisionId } = await this.drive.upload(token, fileId, uploaded);
    await getDb().meta.put({ key: META_SYNC_LAST_REVISION, value: headRevisionId });
    this.lastSyncedAt = now();
    this.lastBlobSize = uploaded.length;
    clearSyncDirty();

    const count = MERGE_TABLES.reduce((n, t) => n + (merged[t] as unknown[]).length, 0);
    return { merged: count };
  }

  /** Case-3 reconcile after a password mismatch. */
  async resolveConflict(choice: 'use-remote' | 'push-local', password: string): Promise<void> {
    const fileId = await this.meta<string>(META_SYNC_FILE_ID);
    if (!fileId) throw new Error('not connected');
    const token = await this.drive.authorize();

    if (choice === 'push-local') {
      if (!vault.isUnlocked()) throw new Error('vault locked');
      const local = await this.collect();
      const body = await this.wrap(password, local);
      const { headRevisionId } = await this.drive.upload(token, fileId, body);
      await getDb().meta.put({ key: META_SYNC_LAST_REVISION, value: headRevisionId });
      await getDb().meta.put({ key: META_SYNC_BASE, value: local });
      clearSyncDirty();
      return;
    }

    // use-remote: replace local identity + data with the remote bundle.
    const body = await this.drive.download(token, fileId);
    const decoded = await this.unwrap(password, body);
    if (decoded === null) throw new Error('wrong password for the Drive backup');
    await this.applyMerged(decoded, EMPTY_BUNDLE, true);
    vault.lock(); // force re-unlock under the adopted identity
    clearSyncDirty();
  }
}

/** Shared engine instance. Constructed against the build-time OAuth client id;
 *  if the id is empty, `connect()` will fail at the OAuth step (intentional). */
export const syncEngine = new SyncEngine(new DriveClient(OAUTH_CLIENT_ID));
