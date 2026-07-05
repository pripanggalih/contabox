# Drive Cross-Device Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sync all Contabox data across Firefox on multiple PCs through their own Google Drive, via a manual Sync button, zero-knowledge, with three-way merge so concurrent edits never lose data.

**Architecture:** Reuse the existing `BackupManager` collect + Web Crypto (PBKDF2/AES-GCM). A new `drive-client` handles OAuth + Drive REST (dumb transport). A new `sync-engine` orchestrates collect → download → three-way merge → upload, gated on vault-unlocked and `lock-manager`. A pure `sync-merge` module resolves conflicts. UI adds an Options "Sync" panel and a sidebar ActionBar button.

**Tech Stack:** TypeScript strict, Dexie (IndexedDB) with hooks, Web Crypto, Zod, React 19 + Zustand, Vitest + fake-indexeddb, `browser.identity` + Google Drive v3 REST.

## Global Constraints

- Never change `browser_specific_settings.gecko.id` (`contabox@galih.dev`).
- Validate every cross-boundary message with Zod (`src/shared/schemas.ts`).
- No `eval` / `new Function` / inline script / third-party crypto. Web Crypto only.
- No network calls without explicit opt-in. Drive sync is opt-in (user connects).
- Vault master key never leaves background. Refresh token stored encrypted.
- Schema migrations are forward-only and additive. New `.version(n+1)` block; never remove columns / rename keyPaths / wipe a store.
- Every sync path respects `lock-manager` / `isEffectivelyLocked`; sync requires the vault unlocked.
- Keep `package.json` ↔ `manifest.json` version in sync (untouched here).
- Path aliases: `@/` `@shared/` `@bg/` `@ui/`.
- Before committing: `pnpm lint && pnpm typecheck && pnpm test`.

---

### Task 1: Data-model foundation — v4 migration, `updatedAt` on synced types, auto-stamp hooks, sync meta keys

**Files:**
- Modify: `src/shared/types.ts` (add `updatedAt` to 7 interfaces)
- Modify: `src/shared/db.ts` (v4 migration + creating/updating hooks + `suppressSyncStamp` + `markDirty`)
- Modify: `src/shared/meta-keys.ts` (new sync meta keys)
- Test: `src/shared/db.sync.test.ts`

**Interfaces:**
- Produces: `updatedAt: number` on `ContainerExt`, `Workspace`, `Template`, `Proxy`, `ProxyPool`, `FingerprintProfile`, `AutoRule`.
- Produces: `export function setSuppressSyncStamp(on: boolean): void` and `export const SYNCED_TABLES: readonly string[]` from `db.ts`.
- Produces meta keys: `META_SYNC_FILE_ID`, `META_SYNC_LAST_REVISION`, `META_SYNC_BASE`, `META_SYNC_INCLUDE_SNAPSHOTS`, `META_SYNC_DIRTY`. (v1 stores no OAuth token — each sync re-auths for a fresh short-lived access token.)

- [ ] **Step 1: Add meta keys** — append to `src/shared/meta-keys.ts`:

```ts
/* ---------- Drive sync ---------- */
/** Drive file id of the encrypted sync blob in appDataFolder. Presence = connected.
 *  v1 stores no OAuth token — each sync re-runs the interactive auth flow. */
export const META_SYNC_FILE_ID = 'sync.fileId';
/** Drive headRevisionId of the last blob this device synced. */
export const META_SYNC_LAST_REVISION = 'sync.lastRevision';
/** Last-synced merged bundle (JSON) — common ancestor for the next 3-way merge. */
export const META_SYNC_BASE = 'sync.base';
/** User toggle: include large cookie snapshots in the synced blob. Default false. */
export const META_SYNC_INCLUDE_SNAPSHOTS = 'sync.includeSnapshots';
/** Set on any local write to a synced table; cleared on successful push. */
export const META_SYNC_DIRTY = 'sync.dirty';
```

- [ ] **Step 2: Add `updatedAt` to synced interfaces** in `src/shared/types.ts`. For each of `ContainerExt`, `Workspace`, `Template`, `Proxy`, `ProxyPool`, `FingerprintProfile`, `AutoRule`, add next to the existing `createdAt: number;` line:

```ts
  /** Last local mutation time; used for three-way sync merge. Backfilled = createdAt. */
  updatedAt: number;
```

(`VaultEntry` already has `updatedAt` — leave it.)

- [ ] **Step 3: Write the failing test** — `src/shared/db.sync.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDb, getDb, setSuppressSyncStamp, SYNCED_TABLES } from './db';
import { META_SYNC_DIRTY } from './meta-keys';

describe('sync hooks', () => {
  beforeEach(() => {
    _resetDb();
  });

  it('exposes the synced table list', () => {
    expect(SYNCED_TABLES).toContain('containers');
    expect(SYNCED_TABLES).toContain('vault');
    expect(SYNCED_TABLES).not.toContain('meta');
  });

  it('auto-stamps updatedAt and marks dirty on a normal write', async () => {
    const db = getDb();
    await db.workspaces.put({ id: 'w1', name: 'A', order: 0, createdAt: 100 } as never);
    const row = await db.workspaces.get('w1');
    expect((row as { updatedAt: number }).updatedAt).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 0)); // deferred dirty write
    const dirty = await db.meta.get(META_SYNC_DIRTY);
    expect(dirty?.value).toBe(true);
  });

  it('preserves updatedAt and does not mark dirty while suppressed', async () => {
    const db = getDb();
    await db.meta.put({ key: META_SYNC_DIRTY, value: false });
    setSuppressSyncStamp(true);
    await db.workspaces.put({ id: 'w2', name: 'B', order: 0, createdAt: 1, updatedAt: 42 } as never);
    setSuppressSyncStamp(false);
    const row = await db.workspaces.get('w2');
    expect((row as { updatedAt: number }).updatedAt).toBe(42);
    await new Promise((r) => setTimeout(r, 0));
    const dirty = await db.meta.get(META_SYNC_DIRTY);
    expect(dirty?.value).toBe(false);
  });
});
```

- [ ] **Step 4: Run it, expect failure**

Run: `pnpm test src/shared/db.sync.test.ts`
Expected: FAIL — `setSuppressSyncStamp`/`SYNCED_TABLES` not exported.

