/**
 * BackupManager — full-data export / import with optional master-password
 * encryption.
 *
 * Scope:
 *   - Container metadata (ContainerExt rows)
 *   - Workspaces, templates
 *   - Proxies, proxy pools
 *   - Fingerprint profiles
 *   - Snapshots (cookies, storage, IDB dumps)
 *   - Auto-rules
 *   - Vault entries (already encrypted at rest; passed through verbatim)
 *   - Meta rows (lock keys EXCLUDED — see safety notes)
 *
 * Two output formats:
 *   - **Plain JSON** (`encrypted: false`) — quick backup. Vault entries are
 *     still individually encrypted under the user's master password, but
 *     containers/snapshots/etc. land in plaintext. Suitable for personal
 *     storage on a trusted disk.
 *   - **Encrypted JSON** (`encrypted: true`) — wraps the entire bundle inside
 *     an AES-GCM ciphertext keyed off the user's master vault password.
 *     Suitable for sending across an untrusted channel (cloud drive etc.).
 *
 * Safety:
 *   - The session-unlock cache (`lock.session` meta key) is NEVER exported.
 *     It would re-grant access without the user re-authenticating after
 *     restore.
 *   - The vault salt + verifier ARE exported so a fresh install can decrypt
 *     the entries with the same master password.
 *   - Re-importing replaces all rows wholesale. The user is warned.
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
import { getDb } from '@shared/db';
import { META_LOCK_SESSION, META_VAULT_SALT, META_VAULT_VERIFIER } from '@shared/meta-keys';
import { backupBundleSchema, backupDataSchemaExport } from '@shared/schemas';
import type {
  AutoRule,
  ContainerExt,
  FingerprintProfile,
  MetaRecord,
  Proxy,
  ProxyPool,
  Snapshot,
  Template,
  VaultEntry,
  Workspace,
} from '@shared/types';
import { now } from '@shared/utils';
import { vault } from './vault';

const BACKUP_VERSION = 1;

interface BackupBundleData {
  containers: ContainerExt[];
  workspaces: Workspace[];
  templates: Template[];
  proxies: Proxy[];
  proxyPools: ProxyPool[];
  fingerprints: FingerprintProfile[];
  snapshots: Snapshot[];
  rules: AutoRule[];
  vault: VaultEntry[];
  meta: MetaRecord[];
}

export type BackupBundle =
  | (BackupBundleData & {
      version: typeof BACKUP_VERSION;
      exportedAt: number;
      encrypted: false;
    })
  | {
      version: typeof BACKUP_VERSION;
      exportedAt: number;
      encrypted: true;
      /** PBKDF2 salt for the bundle-wrap key (independent of vault salt). */
      salt: string;
      /** AES-GCM payload of `JSON.stringify(BackupBundleData)`. */
      payload: Encrypted;
    };

export class BackupManager {
  /**
   * Build the unencrypted snapshot of every Dexie table. Strips the
   * session-unlock meta row (transient). Vault rows are passed through
   * verbatim (they're already encrypted at rest).
   */
  private async collect(): Promise<BackupBundleData> {
    const db = getDb();
    const [
      containers,
      workspaces,
      templates,
      proxies,
      proxyPools,
      fingerprints,
      snapshots,
      rules,
      vaultEntries,
      meta,
    ] = await Promise.all([
      db.containers.toArray(),
      db.workspaces.toArray(),
      db.templates.toArray(),
      db.proxies.toArray(),
      db.proxyPools.toArray(),
      db.fingerprints.toArray(),
      db.snapshots.toArray(),
      db.rules.toArray(),
      db.vault.toArray(),
      db.meta.toArray(),
    ]);

    return {
      containers,
      workspaces,
      templates,
      proxies,
      proxyPools,
      fingerprints,
      snapshots,
      rules,
      vault: vaultEntries,
      meta: meta.filter((m) => m.key !== META_LOCK_SESSION),
    };
  }

  /** Export everything as a plain JSON bundle. */
  async exportPlain(): Promise<BackupBundle> {
    const data = await this.collect();
    return {
      version: BACKUP_VERSION,
      exportedAt: now(),
      encrypted: false,
      ...data,
    };
  }

