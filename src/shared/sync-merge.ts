/**
 * Pure three-way merge of sync bundles. `base` is the common ancestor (the
 * last-synced bundle); on the very first sync it is `EMPTY_BUNDLE`. The engine
 * calls `mergeBundles(base, local, remote)` then writes the result to Dexie
 * (`diffToApply` tells it which ids to delete) and uploads it as the new base.
 *
 * Merge rule per record id (over the union of base ∪ local ∪ remote):
 *  - deleted on one side (present in base, absent live): the delete wins UNLESS
 *    the other side edited the row after the base (its `updatedAt` is newer
 *    than the base copy's) — an edit resurrects a stale delete (symmetric).
 *  - present on both live sides: keep the greater `updatedAt`; ties break on id.
 *  - present on one live side only, absent from base: a fresh create → keep.
 */
import { ID_FIELD, MERGE_TABLES, type MergeTable, type SyncBundle } from './sync-types';

type Rec = Record<string, unknown> & { updatedAt?: number };

function idOf(table: MergeTable, r: Rec): string {
  return String(r[ID_FIELD[table]]);
}
function index(table: MergeTable, rows: Rec[] | undefined): Map<string, Rec> {
  return new Map((rows ?? []).map((r) => [idOf(table, r), r]));
}
function ua(r: Rec | undefined): number {
  return typeof r?.updatedAt === 'number' ? r.updatedAt : 0;
}

/** Resolve one id across the three versions. Returns the surviving record, or
 *  null if it should be deleted. */
function resolve(
  base: Rec | undefined,
  local: Rec | undefined,
  remote: Rec | undefined,
): Rec | null {
  // Present on both live sides → newest wins.
  if (local && remote) return ua(local) >= ua(remote) ? local : remote;

  // Deleted on one side (absent live, present in base).
  if (!local && remote) {
    // deleted locally; keep only if remote edited it after base
    if (base && ua(remote) > ua(base)) return remote;
    return base ? null : remote; // no base → fresh remote create
  }
  if (local && !remote) {
    if (base && ua(local) > ua(base)) return local;
    return base ? null : local;
  }
  return null; // absent on both live sides
}

export function mergeBundles(base: SyncBundle, local: SyncBundle, remote: SyncBundle): SyncBundle {
  const out: SyncBundle = { ...local }; // carries vaultSalt/vaultVerifier (+ snapshots) from local
  for (const table of MERGE_TABLES) {
    const b = index(table, base[table] as unknown as Rec[] | undefined);
    const l = index(table, local[table] as unknown as Rec[] | undefined);
    const r = index(table, remote[table] as unknown as Rec[] | undefined);
    const ids = new Set([...b.keys(), ...l.keys(), ...r.keys()]);
    const survivors: Rec[] = [];
    for (const id of [...ids].sort()) {
      const winner = resolve(b.get(id), l.get(id), r.get(id));
      if (winner) survivors.push(winner);
    }
    (out[table] as unknown as Rec[]) = survivors;
  }
  return out;
}

/** ids that existed in `base` for a table but did not survive the merge — the
 *  engine deletes these rows from Dexie. */
export function diffToApply(base: SyncBundle, merged: SyncBundle): Record<MergeTable, string[]> {
  const result = {} as Record<MergeTable, string[]>;
  for (const table of MERGE_TABLES) {
    const survived = new Set((merged[table] as unknown as Rec[]).map((r) => idOf(table, r)));
    result[table] = ((base[table] as unknown as Rec[] | undefined) ?? [])
      .map((r) => idOf(table, r))
      .filter((id) => !survived.has(id));
  }
  return result;
}
