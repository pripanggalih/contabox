/**
 * Dexie schema — IndexedDB persistence for extended container metadata,
 * workspaces, templates, and (later) proxy/fingerprint/snapshot/vault stores.
 *
 * Each `version()` call is append-only. Never edit a previous version's
 * stores definition; always add a new `.version(n+1)` block.
 */
import Dexie, { type Table } from 'dexie';
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
} from './types';

export class ContaboxDB extends Dexie {
  containers!: Table<ContainerExt, string>;
  workspaces!: Table<Workspace, string>;
  templates!: Table<Template, string>;
  proxies!: Table<Proxy, string>;
  proxyPools!: Table<ProxyPool, string>;
  fingerprints!: Table<FingerprintProfile, string>;
  snapshots!: Table<Snapshot, string>;
  rules!: Table<AutoRule, string>;
  vault!: Table<VaultEntry, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super('contabox');

    // v1 — M0 baseline. Containers + workspaces + templates only.
    // Tier 2/3 stores are declared so later code can write without a migration
    // bump; they remain empty until their respective milestones land.
    this.version(1).stores({
      containers: 'cookieStoreId, workspaceId, templateId, order, lastUsedAt',
      workspaces: 'id, order',
      templates: 'id, createdAt',
      proxies: 'id, poolId, lastHealthStatus',
      proxyPools: 'id',
      fingerprints: 'id, source',
      snapshots: 'id, containerId, createdAt',
      rules: 'id, order, enabled, containerId',
      vault: 'id, containerId, origin, kind, scope',
      meta: 'key',
    });
  }
}

let _db: ContaboxDB | null = null;

/** Lazy singleton — avoids opening IndexedDB during module import in tests. */
export function getDb(): ContaboxDB {
  if (!_db) _db = new ContaboxDB();
  return _db;
}

/** Test-only: reset the singleton (used after `fake-indexeddb` resets). */
export function _resetDb(): void {
  _db = null;
}