  /**
   * Export everything wrapped in AES-GCM. The wrap key is derived from the
   * user's master password via PBKDF2 with a fresh salt; the salt ships
   * inside the bundle so the importer can re-derive without the live vault
   * being unlocked.
   *
   * Throws if the vault isn't initialized — we need a master password to
   * derive against. (We could prompt the user for a separate backup password,
   * but doubling password surface usually backfires.)
   */
  async exportEncrypted(password: string): Promise<BackupBundle> {
    if (password.length < 8) throw new Error('master password must be ≥ 8 characters');

    // Validate the supplied password against the live verifier so we don't
    // produce a bundle nobody can open.
    const verifierRow = await getDb().meta.get(META_VAULT_VERIFIER);
    const saltRow = await getDb().meta.get(META_VAULT_SALT);
    if (!verifierRow || !saltRow) {
      throw new Error('vault not initialized — initialize it first to use encrypted backup');
    }
    const liveSalt = base64ToBytes(saltRow.value as string);
    const liveKey = await deriveKey(password, liveSalt);
    const probe = await decryptString(liveKey, verifierRow.value as Encrypted).catch(() => null);
    if (probe !== 'contabox-vault-v1') throw new Error('wrong master password');

    const data = await this.collect();
    const wrapSalt = randomBytes(SALT_LEN);
    const wrapKey = await deriveKey(password, wrapSalt);
    const payload = await encryptString(wrapKey, JSON.stringify(data));

    return {
      version: BACKUP_VERSION,
      exportedAt: now(),
      encrypted: true,
      salt: bytesToBase64(wrapSalt),
      payload,
    };
  }

  /**
   * Restore a previously-exported bundle. Replaces ALL data in the matching
   * tables. The session-unlock cache is cleared on import; the user must
   * re-unlock the vault and any locked containers afterwards.
   *
   * @param bundle  parsed JSON, either plain or encrypted
   * @param password used only when bundle.encrypted === true
   */
  async import(bundle: unknown, password?: string): Promise<{ restored: number }> {
    // Validate the untrusted bundle shape BEFORE wiping and repopulating every
    // table. A malformed/hostile bundle must not be able to write garbage rows
    // (which would break reads or brick the vault via a bad `vault.salt` meta).
    const parsed = backupBundleSchema.safeParse(bundle);
    if (!parsed.success) throw new Error('invalid backup bundle');
    const outer = parsed.data;
    if (outer.version !== BACKUP_VERSION) {
      throw new Error(`unsupported backup version: ${outer.version}`);
    }

    let data: BackupBundleData;
    if (outer.encrypted) {
      if (!password) throw new Error('password required for encrypted backup');
      const salt = base64ToBytes(outer.salt);
      const key = await deriveKey(password, salt);
      const plaintext = await decryptString(key, outer.payload).catch(() => null);
      if (plaintext === null) throw new Error('wrong password for this backup');
      let inner: unknown;
      try {
        inner = JSON.parse(plaintext);
      } catch {
        throw new Error('backup payload is not valid JSON');
      }
      const innerParsed = backupDataSchemaExport.safeParse(inner);
      if (!innerParsed.success) throw new Error('backup payload failed validation');
      data = innerParsed.data as unknown as BackupBundleData;
    } else {
      data = outer as unknown as BackupBundleData;
    }

    // Drop session-unlock if present (defensive — collect() already strips it).
    const cleanedMeta = data.meta.filter((m) => m.key !== META_LOCK_SESSION);

    const db = getDb();
    let restored = 0;
    await db.transaction(
      'rw',
      [
        db.containers,
        db.workspaces,
        db.templates,
        db.proxies,
        db.proxyPools,
        db.fingerprints,
        db.snapshots,
        db.rules,
        db.vault,
        db.meta,
      ],
      async () => {
        await db.containers.clear();
        await db.workspaces.clear();
        await db.templates.clear();
        await db.proxies.clear();
        await db.proxyPools.clear();
        await db.fingerprints.clear();
        await db.snapshots.clear();
        await db.rules.clear();
        await db.vault.clear();
        await db.meta.clear();

        if (data.containers.length) await db.containers.bulkPut(data.containers);
        if (data.workspaces.length) await db.workspaces.bulkPut(data.workspaces);
        if (data.templates.length) await db.templates.bulkPut(data.templates);
        if (data.proxies.length) await db.proxies.bulkPut(data.proxies);
        if (data.proxyPools.length) await db.proxyPools.bulkPut(data.proxyPools);
        if (data.fingerprints.length) await db.fingerprints.bulkPut(data.fingerprints);
        if (data.snapshots.length) await db.snapshots.bulkPut(data.snapshots);
        if (data.rules.length) await db.rules.bulkPut(data.rules);
        if (data.vault.length) await db.vault.bulkPut(data.vault);
        if (cleanedMeta.length) await db.meta.bulkPut(cleanedMeta);

        restored =
          data.containers.length +
          data.workspaces.length +
          data.templates.length +
          data.proxies.length +
          data.proxyPools.length +
          data.fingerprints.length +
          data.snapshots.length +
          data.rules.length +
          data.vault.length +
          cleanedMeta.length;
      },
    );

    // Force vault to lock so the user re-authenticates with the freshly
    // restored salt+verifier. Without this, the in-memory key from before
    // the import would happily decrypt entries — surprising behavior.
    vault.lock();

    return { restored };
  }
}

export const backupManager = new BackupManager();
