import { _resetDb, clearSyncDirty, getDb } from '@shared/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { SyncEngine } from './sync-engine';
import { vault } from './vault';

// In-memory Drive stub matching the DriveClient surface the engine uses.
class StubDrive {
  blob = '';
  rev = 'r0';
  size = 0;
  async authorize() {
    return 'tok';
  }
  async findOrCreateFile() {
    return 'file-1';
  }
  async getMeta() {
    return { headRevisionId: this.rev, size: this.size };
  }
  async download() {
    return this.blob;
  }
  async upload(_t: string, _f: string, body: string) {
    this.blob = body;
    this.size = body.length;
    this.rev = `r${Number(this.rev.slice(1)) + 1}`;
    return { headRevisionId: this.rev };
  }
}

async function initVault(pw: string) {
  await vault.initialize(pw);
}

/** Wipe the underlying IDB db + JS singleton so the next `getDb()` starts empty
 *  (simulates a fresh device). `_resetDb()` alone only nulls the singleton; the
 *  fake-indexeddb db 'contabox' persists within a single test. */
async function wipeDb(): Promise<void> {
  _resetDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('contabox');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

describe('SyncEngine', () => {
  let drive: StubDrive;
  let engine: SyncEngine;
  beforeEach(async () => {
    _resetDb();
    clearSyncDirty();
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
    await getDb().containers.put({
      cookieStoreId: 'c1',
      name: 'One',
      createdAt: 1,
      lastUsedAt: 1,
      updatedAt: 1,
    } as never);
    await engine.sync('pw123456'); // push to stub Drive

    // Simulate a second device: fresh DB, adopt the blob.
    wipeDb();
    vault.lock();
    await getDb().meta.put({ key: 'sync.fileId', value: 'file-1' });
    const engine2 = new SyncEngine(drive as never);
    await initVault('pw123456'); // same password
    const res = await engine2.sync('pw123456');
    expect(res.conflict).toBeUndefined();
    const c = await getDb().containers.get('c1');
    expect((c as unknown as { name: string }).name).toBe('One');
  });

  it('flags a password mismatch instead of writing', async () => {
    await initVault('pw123456');
    await getDb().containers.put({
      cookieStoreId: 'c1',
      name: 'One',
      createdAt: 1,
      lastUsedAt: 1,
      updatedAt: 1,
    } as never);
    await engine.sync('pw123456');

    wipeDb();
    vault.lock();
    await getDb().meta.put({ key: 'sync.fileId', value: 'file-1' });
    const engine2 = new SyncEngine(drive as never);
    await initVault('different-pw'); // different master password
    const res = await engine2.sync('different-pw');
    expect(res.conflict).toBe('password-mismatch');
    expect(await getDb().containers.get('c1')).toBeUndefined(); // nothing written
  });
});
