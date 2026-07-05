import { describe, expect, it } from 'vitest';
import { diffToApply, mergeBundles } from './sync-merge';
import { EMPTY_BUNDLE, type SyncBundle } from './sync-types';

const ws = (id: string, name: string, updatedAt: number) =>
  ({ id, name, order: 0, createdAt: 0, updatedAt }) as never;

const bundle = (workspaces: unknown[]): SyncBundle =>
  ({
    ...EMPTY_BUNDLE,
    workspaces: workspaces as never,
    vaultSalt: 's',
    vaultVerifier: { cipher: 'c', iv: 'i' },
  }) as SyncBundle;

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
    expect((m.workspaces[0] as { name: string }).name).toBe('remote');
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
    expect((m.workspaces[0] as { name: string }).name).toBe('edited');
  });

  it('fresh create on one side is kept', () => {
    const base = bundle([]);
    const local = bundle([ws('a', 'A', 3)]);
    const remote = bundle([]);
    const m = mergeBundles(base, local, remote);
    expect(m.workspaces).toHaveLength(1);
  });
});

describe('diffToApply', () => {
  it('lists base ids that did not survive the merge', () => {
    const base = bundle([ws('a', 'A', 1), ws('b', 'B', 1)]);
    const merged = bundle([ws('a', 'A', 1)]); // b deleted
    const d = diffToApply(base, merged);
    expect(d.workspaces).toEqual(['b']);
  });
});
