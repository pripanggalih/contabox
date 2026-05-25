/**
 * SnapshotEngine — capture and restore browsing state per container.
 *
 * Captures:
 *   - Cookies (via `browser.cookies.getAll({ storeId })`)
 *   - localStorage / sessionStorage (via `scripting.executeScript` per origin)
 *   - IndexedDB (opt-in per container via `ContainerExt.snapshotIncludeIdb`)
 *
 * Origin discovery: walk the cookies, collect unique `domain → origin` set.
 * For tabs already open in the container, we also poll their location origin
 * so we don't miss origins with no cookies (logged-out, localStorage-only).
 *
 * Restore:
 *   - Clear cookies/storage for the snapshot's origins, then re-write captured
 *     values. Storage write requires a tab on that origin; we open one
 *     temporarily if none exists. IDB restore: drop existing dbs of the same
 *     name, re-create stores, replay records.
 *
 * Auto-snapshot lifecycle and retention pruning live in `auto-snapshot.ts`.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import type {
  Snapshot,
  SnapshotCookie,
  SnapshotIdbStore,
  SnapshotIndexedDb,
  SnapshotOrigin,
} from '@shared/types';
import { now, uuid } from '@shared/utils';

interface CookieRow {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'no_restriction' | 'lax' | 'strict' | undefined;
  expirationDate?: number;
  storeId: string;
}

export class SnapshotEngine {
  list(containerId?: string): Promise<Snapshot[]> {
    const t = getDb().snapshots;
    return containerId
      ? t.where('containerId').equals(containerId).reverse().sortBy('createdAt')
      : t.orderBy('createdAt').reverse().toArray();
  }

  async get(id: string): Promise<Snapshot | undefined> {
    return getDb().snapshots.get(id);
  }

  async capture(containerId: string, label: string): Promise<Snapshot> {
    const ext = await getDb().containers.get(containerId);
    const includeIdb = ext?.snapshotIncludeIdb === true;

    const cookies = (await browser.cookies.getAll({
      storeId: containerId,
    })) as unknown as CookieRow[];

    const originSet = new Set<string>();
    for (const c of cookies) {
      const origin = cookieOrigin(c);
      if (origin) originSet.add(origin);
    }
    // Also include open tabs' origins.
    try {
      const tabs = await browser.tabs.query({ cookieStoreId: containerId });
      for (const t of tabs) {
        if (t.url && /^https?:/i.test(t.url)) {
          try {
            originSet.add(new URL(t.url).origin);
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }

    const origins: SnapshotOrigin[] = [];
    for (const origin of originSet) {
      const cookieRows = cookies
        .filter((c) => cookieMatchesOrigin(c, origin))
        .map<SnapshotCookie>((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: (c.sameSite ?? 'no_restriction') as SnapshotCookie['sameSite'],
          expirationDate: c.expirationDate,
        }));

      const storage = await this.captureStorage(containerId, origin, includeIdb);
      origins.push({
        origin,
        cookies: cookieRows,
        localStorage: storage.localStorage,
        sessionStorage: storage.sessionStorage,
        ...(storage.indexedDb ? { indexedDb: storage.indexedDb } : {}),
      });
    }

    const snapshot: Snapshot = {
      id: uuid(),
      containerId,
      label,
      createdAt: now(),
      origins,
      encrypted: false,
    };
    await getDb().snapshots.put(snapshot);
    return snapshot;
  }

  async restore(snapshotId: string): Promise<{ origins: number }> {
    const snap = await getDb().snapshots.get(snapshotId);
    if (!snap) throw new Error('snapshot not found');
    let count = 0;

    for (const origin of snap.origins) {
      // Clear existing cookies for this origin in this container.
      const existing = (await browser.cookies.getAll({
        storeId: snap.containerId,
        url: origin.origin,
      })) as unknown as CookieRow[];
      for (const c of existing) {
        try {
          await browser.cookies.remove({
            storeId: snap.containerId,
            url: cookieUrl(c),
            name: c.name,
            firstPartyDomain: undefined as never,
          });
        } catch {
          /* ignore */
        }
      }
      // Set captured cookies.
      for (const c of origin.cookies) {
        try {
          await browser.cookies.set({
            storeId: snap.containerId,
            url: cookieUrl({ ...c, storeId: snap.containerId }),
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite as never,
            expirationDate: c.expirationDate,
          });
        } catch (err) {
          console.warn('[contabox] cookie set failed', c.name, err);
        }
      }
      // Restore storage via temp tab.
      await this.restoreStorage(snap.containerId, origin);
      count++;
    }
    return { origins: count };
  }

  async delete(id: string): Promise<{ id: string }> {
    await getDb().snapshots.delete(id);
    return { id };
  }

  /**
   * Diff two snapshots, returning per-origin changes for cookies + localStorage.
   */
  async diff(beforeId: string, afterId: string): Promise<SnapshotDiff> {
    const [before, after] = await Promise.all([
      getDb().snapshots.get(beforeId),
      getDb().snapshots.get(afterId),
    ]);
    if (!before || !after) throw new Error('snapshot not found');
    return diffSnapshots(before, after);
  }

  private async captureStorage(
    containerId: string,
    origin: string,
    includeIdb: boolean,
  ): Promise<{
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    indexedDb?: SnapshotIndexedDb[];
  }> {
    const tabs = await browser.tabs.query({ cookieStoreId: containerId });
    const matching = tabs.find((t) => t.url && originOf(t.url) === origin);

    const empty = { localStorage: {}, sessionStorage: {} };
    let tabId = matching?.id;
    let createdTab: number | null = null;

    if (!tabId) {
      try {
        const t = await browser.tabs.create({
          cookieStoreId: containerId,
          url: origin,
          active: false,
        });
        tabId = t.id;
        createdTab = t.id ?? null;
        // Wait briefly for load. document_idle would be better but unreliable.
        await new Promise((r) => setTimeout(r, 1500));
      } catch {
        return empty;
      }
    }
    if (!tabId) return empty;

    try {
      const scripting = (browser as { scripting?: typeof browser.scripting }).scripting;
      if (!scripting?.executeScript) return empty;
      const [result] = await scripting.executeScript({
        target: { tabId },
        args: [includeIdb] as never,
        func: ((withIdb: boolean) => {
          const ls: Record<string, string> = {};
          const ss: Record<string, string> = {};
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k) ls[k] = localStorage.getItem(k) ?? '';
            }
          } catch (e) {
            void e;
          }
          try {
            for (let i = 0; i < sessionStorage.length; i++) {
              const k = sessionStorage.key(i);
              if (k) ss[k] = sessionStorage.getItem(k) ?? '';
            }
          } catch (e) {
            void e;
          }

          if (!withIdb) {
            return { localStorage: ls, sessionStorage: ss };
          }

          // IDB capture (page-world async). We return a Promise; executeScript
          // unwraps it.
          return (async () => {
            const dumps: Array<{
              name: string;
              version: number;
              stores: Array<{
                name: string;
                keyPath: string | string[] | null;
                autoIncrement: boolean;
                records: Array<{ key: unknown; value: unknown }>;
              }>;
            }> = [];
            try {
              const idbAny = indexedDB as unknown as {
                databases?: () => Promise<Array<{ name?: string; version?: number }>>;
              };
              if (typeof idbAny.databases !== 'function') {
                return { localStorage: ls, sessionStorage: ss, indexedDb: dumps };
              }
              const dbList = (await idbAny.databases().catch(() => [])) || [];
              for (const meta of dbList) {
                if (!meta.name) continue;
                const db = await new Promise<IDBDatabase | null>((resolve) => {
                  const req = indexedDB.open(meta.name as string);
                  req.onsuccess = () => resolve(req.result);
                  req.onerror = () => resolve(null);
                  req.onblocked = () => resolve(null);
                });
                if (!db) continue;
                const stores: SnapshotIdbStore[] = [];
                for (const storeName of Array.from(db.objectStoreNames)) {
                  try {
                    const tx = db.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    const records = await new Promise<Array<{ key: unknown; value: unknown }>>(
                      (resolve) => {
                        const out: Array<{ key: unknown; value: unknown }> = [];
                        const cursorReq = store.openCursor();
                        cursorReq.onsuccess = () => {
                          const cursor = cursorReq.result;
                          if (!cursor) return resolve(out);
                          out.push({
                            key: store.keyPath ? null : cursor.key,
                            value: cursor.value,
                          });
                          cursor.continue();
                        };
                        cursorReq.onerror = () => resolve(out);
                      },
                    );
                    stores.push({
                      name: storeName,
                      keyPath: store.keyPath as string | string[] | null,
                      autoIncrement: store.autoIncrement,
                      records,
                    });
                  } catch (err) {
                    void err;
                  }
                }
                dumps.push({ name: meta.name, version: db.version, stores });
                db.close();
              }
            } catch (e) {
              void e;
            }
            return { localStorage: ls, sessionStorage: ss, indexedDb: dumps };
          })();
        }) as never,
      } as never);

      const r =
        (
          result as {
            result?: {
              localStorage: Record<string, string>;
              sessionStorage: Record<string, string>;
              indexedDb?: SnapshotIndexedDb[];
            };
          }
        )?.result ?? empty;
      return r;
    } catch {
      return empty;
    } finally {
      if (createdTab !== null) {
        try {
          await browser.tabs.remove(createdTab);
        } catch {
          /* ignore */
        }
      }
    }
  }

  private async restoreStorage(containerId: string, origin: SnapshotOrigin): Promise<void> {
    const tabs = await browser.tabs.query({ cookieStoreId: containerId });
    const matching = tabs.find((t) => t.url && originOf(t.url) === origin.origin);

    let tabId = matching?.id;
    let createdTab: number | null = null;

    if (!tabId) {
      try {
        const t = await browser.tabs.create({
          cookieStoreId: containerId,
          url: origin.origin,
          active: false,
        });
        tabId = t.id;
        createdTab = t.id ?? null;
        await new Promise((r) => setTimeout(r, 1500));
      } catch {
        return;
      }
    }
    if (!tabId) return;

    try {
      const scripting = (browser as { scripting?: typeof browser.scripting }).scripting;
      if (!scripting?.executeScript) return;
      await scripting.executeScript({
        target: { tabId },
        args: [origin.localStorage, origin.sessionStorage, origin.indexedDb ?? null] as never,
        func: ((
          ls: Record<string, string>,
          ss: Record<string, string>,
          idbDumps: SnapshotIndexedDb[] | null,
        ) => {
          try {
            localStorage.clear();
            for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
          } catch (e) {
            void e;
          }
          try {
            sessionStorage.clear();
            for (const [k, v] of Object.entries(ss)) sessionStorage.setItem(k, v);
          } catch (e) {
            void e;
          }

          if (!idbDumps || idbDumps.length === 0) return;

          return (async () => {
            for (const dump of idbDumps) {
              try {
                // Drop existing db of same name to start clean.
                await new Promise<void>((resolve) => {
                  const req = indexedDB.deleteDatabase(dump.name);
                  req.onsuccess = req.onerror = req.onblocked = () => resolve();
                });
                const db = await new Promise<IDBDatabase | null>((resolve) => {
                  const req = indexedDB.open(dump.name, dump.version);
                  req.onupgradeneeded = () => {
                    const upgrading = req.result;
                    for (const s of dump.stores) {
                      try {
                        upgrading.createObjectStore(s.name, {
                          keyPath: s.keyPath ?? undefined,
                          autoIncrement: s.autoIncrement,
                        });
                      } catch (err) {
                        void err;
                      }
                    }
                  };
                  req.onsuccess = () => resolve(req.result);
                  req.onerror = () => resolve(null);
                  req.onblocked = () => resolve(null);
                });
                if (!db) continue;
                for (const s of dump.stores) {
                  if (!db.objectStoreNames.contains(s.name)) continue;
                  await new Promise<void>((resolve) => {
                    const tx = db.transaction(s.name, 'readwrite');
                    const store = tx.objectStore(s.name);
                    for (const rec of s.records) {
                      try {
                        if (s.keyPath) store.put(rec.value);
                        else store.put(rec.value, rec.key as IDBValidKey);
                      } catch (err) {
                        void err;
                      }
                    }
                    tx.oncomplete = () => resolve();
                    tx.onerror = tx.onabort = () => resolve();
                  });
                }
                db.close();
              } catch (err) {
                void err;
              }
            }
          })();
        }) as never,
      } as never);
    } finally {
      if (createdTab !== null) {
        try {
          await browser.tabs.remove(createdTab);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

/* ---------- helpers ---------- */

function cookieOrigin(c: CookieRow): string | null {
  const domain = c.domain.replace(/^\./, '');
  const protocol = c.secure ? 'https:' : 'http:';
  return `${protocol}//${domain}`;
}

function cookieMatchesOrigin(c: CookieRow, origin: string): boolean {
  return cookieOrigin(c) === origin;
}

function cookieUrl(c: { domain: string; path: string; secure: boolean; storeId: string }): string {
  const protocol = c.secure ? 'https:' : 'http:';
  const domain = c.domain.replace(/^\./, '');
  return `${protocol}//${domain}${c.path}`;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/* ---------- diff ---------- */

export interface SnapshotDiff {
  origins: Array<{
    origin: string;
    cookies: { added: string[]; removed: string[]; changed: string[] };
    localStorage: { added: string[]; removed: string[]; changed: string[] };
  }>;
}

function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const beforeMap = new Map(before.origins.map((o) => [o.origin, o]));
  const afterMap = new Map(after.origins.map((o) => [o.origin, o]));
  const allOrigins = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  const out: SnapshotDiff = { origins: [] };
  for (const origin of allOrigins) {
    const b = beforeMap.get(origin);
    const a = afterMap.get(origin);
    out.origins.push({
      origin,
      cookies: diffNamed(
        new Map((b?.cookies ?? []).map((c) => [c.name, c.value])),
        new Map((a?.cookies ?? []).map((c) => [c.name, c.value])),
      ),
      localStorage: diffNamed(
        new Map(Object.entries(b?.localStorage ?? {})),
        new Map(Object.entries(a?.localStorage ?? {})),
      ),
    });
  }
  return out;
}

function diffNamed(
  before: Map<string, string>,
  after: Map<string, string>,
): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [k, v] of after) {
    if (!before.has(k)) added.push(k);
    else if (before.get(k) !== v) changed.push(k);
  }
  for (const k of before.keys()) {
    if (!after.has(k)) removed.push(k);
  }
  return { added, removed, changed };
}

export const snapshotEngine = new SnapshotEngine();