- [ ] **Step 5: Implement in `src/shared/db.ts`.** Add the v4 version block after the v3 block inside the constructor:

```ts
    // v4 — Drive sync. Add updatedAt to synced tables (backfill = createdAt).
    // Additive: no columns removed, no keyPath renamed. updatedAt is not indexed
    // (merge scans in memory), so the stores() lines are unchanged; only the
    // upgrade backfill runs.
    this.version(4).upgrade(async (tx) => {
      for (const name of ['containers', 'workspaces', 'templates', 'proxies', 'proxyPools', 'fingerprints', 'rules']) {
        await tx
          .table<{ createdAt?: number; updatedAt?: number }>(name)
          .toCollection()
          .modify((r) => {
            r.updatedAt ??= r.createdAt ?? 0;
          });
      }
    });
```

Then, still in the constructor, after all `this.version()` blocks, register hooks. Add a module-level flag and helper above the class, and call `this.installSyncHooks()` at the end of the constructor:

```ts
import { now } from './utils';
import { META_SYNC_DIRTY } from './meta-keys';

/** Tables whose rows participate in Drive sync (in-memory merge, not indexed). */
export const SYNCED_TABLES = [
  'containers', 'workspaces', 'templates', 'proxies', 'proxyPools',
  'fingerprints', 'rules', 'vault',
] as const;

let _suppress = false;
/** Raised by sync-engine while it writes merged results, so applying a sync
 *  neither overwrites the resolved updatedAt nor re-marks the data dirty. */
export function setSuppressSyncStamp(on: boolean): void {
  _suppress = on;
}
```

Inside the class body add:

```ts
  private markDirty(): void {
    if (_suppress) return;
    // Defer: never write to `meta` from inside another table's hook transaction.
    void Promise.resolve().then(() =>
      getDb().meta.put({ key: META_SYNC_DIRTY, value: true }).catch(() => {}),
    );
  }

  private installSyncHooks(): void {
    for (const name of SYNCED_TABLES) {
      const table = (this as unknown as Record<string, import('dexie').Table>)[name];
      table.hook('creating', (_pk, obj: { updatedAt?: number }) => {
        if (!_suppress) obj.updatedAt = now();
        else obj.updatedAt ??= now();
        this.markDirty();
      });
      table.hook('updating', (_mods, _pk, obj: { updatedAt?: number }) => {
        if (_suppress) return undefined; // keep merged updatedAt as-is
        this.markDirty();
        return { updatedAt: now() };
      });
    }
  }
```

Call `this.installSyncHooks();` as the last statement in the constructor.

- [ ] **Step 6: Run tests, expect pass**

Run: `pnpm test src/shared/db.sync.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Typecheck** — adding `updatedAt` as required may break existing object literals that build these rows (e.g. `container-manager.create`). Run `pnpm typecheck`; for every reported literal missing `updatedAt`, add `updatedAt: now()` (the row goes through the hook anyway, but the type requires it). Expected after fixes: clean.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/db.ts src/shared/meta-keys.ts src/shared/db.sync.test.ts
pnpm lint && pnpm typecheck && pnpm test
git commit -m "feat(sync): v4 migration, updatedAt hooks, sync meta keys"
```

---

### Task 2: Sync bundle type + Zod schema

**Files:**
- Create: `src/shared/sync-types.ts`
- Modify: `src/shared/schemas.ts` (add `syncBundleSchema`)
- Test: `src/shared/sync-types.test.ts`

**Interfaces:**
- Produces: `interface SyncBundle` — `{ containers, workspaces, templates, proxies, proxyPools, fingerprints, rules, vault, snapshots?, vaultSalt, vaultVerifier }`, every record array typed from `types.ts`.
- Produces: `EMPTY_BUNDLE: SyncBundle` constant.
- Produces: `syncBundleSchema` (Zod) validating a decrypted bundle before it is trusted.

- [ ] **Step 1: Create `src/shared/sync-types.ts`:**

```ts
import type {
  AutoRule, ContainerExt, FingerprintProfile, Proxy, ProxyPool,
  Snapshot, Template, VaultEntry, Workspace,
} from './types';
import type { Encrypted } from './crypto';

/** The plaintext shape that gets AES-GCM-wrapped and stored on Drive. Vault
 *  identity (salt + verifier) travels so a fresh device can bootstrap. */
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
  containers: [], workspaces: [], templates: [], proxies: [], proxyPools: [],
  fingerprints: [], rules: [], vault: [], vaultSalt: '', vaultVerifier: { cipher: '', iv: '' },
};

/** Keys of SyncBundle that are merge-able record arrays keyed by their id. */
export const MERGE_TABLES = [
  'containers', 'workspaces', 'templates', 'proxies', 'proxyPools',
  'fingerprints', 'rules', 'vault',
] as const;
export type MergeTable = (typeof MERGE_TABLES)[number];

/** Primary-key field per merge table (containers key on cookieStoreId, rest on id). */
export const ID_FIELD: Record<MergeTable, string> = {
  containers: 'cookieStoreId', workspaces: 'id', templates: 'id', proxies: 'id',
  proxyPools: 'id', fingerprints: 'id', rules: 'id', vault: 'id',
};
```

- [ ] **Step 2: Write the failing test** — `src/shared/sync-types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_BUNDLE, ID_FIELD, MERGE_TABLES } from './sync-types';
import { syncBundleSchema } from './schemas';

describe('sync bundle', () => {
  it('EMPTY_BUNDLE validates', () => {
    expect(syncBundleSchema.safeParse(EMPTY_BUNDLE).success).toBe(true);
  });
  it('rejects a bundle missing an array', () => {
    const bad = { ...EMPTY_BUNDLE } as Record<string, unknown>;
    delete bad.containers;
    expect(syncBundleSchema.safeParse(bad).success).toBe(false);
  });
  it('containers key on cookieStoreId, others on id', () => {
    expect(ID_FIELD.containers).toBe('cookieStoreId');
    expect(MERGE_TABLES).toContain('vault');
  });
});
```

- [ ] **Step 3: Run it, expect failure**

Run: `pnpm test src/shared/sync-types.test.ts`
Expected: FAIL — `syncBundleSchema` not exported.

