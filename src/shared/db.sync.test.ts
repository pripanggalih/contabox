import { beforeEach, describe, expect, it } from 'vitest';
import {
  _resetDb,
  clearSyncDirty,
  getDb,
  isSyncDirty,
  SYNCED_TABLES,
  setSuppressSyncStamp,
} from './db';

describe('sync hooks', () => {
  beforeEach(() => {
    _resetDb();
    clearSyncDirty();
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
    expect(isSyncDirty()).toBe(true);
  });

  it('preserves updatedAt and does not mark dirty while suppressed', async () => {
    clearSyncDirty();
    const db = getDb();
    setSuppressSyncStamp(true);
    await db.workspaces.put({
      id: 'w2',
      name: 'B',
      order: 0,
      createdAt: 1,
      updatedAt: 42,
    } as never);
    setSuppressSyncStamp(false);
    const row = await db.workspaces.get('w2');
    expect((row as { updatedAt: number }).updatedAt).toBe(42);
    expect(isSyncDirty()).toBe(false);
  });
});
