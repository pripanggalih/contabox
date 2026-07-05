import { describe, expect, it } from 'vitest';
import { syncBundleSchema } from './schemas';
import { EMPTY_BUNDLE, ID_FIELD, MERGE_TABLES } from './sync-types';

describe('sync bundle', () => {
  it('EMPTY_BUNDLE validates', () => {
    expect(syncBundleSchema.safeParse(EMPTY_BUNDLE).success).toBe(true);
  });

  it('rejects a bundle missing an array', () => {
    const bad = { ...EMPTY_BUNDLE } as Record<string, unknown>;
    delete bad.containers;
    expect(syncBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a bundle missing vault identity', () => {
    const bad = { ...EMPTY_BUNDLE } as Record<string, unknown>;
    delete bad.vaultSalt;
    expect(syncBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('containers key on cookieStoreId, others on id', () => {
    expect(ID_FIELD.containers).toBe('cookieStoreId');
    expect(ID_FIELD.workspaces).toBe('id');
    expect(MERGE_TABLES).toContain('vault');
    expect(MERGE_TABLES).not.toContain('snapshots');
  });
});