- [ ] **Step 4: Add `syncBundleSchema` to `src/shared/schemas.ts`.** Follow the existing Zod style in that file. Records are validated loosely (they originate from our own encrypted blob, but a hostile/corrupt blob must not crash writes):

```ts
// (near the other z.object schemas)
const anyRecordArray = z.array(z.record(z.string(), z.unknown()));
const encryptedSchema = z.object({ cipher: z.string(), iv: z.string() });

export const syncBundleSchema = z.object({
  containers: anyRecordArray,
  workspaces: anyRecordArray,
  templates: anyRecordArray,
  proxies: anyRecordArray,
  proxyPools: anyRecordArray,
  fingerprints: anyRecordArray,
  rules: anyRecordArray,
  vault: anyRecordArray,
  snapshots: anyRecordArray.optional(),
  vaultSalt: z.string(),
  vaultVerifier: encryptedSchema,
});
```

- [ ] **Step 5: Run tests, expect pass**

Run: `pnpm test src/shared/sync-types.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/sync-types.ts src/shared/schemas.ts src/shared/sync-types.test.ts
pnpm lint && pnpm typecheck && pnpm test
git commit -m "feat(sync): sync bundle type + zod schema"
```

---

### Task 3: Pure three-way merge

**Files:**
- Create: `src/shared/sync-merge.ts`
- Test: `src/shared/sync-merge.test.ts`

**Interfaces:**
- Consumes: `SyncBundle`, `MERGE_TABLES`, `ID_FIELD` from `sync-types.ts`.
- Produces: `export function mergeBundles(base: SyncBundle, local: SyncBundle, remote: SyncBundle): SyncBundle`.
- Produces: `export function diffToApply(base: SyncBundle, merged: SyncBundle): { deletes: Record<MergeTable, string[]> }` — ids present in base but gone from merged, per table, so the engine knows what to delete from Dexie.

**Merge rule per record id (over union of base∪local∪remote):**
- Missing from `local` but in `base` → deleted locally. Missing from `remote` but in `base` → deleted remotely. A delete wins **unless** the other side's `updatedAt` is newer than the base copy's `updatedAt` (an edit resurrects a stale delete).
- Present on both sides → keep greater `updatedAt`; tie → the record whose id sorts first (stable).
- Present on one side only, absent from base → fresh create → keep.
- Vault identity fields (`vaultSalt`, `vaultVerifier`) are taken from `local` (the engine has already reconciled identity before merge — see Task 5).

- [ ] **Step 1: Write the failing test** — `src/shared/sync-merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_BUNDLE, type SyncBundle } from './sync-types';
import { mergeBundles } from './sync-merge';

const ws = (id: string, name: string, updatedAt: number) =>
  ({ id, name, order: 0, createdAt: 0, updatedAt }) as never;

const bundle = (workspaces: unknown[]): SyncBundle =>
  ({ ...EMPTY_BUNDLE, workspaces: workspaces as never, vaultSalt: 's', vaultVerifier: { cipher: 'c', iv: 'i' } });

describe('mergeBundles', () => {
  it('first sync (empty base) unions both sides', () => {
    const local = bundle([ws('a', 'A', 10)]);
    const remote = bundle([ws('b', 'B', 20)]);
    const m = mergeBundles(EMPTY_BUNDLE, local, remote);
    expect(m.workspaces.map((w) => w.id).sort()).toEqual(['a', 'b']);
  });

  it('concurrent edit: newer updatedAt wins', () => {
    const base = bundle([ws('a', 'old', 1)]);
    const local = bundle([ws('a', 'local', 5)]);
    const remote = bundle([ws('a', 'remote', 9)]);
    const m = mergeBundles(base, local, remote);
    expect(m.workspaces[0].name).toBe('remote');
  });

  it('local delete propagates when remote did not touch it', () => {
    const base = bundle([ws('a', 'A', 1)]);
    const local = bundle([]); // deleted locally
    const remote = bundle([ws('a', 'A', 1)]); // unchanged
    const m = mergeBundles(base, local, remote);
    expect(m.workspaces).toHaveLength(0);
  });

  it('edit resurrects a stale delete', () => {
    const base = bundle([ws('a', 'A', 1)]);
    const local = bundle([]); // deleted locally
    const remote = bundle([ws('a', 'edited', 9)]); // edited after base
    const m = mergeBundles(base, local, remote);
    expect(m.workspaces).toHaveLength(1);
    expect(m.workspaces[0].name).toBe('edited');
  });

  it('fresh create on one side is kept', () => {
    const base = bundle([]);
    const local = bundle([ws('a', 'A', 3)]);
    const remote = bundle([]);
    const m = mergeBundles(base, local, remote);
    expect(m.workspaces).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm test src/shared/sync-merge.test.ts`
Expected: FAIL — `mergeBundles` not defined.

- [ ] **Step 3: Implement `src/shared/sync-merge.ts`:**

```ts
import { type MergeTable, MERGE_TABLES, ID_FIELD, type SyncBundle } from './sync-types';

type Rec = Record<string, unknown> & { updatedAt?: number };

function idOf(table: MergeTable, r: Rec): string {
  return String(r[ID_FIELD[table]]);
}
function index(table: MergeTable, rows: Rec[]): Map<string, Rec> {
  return new Map(rows.map((r) => [idOf(table, r), r]));
}
function ua(r: Rec | undefined): number {
  return typeof r?.updatedAt === 'number' ? r.updatedAt : 0;
}

/** Resolve one id across the three versions. Returns the surviving record, or
 *  null if it should be deleted. */
function resolve(base: Rec | undefined, local: Rec | undefined, remote: Rec | undefined): Rec | null {
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
  const out: SyncBundle = {
    ...local, // carries vaultSalt/vaultVerifier + snapshots from local
  };
  for (const table of MERGE_TABLES) {
    const b = index(table, (base[table] as Rec[]) ?? []);
    const l = index(table, (local[table] as Rec[]) ?? []);
    const r = index(table, (remote[table] as Rec[]) ?? []);
    const ids = new Set([...b.keys(), ...l.keys(), ...r.keys()]);
    const survivors: Rec[] = [];
    for (const id of [...ids].sort()) {
      const winner = resolve(b.get(id), l.get(id), r.get(id));
      if (winner) survivors.push(winner);
    }
    (out[table] as Rec[]) = survivors;
  }
  return out;
}

/** ids that existed in `base` for a table but did not survive the merge —
 *  the engine deletes these rows from Dexie. */
export function diffToApply(base: SyncBundle, merged: SyncBundle): Record<MergeTable, string[]> {
  const result = {} as Record<MergeTable, string[]>;
  for (const table of MERGE_TABLES) {
    const survived = new Set((merged[table] as Rec[]).map((r) => idOf(table, r)));
    result[table] = ((base[table] as Rec[]) ?? [])
      .map((r) => idOf(table, r))
      .filter((id) => !survived.has(id));
  }
  return result;
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test src/shared/sync-merge.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/sync-merge.ts src/shared/sync-merge.test.ts
pnpm lint && pnpm typecheck && pnpm test
git commit -m "feat(sync): pure three-way merge"
```

