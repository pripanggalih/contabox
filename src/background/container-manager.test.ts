import { containerManager } from '@bg/container-manager';
import { describe, expect, it } from 'vitest';

describe('ContainerManager', () => {
  it('creates and lists a container', async () => {
    const view = await containerManager.create({
      name: 'acme-prod',
      color: 'blue',
      icon: 'briefcase',
    });
    expect(view.name).toBe('acme-prod');
    expect(view.color).toBe('blue');
    expect(view.ext.tags).toEqual([]);

    const list = await containerManager.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.cookieStoreId).toBe(view.cookieStoreId);
  });

  it('renames a container via update', async () => {
    const created = await containerManager.create({
      name: 'old',
      color: 'blue',
      icon: 'briefcase',
    });
    const updated = await containerManager.update({
      cookieStoreId: created.cookieStoreId,
      name: 'new',
    });
    expect(updated.name).toBe('new');
  });

  it('soft-deletes and restores within undo window', async () => {
    const created = await containerManager.create({
      name: 'temp',
      color: 'red',
      icon: 'briefcase',
    });
    const del = await containerManager.delete(created.cookieStoreId);
    expect(del.restorable).toBe(true);

    const restored = await containerManager.restoreDeleted(created.cookieStoreId);
    expect(restored.name).toBe('temp');
    // Restore creates a NEW native id; old id no longer valid
    expect(restored.cookieStoreId).not.toBe(created.cookieStoreId);
  });

  it('bulk-creates with name pattern tokens', async () => {
    const created = await containerManager.bulkCreate({
      count: 5,
      namePattern: 'acme-{n:03}',
      color: 'green',
      icon: 'briefcase',
      randomColor: false,
      randomIcon: false,
    });
    expect(created).toHaveLength(5);
    expect(created.map((c) => c.name)).toEqual([
      'acme-001',
      'acme-002',
      'acme-003',
      'acme-004',
      'acme-005',
    ]);
  });
});
