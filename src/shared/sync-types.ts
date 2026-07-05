/**
 * Sync bundle — the plaintext shape that gets AES-GCM-wrapped and stored on
 * Google Drive. Reuses the same per-table arrays as the backup bundle, plus
 * the vault identity (salt + verifier) so a fresh device can bootstrap.
 *
 * Records carry `updatedAt` (auto-stamped by Dexie hooks) for three-way merge.
 */
import type { Encrypted } from './crypto';
import type {
  AutoRule,
  ContainerExt,
  FingerprintProfile,
  Proxy,
  ProxyPool,
  Snapshot,
  Template,
  VaultEntry,
  Workspace,
} from './types';

export interface SyncBundle {
  containers: ContainerExt[];
  workspaces: Workspace[];
  templates: Template[];
  proxies: Proxy[];
  proxyPools: ProxyPool[];
  fingerprints: FingerprintProfile[];
  rules: AutoRule[];
  vault: VaultEntry[];
  /** Present only when the include-snapshots toggle is on. */
  snapshots?: Snapshot[];
  vaultSalt: string;
  vaultVerifier: Encrypted;
}

export const EMPTY_BUNDLE: SyncBundle = {
  containers: [],
  workspaces: [],
  templates: [],
  proxies: [],
  proxyPools: [],
  fingerprints: [],
  rules: [],
  vault: [],
  vaultSalt: '',
  vaultVerifier: { cipher: '', iv: '' },
};

/** Keys of SyncBundle that are merge-able record arrays keyed by their id. */
export const MERGE_TABLES = [
  'containers',
  'workspaces',
  'templates',
  'proxies',
  'proxyPools',
  'fingerprints',
  'rules',
  'vault',
] as const;
export type MergeTable = (typeof MERGE_TABLES)[number];

/** Primary-key field per merge table (`containers` key on cookieStoreId, rest on id). */
export const ID_FIELD: Record<MergeTable, string> = {
  containers: 'cookieStoreId',
  workspaces: 'id',
  templates: 'id',
  proxies: 'id',
  proxyPools: 'id',
  fingerprints: 'id',
  rules: 'id',
  vault: 'id',
};