---

### Task 4: Drive client — OAuth + REST transport

**Files:**
- Create: `src/background/drive-client.ts`
- Test: `src/background/drive-client.test.ts`

**Interfaces:**
- Consumes: `browser.identity.launchWebAuthFlow`, global `fetch`.
- Produces:
  - `class DriveClient` with:
    - `authorize(): Promise<string>` — runs the OAuth flow, returns an access token.
    - `findOrCreateFile(token: string, name: string): Promise<string>` — returns Drive fileId in `appDataFolder`.
    - `getMeta(token: string, fileId: string): Promise<{ headRevisionId: string; size: number }>`.
    - `download(token: string, fileId: string): Promise<string>` — returns the file body (the encrypted blob JSON string).
    - `upload(token: string, fileId: string, body: string): Promise<{ headRevisionId: string }>`.
  - `export const CLIENT_ID_META = 'sync.oauthClientId'` is NOT here — the client id is a build constant (Task 7).
- Note: token refresh is out of scope for v1 — `launchWebAuthFlow` with `prompt=consent` returns a fresh access token each connect/sync. Store nothing long-lived beyond a marker that the user connected. (See Task 5 for how the engine calls `authorize()` per sync.)

`ponytail:` v1 re-runs the interactive auth flow when the token is missing/expired rather than implementing OAuth refresh-token exchange. Upgrade to refresh-token flow if re-consent prompts annoy users.

- [ ] **Step 1: Write the failing test** — `src/background/drive-client.test.ts`. Mock `fetch` and `browser.identity`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveClient } from './drive-client';

const OK = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

