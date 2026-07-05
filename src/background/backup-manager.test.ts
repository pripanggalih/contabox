import { _resetDb, getDb } from '@shared/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { backupManager } from './backup-manager';

async function wipeDb(): Promise<void> {
  _resetDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('contabox');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

function container(id: string, notes: string, updatedAt: number) {
  return {
    cookieStoreId: id,
    notes,
    tags: [],
    isLocked: false,
    autoSnapshot: false,
    createdAt: 1,
    lastUsedAt: 1,
    updatedAt,
  } as never;
}

describe('BackupManager merge import', () => {
  beforeEach(wipeDb);

  it('folds newest-wins and keeps local-only rows (no data loss)', async () => {
    // Device A exports two containers.
    await getDb().containers.bulkPut([
      container('c1', 'A-one-v1', 10),
      container('c2', 'A-two', 10),
    ]);
    const bundle = await backupManager.exportPlain();

    // Device B: c1 edited more recently, plus a local-only c3. Import A's bundle.
    await wipeDb();
    await getDb().containers.bulkPut([
      container('c1', 'B-one-v2', 20), // newer than A's c1 → wins
      container('c3', 'B-three', 5), // local-only → survives
    ]);
    const r = await backupManager.import(bundle, undefined, 'merge');

    const all = await getDb().containers.toArray();
    const byId = new Map(all.map((c) => [c.cookieStoreId, c.notes]));
    expect(byId.get('c1')).toBe('B-one-v2'); // local newer kept
    expect(byId.get('c2')).toBe('A-two'); // incoming-only added
    expect(byId.get('c3')).toBe('B-three'); // local-only preserved
    expect(all).toHaveLength(3);
    expect(r.restored).toBe(1); // only c2 was written (c1 lost the tie-break)
  });

  it('lets an older incoming row lose to a newer local row', async () => {
    await getDb().containers.put(container('c1', 'old', 1));
    const bundle = await backupManager.exportPlain();

    await wipeDb();
    await getDb().containers.put(container('c1', 'new', 99));
    await backupManager.import(bundle, undefined, 'merge');

    expect((await getDb().containers.get('c1'))?.notes).toBe('new');
  });
});
