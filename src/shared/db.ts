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
import { now } from './utils';

/** Tables carrying an `updatedAt` clock, folded newest-wins by a merge import. */
export const SYNCED_TABLES = [
  'containers',
  'workspaces',
  'templates',
  'proxies',
  'proxyPools',
  'fingerprints',
  'rules',
  'vault',
] as const;

let _suppress = false;
/**
 * Raised by the merge importer while it writes folded rows, so applying a merge
 * keeps each row's own `updatedAt` instead of re-stamping it to now().
 */
export function setSuppressSyncStamp(on: boolean): void {
  _suppress = on;
}

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

    // v2 — M7. Adds container PIN, proxy failure counters, snapshot IDB opt-in.
    // Schema is additive (no field removals) so a v1→v2 upgrade is
    // non-destructive; Dexie auto-handles missing columns as undefined on read.
    // NOTE: the `autoSnapshot`/`disabled` boolean indexes declared here are
    // dead — IndexedDB cannot index boolean values, so `.where(...)` over them
    // matches nothing. They are dropped in v3. Never query these; scan instead.
    this.version(2)
      .stores({
        containers: 'cookieStoreId, workspaceId, templateId, order, lastUsedAt, autoSnapshot',
        proxies: 'id, poolId, lastHealthStatus, disabled',
      })
      .upgrade(async (tx) => {
        // Backfill new fields on existing rows so reads see defined values.
        await tx
          .table<{ autoSnapshot?: boolean; snapshotIncludeIdb?: boolean }>('containers')
          .toCollection()
          .modify((c) => {
            c.autoSnapshot ??= false;
            c.snapshotIncludeIdb ??= false;
          });
        await tx
          .table<{ disabled?: boolean; consecutiveFails?: number }>('proxies')
          .toCollection()
          .modify((p) => {
            p.disabled ??= false;
            p.consecutiveFails ??= 0;
          });
      });

    // v3 — drop the non-functional boolean indexes (`containers.autoSnapshot`,
    // `proxies.disabled`, `rules.enabled`). Removing a secondary index touches
    // no row data; the columns themselves are retained. Forward-only + additive
    // in spirit: nothing a user stored is lost.
    this.version(3).stores({
      containers: 'cookieStoreId, workspaceId, templateId, order, lastUsedAt',
      proxies: 'id, poolId, lastHealthStatus',
      rules: 'id, order, containerId',
    });

    // v4 — Drive sync. Adds `updatedAt` to synced tables (backfill = createdAt).
    // Additive: no columns removed, no keyPath renamed. `updatedAt` is not
    // indexed (the merge scans in memory), so the `stores()` lines are
    // unchanged; only the upgrade backfill runs.
    this.version(4).upgrade(async (tx) => {
      for (const name of [
        'containers',
        'workspaces',
        'templates',
        'proxies',
        'proxyPools',
        'fingerprints',
        'rules',
      ]) {
        await tx
          .table<{ createdAt?: number; updatedAt?: number }>(name)
          .toCollection()
          .modify((r) => {
            r.updatedAt ??= r.createdAt ?? 0;
          });
      }
    });

    this.installSyncHooks();
  }

  /**
   * Per-table hooks that auto-stamp `updatedAt` on every create/update, giving
   * the merge importer a per-row clock with zero call-site wiring. Suppressed
   * while the importer writes folded rows (see `setSuppressSyncStamp`).
   */
  private installSyncHooks(): void {
    for (const name of SYNCED_TABLES) {
      const table = (this as unknown as Record<string, Table>)[name];
      if (!table) continue;
      table.hook('creating', (_pk, obj: { updatedAt?: number }) => {
        if (!_suppress) obj.updatedAt = now();
        else obj.updatedAt ??= now();
      });
      table.hook('updating', (_mods, _pk, _obj: { updatedAt?: number }) => {
        if (_suppress) return undefined; // keep the row's updatedAt as-is
        return { updatedAt: now() };
      });
    }
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