describe('DriveClient', () => {
  let client: DriveClient;
  beforeEach(() => {
    client = new DriveClient('test-client-id');
    vi.restoreAllMocks();
  });

  it('finds an existing file by name in appDataFolder', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      OK({ files: [{ id: 'file-1', name: 'contabox-vault.enc' }] }),
    );
    const id = await client.findOrCreateFile('tok', 'contabox-vault.enc');
    expect(id).toBe('file-1');
  });

  it('creates the file when none exists', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(OK({ files: [] })) // list → empty
      .mockResolvedValueOnce(OK({ id: 'new-file' })); // create
    const id = await client.findOrCreateFile('tok', 'contabox-vault.enc');
    expect(id).toBe('new-file');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('upload returns the new headRevisionId', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(OK({ headRevisionId: 'rev-9' }));
    const res = await client.upload('tok', 'file-1', '{"cipher":"x"}');
    expect(res.headRevisionId).toBe('rev-9');
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'no' } as Response);
    await expect(client.getMeta('tok', 'file-1')).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm test src/background/drive-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/background/drive-client.ts`:**

```ts
import { browser } from '@shared/browser';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export class DriveClient {
  constructor(private readonly clientId: string) {}

  /** Interactive OAuth via implicit flow; returns a short-lived access token. */
  async authorize(): Promise<string> {
    const redirect = browser.identity.getRedirectURL();
    const url =
      'https://accounts.google.com/o/oauth2/auth' +
      `?client_id=${encodeURIComponent(this.clientId)}` +
      `&response_type=token` +
      `&redirect_uri=${encodeURIComponent(redirect)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&prompt=consent`;
    const redirectResponse = await browser.identity.launchWebAuthFlow({ url, interactive: true });
    const m = /[#&]access_token=([^&]+)/.exec(redirectResponse ?? '');
    if (!m) throw new Error('Drive authorization failed: no access token');
    return decodeURIComponent(m[1]);
  }

  private async req(token: string, url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Drive ${init.method ?? 'GET'} ${url} → ${res.status}: ${await res.text()}`);
    return res;
  }

  async findOrCreateFile(token: string, name: string): Promise<string> {
    const q = encodeURIComponent(`name='${name}'`);
    const listRes = await this.req(
      token,
      `${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`,
    );
    const list = (await listRes.json()) as { files: Array<{ id: string }> };
    if (list.files.length > 0) return list.files[0].id;

    const createRes = await this.req(token, `${DRIVE}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: ['appDataFolder'] }),
    });
    return ((await createRes.json()) as { id: string }).id;
  }

  async getMeta(token: string, fileId: string): Promise<{ headRevisionId: string; size: number }> {
    const res = await this.req(token, `${DRIVE}/files/${fileId}?fields=headRevisionId,size`);
    const j = (await res.json()) as { headRevisionId?: string; size?: string };
    return { headRevisionId: j.headRevisionId ?? '', size: Number(j.size ?? 0) };
  }

  async download(token: string, fileId: string): Promise<string> {
    const res = await this.req(token, `${DRIVE}/files/${fileId}?alt=media`);
    return res.text();
  }

  async upload(token: string, fileId: string, body: string): Promise<{ headRevisionId: string }> {
    const res = await this.req(
      token,
      `${UPLOAD}/files/${fileId}?uploadType=media&fields=headRevisionId`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body },
    );
    return { headRevisionId: ((await res.json()) as { headRevisionId: string }).headRevisionId };
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test src/background/drive-client.test.ts`
Expected: PASS (4 tests). If `browser.identity` is undefined in the test setup, the tests that call `authorize()` are not exercised here — only `findOrCreateFile`/`getMeta`/`upload` are, which use `fetch`. Confirm `src/test/setup.ts` mocks `browser`; if `identity` is missing it does not matter for these tests.

- [ ] **Step 5: Commit**

```bash
git add src/background/drive-client.ts src/background/drive-client.test.ts
pnpm lint && pnpm typecheck && pnpm test
git commit -m "feat(sync): Google Drive appDataFolder REST client"
```

---

### Task 5: Sync engine — orchestration, bootstrap, reconcile, lock guard

**Files:**
- Create: `src/background/sync-engine.ts`
- Test: `src/background/sync-engine.test.ts`

**Interfaces:**
- Consumes: `DriveClient` (Task 4), `mergeBundles`/`diffToApply` (Task 3), `SyncBundle`/`EMPTY_BUNDLE`/`MERGE_TABLES`/`ID_FIELD` (Task 2), `vault` (`src/background/vault.ts`), `setSuppressSyncStamp`/`SYNCED_TABLES` (Task 1), meta keys (Task 1), crypto (`deriveKey`/`encryptString`/`decryptString`), `getDb`.
- Produces: `class SyncEngine` with:
  - `status(): Promise<SyncStatus>` where `SyncStatus = { connected: boolean; unlocked: boolean; dirty: boolean; includeSnapshots: boolean; lastSyncedAt: number | null; blobSize: number | null }`.
  - `connect(): Promise<{ bootstrapped: boolean; conflict?: 'password-mismatch' }>`.
  - `disconnect(): Promise<void>`.
  - `sync(password: string): Promise<{ merged: number; conflict?: 'password-mismatch' }>` — the Sync button.
  - `setIncludeSnapshots(on: boolean): Promise<void>`.
  - `resolveConflict(choice: 'use-remote' | 'push-local', password: string): Promise<void>`.
- Produces: `export const syncEngine = new SyncEngine(...)`.

**Preconditions enforced in `sync()`:** `vault.isUnlocked()` must be true; the caller passes the just-used master password (the UI already holds it at unlock/sync time). If locked → throw `Error('vault locked')`.

**Bundle collection:** read the 8 synced tables + `META_VAULT_SALT` + `META_VAULT_VERIFIER`; include `snapshots` only when the toggle is on.

**Apply merged bundle to Dexie:** wrap in `setSuppressSyncStamp(true)` … `finally setSuppressSyncStamp(false)`; `bulkPut` each table's survivors and `bulkDelete` the ids from `diffToApply`; write `vaultSalt`/`vaultVerifier` to meta only during bootstrap/use-remote.

**Password-mismatch detection:** after download+decrypt of the outer AES-GCM wrap (keyed by the supplied master password), if decryption fails **or** the inner `vaultVerifier` does not decrypt to `contabox-vault-v1` under the supplied password → return `{ conflict: 'password-mismatch' }` without writing anything.

- [ ] **Step 1: Write the failing test** — `src/background/sync-engine.test.ts`. Use `fake-indexeddb` (already the test DB) and a stub DriveClient that keeps the blob in memory:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDb, getDb } from '@shared/db';
import { META_VAULT_SALT, META_VAULT_VERIFIER } from '@shared/meta-keys';
import { deriveKey, encryptString, randomBytes, bytesToBase64, SALT_LEN } from '@shared/crypto';
import { SyncEngine } from './sync-engine';
import { vault } from './vault';

// In-memory Drive stub matching the DriveClient surface the engine uses.
class StubDrive {
  blob = '';
  rev = 'r0';
  async authorize() { return 'tok'; }
  async findOrCreateFile() { return 'file-1'; }
  async getMeta() { return { headRevisionId: this.rev, size: this.blob.length }; }
  async download() { return this.blob; }
  async upload(_t: string, _f: string, body: string) { this.blob = body; this.rev = `r${Number(this.rev.slice(1)) + 1}`; return { headRevisionId: this.rev }; }
}

async function initVault(pw: string) {
  await vault.initialize(pw);
}

describe('SyncEngine', () => {
  let drive: StubDrive;
  let engine: SyncEngine;
  beforeEach(async () => {
    _resetDb();
    vault.lock();
    drive = new StubDrive();
    engine = new SyncEngine(drive as never);
    await getDb().meta.put({ key: 'sync.fileId', value: 'file-1' }); // pretend connected
  });

  it('rejects sync while locked', async () => {
    await expect(engine.sync('pw123456')).rejects.toThrow(/locked/);
  });

  it('round-trips a container through push then a fresh device pull', async () => {
    await initVault('pw123456');
    await getDb().containers.put({ cookieStoreId: 'c1', name: 'One', createdAt: 1, lastUsedAt: 1, updatedAt: 1 } as never);
    await engine.sync('pw123456'); // push to stub Drive

    // Simulate a second device: fresh DB, adopt the blob.
    _resetDb();
    vault.lock();
    await getDb().meta.put({ key: 'sync.fileId', value: 'file-1' });
    const engine2 = new SyncEngine(drive as never);
    await initVault('pw123456'); // same password
    const res = await engine2.sync('pw123456');
    expect(res.conflict).toBeUndefined();
    const c = await getDb().containers.get('c1');
    expect((c as { name: string }).name).toBe('One');
  });

  it('flags a password mismatch instead of writing', async () => {
    await initVault('pw123456');
    await getDb().containers.put({ cookieStoreId: 'c1', name: 'One', createdAt: 1, lastUsedAt: 1, updatedAt: 1 } as never);
    await engine.sync('pw123456');

    _resetDb();
    vault.lock();
    await getDb().meta.put({ key: 'sync.fileId', value: 'file-1' });
    const engine2 = new SyncEngine(drive as never);
    await initVault('different-pw'); // different master password
    const res = await engine2.sync('different-pw');
    expect(res.conflict).toBe('password-mismatch');
    expect(await getDb().containers.get('c1')).toBeUndefined(); // nothing written
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm test src/background/sync-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/background/sync-engine.ts`.** (Outer wrap re-uses the same PBKDF2/AES-GCM helpers; the blob JSON on Drive is `{ salt, payload }` exactly like `BackupManager.exportEncrypted`.)

