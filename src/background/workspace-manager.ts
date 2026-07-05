/**
 * WorkspaceManager — logical grouping of containers.
 *
 * A container belongs to ≤ 1 workspace via `ContainerExt.workspaceId`.
 * Workspaces themselves carry display metadata and a list of `defaultUrls`
 * opened by the "Open all" action.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import type { WorkspaceInput } from '@shared/schemas';
import type { Workspace } from '@shared/types';
import { now, uuid } from '@shared/utils';
import { lockManager } from './lock-manager';

export class WorkspaceManager {
  async list(): Promise<Workspace[]> {
    return getDb().workspaces.orderBy('order').toArray();
  }

  async create(input: WorkspaceInput): Promise<Workspace> {
    const order = ((await getDb().workspaces.orderBy('order').last())?.order ?? -1) + 1;
    const ws: Workspace = {
      id: uuid(),
      name: input.name,
      color: input.color,
      icon: input.icon,
      defaultUrls: input.defaultUrls ?? [],
      order,
      collapsed: false,
      createdAt: now(),
    };
    await getDb().workspaces.put(ws);
    return ws;
  }

  async update(
    id: string,
    patch: Partial<WorkspaceInput> & { collapsed?: boolean; order?: number },
  ): Promise<Workspace> {
    const existing = await getDb().workspaces.get(id);
    if (!existing) throw new Error('workspace not found');
    const next: Workspace = {
      ...existing,
      name: patch.name ?? existing.name,
      color: patch.color ?? existing.color,
      icon: patch.icon ?? existing.icon,
      defaultUrls: patch.defaultUrls ?? existing.defaultUrls,
      collapsed: patch.collapsed ?? existing.collapsed,
      order: patch.order ?? existing.order,
    };
    await getDb().workspaces.put(next);
    return next;
  }

  async delete(id: string, orphanContainers = true): Promise<{ id: string }> {
    if (orphanContainers) {
      await getDb()
        .containers.where('workspaceId')
        .equals(id)
        .modify((c) => {
          c.workspaceId = undefined;
        });
    }
    await getDb().workspaces.delete(id);
    return { id };
  }

  async openAll(id: string): Promise<{ opened: number }> {
    const ws = await getDb().workspaces.get(id);
    if (!ws) throw new Error('workspace not found');
    const containers = await getDb().containers.where('workspaceId').equals(id).toArray();

    let opened = 0;
    for (const c of containers) {
      const url = c.defaultUrl ?? ws.defaultUrls[0];
      try {
        // Skip locked containers — opening would expose their cookies.
        await lockManager.assertOpenAllowed(c.cookieStoreId);
        await browser.tabs.create({
          cookieStoreId: c.cookieStoreId,
          active: false,
          ...(url ? { url } : {}),
        });
        opened++;
      } catch (err) {
        console.warn('[contabox] workspace.openAll fail', c.cookieStoreId, err);
      }
    }
    return { opened };
  }

  async hibernate(id: string): Promise<{ closed: number }> {
    const containers = await getDb().containers.where('workspaceId').equals(id).toArray();
    const ids = new Set(containers.map((c) => c.cookieStoreId));

    const tabs = await browser.tabs.query({});
    const toClose = tabs.filter((t) => t.cookieStoreId && ids.has(t.cookieStoreId));
    const tabIds = toClose.map((t) => t.id).filter((n): n is number => typeof n === 'number');

    if (tabIds.length > 0) await browser.tabs.remove(tabIds);
    return { closed: tabIds.length };
  }
}

export const workspaceManager = new WorkspaceManager();