```ts
import {
  base64ToBytes, bytesToBase64, decryptString, deriveKey, type Encrypted,
  encryptString, randomBytes, SALT_LEN,
} from '@shared/crypto';
import { getDb, setSuppressSyncStamp } from '@shared/db';
import {
  META_SYNC_BASE, META_SYNC_DIRTY, META_SYNC_FILE_ID, META_SYNC_INCLUDE_SNAPSHOTS,
  META_SYNC_LAST_REVISION, META_VAULT_SALT, META_VAULT_VERIFIER,
} from '@shared/meta-keys';
import { syncBundleSchema } from '@shared/schemas';
import { diffToApply, mergeBundles } from '@shared/sync-merge';
import { EMPTY_BUNDLE, ID_FIELD, MERGE_TABLES, type SyncBundle } from '@shared/sync-types';
import { now } from '@shared/utils';
import type { DriveClient } from './drive-client';
import { vault } from './vault';

const FILE_NAME = 'contabox-vault.enc';
const VERIFIER_PLAIN = 'contabox-vault-v1';

interface WrappedBlob { salt: string; payload: Encrypted }

export interface SyncStatus {
  connected: boolean; unlocked: boolean; dirty: boolean;
  includeSnapshots: boolean; lastSyncedAt: number | null; blobSize: number | null;
}

export class SyncEngine {
  private lastSyncedAt: number | null = null;
  constructor(private readonly drive: DriveClient) {}

  private async meta<T>(key: string): Promise<T | undefined> {
    return (await getDb().meta.get(key))?.value as T | undefined;
  }

  async status(): Promise<SyncStatus> {
    return {
      connected: !!(await this.meta<string>(META_SYNC_FILE_ID)),
      unlocked: vault.isUnlocked(),
      dirty: (await this.meta<boolean>(META_SYNC_DIRTY)) ?? false,
      includeSnapshots: (await this.meta<boolean>(META_SYNC_INCLUDE_SNAPSHOTS)) ?? false,
      lastSyncedAt: this.lastSyncedAt,
      blobSize: null,
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
        db.containers.toArray(), db.workspaces.toArray(), db.templates.toArray(),
        db.proxies.toArray(), db.proxyPools.toArray(), db.fingerprints.toArray(),
        db.rules.toArray(), db.vault.toArray(),
      ]);
    const saltRow = await db.meta.get(META_VAULT_SALT);
    const verRow = await db.meta.get(META_VAULT_VERIFIER);
    return {
      containers, workspaces, templates, proxies, proxyPools, fingerprints, rules,
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

  /** Returns the decoded bundle or null when the password can't open it. */
  private async unwrap(password: string, body: string): Promise<SyncBundle | null> {
    let wrapped: WrappedBlob;
    try { wrapped = JSON.parse(body) as WrappedBlob; } catch { return null; }
    const key = await deriveKey(password, base64ToBytes(wrapped.salt));
    const plain = await decryptString(key, wrapped.payload).catch(() => null);
    if (plain === null) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(plain); } catch { return null; }
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

  private async applyMerged(merged: SyncBundle, base: SyncBundle, adoptIdentity: boolean): Promise<void> {
    const db = getDb();
    const deletes = diffToApply(base, merged);
    setSuppressSyncStamp(true);
    try {
      await db.transaction('rw', [
        db.containers, db.workspaces, db.templates, db.proxies, db.proxyPools,
        db.fingerprints, db.rules, db.vault, db.meta,
      ], async () => {
        for (const table of MERGE_TABLES) {
          const rows = merged[table] as Array<Record<string, unknown>>;
          if (rows.length) await (db[table] as never as { bulkPut: (r: unknown[]) => Promise<unknown> }).bulkPut(rows);
          const del = deletes[table];
          if (del.length) await (db[table] as never as { bulkDelete: (k: string[]) => Promise<void> }).bulkDelete(del);
        }
        if (adoptIdentity && merged.vaultSalt) {
          await db.meta.put({ key: META_VAULT_SALT, value: merged.vaultSalt });
          await db.meta.put({ key: META_VAULT_VERIFIER, value: merged.vaultVerifier });
        }
        await db.meta.put({ key: META_SYNC_BASE, value: merged });
        await db.meta.put({ key: META_SYNC_DIRTY, value: false });
      });
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
      return;
    }

    // use-remote: replace local identity + data with the remote bundle.
    const body = await this.drive.download(token, fileId);
    const decoded = await this.unwrap(password, body);
    if (decoded === null) throw new Error('wrong password for the Drive backup');
    await this.applyMerged(decoded, EMPTY_BUNDLE, true);
    vault.lock(); // force re-unlock under the adopted identity
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test src/background/sync-engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/background/sync-engine.ts src/background/sync-engine.test.ts
pnpm lint && pnpm typecheck && pnpm test
git commit -m "feat(sync): sync engine — 3-way orchestration, bootstrap, reconcile"
```

---

### Task 6: Wire commands + manifest permissions

**Files:**
- Modify: `src/shared/messaging.ts` (Command union + ResultMap + a `state.sync` broadcast)
- Modify: `src/background/command-router.ts` (register handlers + construct `syncEngine`)
- Modify: `public/manifest.json` (`identity` permission + googleapis host)
- Modify: `src/background/sync-engine.ts` (export a constructed singleton with a real `DriveClient` + build-time client id)
- Test: extend `src/background/sync-engine.test.ts` is already covered; add a router smoke test only if the file has an existing pattern — otherwise skip (the engine is unit-tested).

**Interfaces:**
- Consumes: `syncEngine` (Task 5).
- Produces commands: `sync.status`, `sync.connect`, `sync.disconnect`, `sync.now` (payload `{ password: string }`), `sync.setIncludeSnapshots` (payload `{ on: boolean }`), `sync.resolveConflict` (payload `{ choice: 'use-remote' | 'push-local'; password: string }`).

- [ ] **Step 1: Add the build-time client id + singleton** at the bottom of `src/background/sync-engine.ts`:

```ts
import { DriveClient } from './drive-client';

// Registered once by the maintainer at Google Cloud Console → OAuth client
// (type: "Web application"), redirect URI = browser.identity.getRedirectURL().
// Injected at build time; falls back to empty (sync UI shows "not configured").
const OAUTH_CLIENT_ID = (import.meta.env?.VITE_GOOGLE_OAUTH_CLIENT_ID as string) ?? '';

export const syncEngine = new SyncEngine(new DriveClient(OAUTH_CLIENT_ID));
```

- [ ] **Step 2: Extend the `Command` union** in `src/shared/messaging.ts` (after the `// backup` block):

```ts
  // drive sync
  | { type: 'sync.status' }
  | { type: 'sync.connect' }
  | { type: 'sync.disconnect' }
  | { type: 'sync.now'; payload: { password: string } }
  | { type: 'sync.setIncludeSnapshots'; payload: { on: boolean } }
  | { type: 'sync.resolveConflict'; payload: { choice: 'use-remote' | 'push-local'; password: string } };
```

- [ ] **Step 3: Extend `ResultMap`** in the same file:

```ts
  'sync.status': import('../background/sync-engine').SyncStatus;
  'sync.connect': { connected: true };
  'sync.disconnect': { ok: true };
  'sync.now': { merged: number; conflict?: 'password-mismatch' };
  'sync.setIncludeSnapshots': { ok: true };
  'sync.resolveConflict': { ok: true };
```

- [ ] **Step 4: Add the `state.sync` broadcast** to the `Broadcast` union in `messaging.ts`:

```ts
  | { type: 'state.sync' }
```

- [ ] **Step 5: Register handlers** in `src/background/command-router.ts`. Import `syncEngine` and add (following the existing `this.add(...)` + Zod pattern; validate payloads inline since they are trivial):

```ts
    this.add('sync.status', async () => syncEngine.status());
    this.add('sync.connect', async () => {
      const r = await syncEngine.connect();
      void broadcast({ type: 'state.sync' });
      return r;
    });
    this.add('sync.disconnect', async () => {
      await syncEngine.disconnect();
      void broadcast({ type: 'state.sync' });
      return { ok: true } as const;
    });
    this.add('sync.now', async (cmd) => {
      const password = z.string().min(8).parse(cmd.payload.password);
      const r = await syncEngine.sync(password);
      void broadcast({ type: 'state.sync' });
      void broadcast({ type: 'state.containers' });
      void broadcast({ type: 'state.workspaces' });
      void broadcast({ type: 'state.vault' });
      return r;
    });
    this.add('sync.setIncludeSnapshots', async (cmd) => {
      await syncEngine.setIncludeSnapshots(z.boolean().parse(cmd.payload.on));
      void broadcast({ type: 'state.sync' });
      return { ok: true } as const;
    });
    this.add('sync.resolveConflict', async (cmd) => {
      const choice = z.enum(['use-remote', 'push-local']).parse(cmd.payload.choice);
      const password = z.string().min(8).parse(cmd.payload.password);
      await syncEngine.resolveConflict(choice, password);
      void broadcast({ type: 'state.sync' });
      void broadcast({ type: 'state.containers' });
      return { ok: true } as const;
    });
```

(If `z` is not already imported in command-router, add `import { z } from 'zod';`.)

- [ ] **Step 6: Manifest permissions** — in `public/manifest.json`, add `"identity"` to `permissions` and the Drive host to `host_permissions` (create the array if absent):

```json
  "permissions": ["...existing...", "identity"],
  "host_permissions": ["...existing...", "https://www.googleapis.com/*"]
```

- [ ] **Step 7: Verify build + types**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean. Then `pnpm build` and `pnpm exec web-ext lint --source-dir=dist` — expect no new blocking errors (identity/host permissions are AMO-legal).

- [ ] **Step 8: Commit**

```bash
git add src/shared/messaging.ts src/background/command-router.ts src/background/sync-engine.ts public/manifest.json
git commit -m "feat(sync): wire sync commands + identity/drive permissions"
```

---

### Task 7: Options "Sync" panel + reconcile dialog

**Files:**
- Create: `src/options/panels/SyncPanel.tsx`
- Modify: the options page navigation/registry (read `src/options/` to find where panels/tabs are registered — e.g. `src/options/App.tsx` or an equivalent index) to add a "Sync" entry.
- Test: manual (UI). Optional Vitest+jsdom render test if the options page already has a component-test pattern.

**Interfaces:**
- Consumes: `invoke` from `@shared/messaging`; `sync.*` commands (Task 6); `onBroadcast` for `state.sync`.

- [ ] **Step 1: Read the options page structure** to learn the panel registration pattern.

Run: `ls src/options && sed -n '1,80p' src/options/App.tsx` (adjust to the real entry file). Note how existing panels (e.g. Vault, Privacy) are declared and rendered, and how the master password is obtained (reuse the existing vault-unlock UI/hook — do NOT build a new password box if one exists).

- [ ] **Step 2: Create `src/options/panels/SyncPanel.tsx`.** Follow the existing panel's styling/props. This is the concrete behavior (adapt imports/wrappers to match neighbors):

```tsx
import { useEffect, useState } from 'react';
import { invoke, onBroadcast } from '@shared/messaging';

type Status = Awaited<ReturnType<typeof loadStatus>>;
async function loadStatus() {
  return invoke({ type: 'sync.status' });
}

export function SyncPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => loadStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    refresh();
    return onBroadcast((e) => { if (e.type === 'state.sync') refresh(); });
  }, []);

  const connect = async () => {
    setBusy(true); setError(null);
    try { await invoke({ type: 'sync.connect' }); } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  const syncNow = async () => {
    setBusy(true); setError(null);
    try {
      const r = await invoke({ type: 'sync.now', payload: { password } });
      if (r.conflict === 'password-mismatch') setConflict(true);
      else setPassword('');
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  const resolve = async (choice: 'use-remote' | 'push-local') => {
    setBusy(true); setError(null);
    try { await invoke({ type: 'sync.resolveConflict', payload: { choice, password } }); setConflict(false); setPassword(''); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  if (!status) return <p>Loading…</p>;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Sync (Google Drive)</h2>
        <p className="text-sm opacity-70">
          Your data is encrypted on this device before it leaves. Google stores only ciphertext —
          your master password never leaves your computer.
        </p>
      </header>

      {!status.connected ? (
        <button className="btn btn-primary" disabled={busy} onClick={connect}>
          Connect Google Drive
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">Connected. Last synced: {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'never'}.</p>
          {status.blobSize != null && <p className="text-sm opacity-70">Backup size: {(status.blobSize / 1024).toFixed(1)} KB</p>}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={status.includeSnapshots}
              disabled={busy}
              onChange={(e) => invoke({ type: 'sync.setIncludeSnapshots', payload: { on: e.target.checked } })}
            />
            <span>
              <strong>Include snapshots (cookies).</strong> Moves live login sessions across devices,
              so a tab opens already signed in elsewhere. Off by default — snapshots can be tens of MB,
              making the backup much larger and syncs slower.
            </span>
          </label>

          {!status.unlocked && <p className="text-sm text-amber-600">Unlock the vault to sync.</p>}
          <div className="flex items-center gap-2">
            <input
              type="password"
              className="input"
              placeholder="Master password"
              value={password}
              disabled={busy || !status.unlocked}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy || !status.unlocked || password.length < 8} onClick={syncNow}>
              Sync now
            </button>
          </div>

          <button className="btn btn-ghost" disabled={busy} onClick={() => invoke({ type: 'sync.disconnect' })}>
            Disconnect
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {conflict && (
        <div role="dialog" className="rounded border p-4 space-y-3">
          <h3 className="font-semibold">This Google Drive already has Contabox data from another setup.</h3>
          <p className="text-sm">
            The backup on Drive uses a different master password than this device. They can’t be merged
            automatically because each is encrypted with its own password. Choose how to continue:
          </p>
          <div className="flex flex-col gap-2">
            <button className="btn" disabled={busy} onClick={() => resolve('use-remote')}>
              Use the Drive data — replace this device’s data with the synced data.
            </button>
            <button className="btn" disabled={busy} onClick={() => resolve('push-local')}>
              Push this device’s data to Drive — overwrite the other setup’s backup.
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setConflict(false)}>
              Cancel — leave both untouched.
            </button>
          </div>
          <p className="text-xs opacity-70">
            “Use the Drive data” asks for the backup’s master password and replaces local data. Export an
            encrypted backup first if you have local-only changes.
          </p>
        </div>
      )}
    </section>
  );
}
```

`ponytail:` "Use the Drive data" replaces local data directly; the copy tells the user to export first. Add an inline auto-export-before-replace call if user testing shows people skip the warning.

- [ ] **Step 3: Register the panel** in the options navigation (the file found in Step 1). Add a "Sync" tab/route rendering `<SyncPanel />`, matching how "Vault"/"Privacy" are registered.

- [ ] **Step 4: Verify in the browser**

Run: `pnpm build && pnpm web-ext`
Then: open the extension Options → Sync tab. With the vault unlocked and `VITE_GOOGLE_OAUTH_CLIENT_ID` set, click Connect (OAuth window opens), then Sync now. Confirm no console errors and the "Last synced" timestamp updates.

- [ ] **Step 5: Commit**

```bash
git add src/options/
pnpm lint && pnpm typecheck && pnpm test
git commit -m "feat(sync): options Sync panel + reconcile dialog"
```

---

### Task 8: Sidebar ActionBar sync button + dirty badge

**Files:**
- Modify: `src/sidebar/` ActionBar component (recently renamed from Footer — find via `grep -rl ActionBar src/sidebar`)
- Modify: the sidebar Zustand store (find via `ls src/sidebar` — the store that already tracks vault/lock state) to expose `syncStatus` + a `runSync` action, or call `invoke` directly if the ActionBar already calls commands inline.
- Test: manual (UI).

**Interfaces:**
- Consumes: `sync.status` / `sync.now` commands, `onBroadcast('state.sync')`, the existing vault-unlock UI to obtain the master password.

- [ ] **Step 1: Read the ActionBar + sidebar store**

Run: `grep -rl "ActionBar" src/sidebar && ls src/sidebar` — open the ActionBar component and the store. Note how existing buttons (create, bulk, open URLs) are wired and how the vault password / unlock state is accessed.

- [ ] **Step 2: Add a Sync button to the ActionBar.** Concrete behavior (adapt to the component's button style + icon set already in use — reuse an existing icon from `@shared/icons` if a sync/refresh glyph exists):

```tsx
// inside the ActionBar component
import { useEffect, useState } from 'react';
import { invoke, onBroadcast } from '@shared/messaging';

function SyncButton({ onNeedPassword }: { onNeedPassword: () => Promise<string | null> }) {
  const [status, setStatus] = useState<{ connected: boolean; unlocked: boolean; dirty: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => invoke({ type: 'sync.status' }).then(setStatus).catch(() => {});
  useEffect(() => { refresh(); return onBroadcast((e) => { if (e.type === 'state.sync') refresh(); }); }, []);

  if (!status?.connected) return null;

  const run = async () => {
    const password = await onNeedPassword();
    if (!password) return;
    setBusy(true);
    try { await invoke({ type: 'sync.now', payload: { password } }); } finally { setBusy(false); }
  };

  return (
    <button
      className="btn btn-icon relative"
      title={status.unlocked ? 'Sync now' : 'Unlock the vault to sync'}
      disabled={busy || !status.unlocked}
      onClick={run}
    >
      {busy ? '⟳' : 'Sync'}
      {status.dirty && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" aria-label="Unsynced changes" />}
    </button>
  );
}
```

`onNeedPassword` reuses the existing vault-unlock prompt: if the vault is unlocked but the UI does not retain the plaintext password, present the same small password prompt the panel uses; otherwise return the cached value. Do not store the password anywhere persistent.

- [ ] **Step 3: Render `<SyncButton />`** in the ActionBar next to the existing actions, wiring `onNeedPassword` to the sidebar's existing unlock flow.

- [ ] **Step 4: Verify in the browser**

Run: `pnpm build && pnpm web-ext`
Then: connect Drive via Options, make a change (add a container) → the dirty dot appears on the sidebar Sync button → click it → dot clears after a successful sync.

- [ ] **Step 5: Commit**

```bash
git add src/sidebar/
pnpm lint && pnpm typecheck && pnpm test
git commit -m "feat(sync): sidebar ActionBar sync button + dirty badge"
```

---

## Final verification

- [ ] `pnpm lint && pnpm typecheck && pnpm test` — all green.
- [ ] `pnpm build:prod && pnpm exec web-ext lint --source-dir=dist` — no blocking AMO errors.
- [ ] Two-profile manual round-trip (docs/QA.md style): profile A adds a container + vault entry → Sync; profile B (same master password) → Sync → both appear. B edits, A deletes a different item → both Sync → no data lost. Different-password profile → reconcile dialog appears, all three branches behave as described.
