/**
 * MAC migration / native-container adoption.
 *
 * Firefox's native Multi-Account Containers (and any other extension that
 * uses `contextualIdentities`) creates containers Contabox doesn't know about.
 * On every startup we silently adopt them by writing default ext rows and
 * assigning them to the auto-managed "Firefox Default" workspace.
 *
 * Contabox-created containers never enter the native workspace — `create()`
 * writes its own ext row before this importer ever sees that cookieStoreId.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import type { ContainerView, NativeContainer, Workspace } from '@shared/types';
import { now, uuid } from '@shared/utils';

const NATIVE_WORKSPACE_NAME = 'Firefox Default';
const NATIVE_WORKSPACE_COLOR = '#7c7c7d';
const NATIVE_WORKSPACE_ICON = '🦊';

export class MacImporter {
  /** Native containers that don't have an ext row yet. */
  async detect(): Promise<{ count: number; native: ContainerView[] }> {
    const natives = (await browser.contextualIdentities.query({})) as unknown as NativeContainer[];
    const exts = await getDb().containers.toArray();
    const known = new Set(exts.map((e) => e.cookieStoreId));
    const orphans = natives.filter((n) => !known.has(n.cookieStoreId));
    const views = orphans.map<ContainerView>((n) => ({
      ...n,
      ext: {
        cookieStoreId: n.cookieStoreId,
        tags: [],
        notes: '',
        isLocked: false,
        autoSnapshot: false,
        order: 0,
        createdAt: now(),
        lastUsedAt: now(),
      },
    }));
    return { count: orphans.length, native: views };
  }

  /**
   * Idempotent — adopt every unknown native container into the "Firefox
   * Default" workspace. Safe to call on every BG startup.
   */
  async import(): Promise<{ imported: number; workspaceId: string }> {
    const workspace = await this.ensureNativeWorkspace();
    const { native } = await this.detect();
    const db = getDb();
    let imported = 0;
    let order = ((await db.containers.orderBy('order').last())?.order ?? -1) + 1;
    for (const n of native) {
      await db.containers.put({
        ...n.ext,
        workspaceId: workspace.id,
        order,
      });
      order++;
      imported++;
    }
    return { imported, workspaceId: workspace.id };
  }

  /**
   * Find or create the "Firefox Default" workspace. Identified by
   * `isNative: true` so users can rename it without breaking the link.
   */
  async ensureNativeWorkspace(): Promise<Workspace> {
    const all = await getDb().workspaces.toArray();
    const existing = all.find((w) => w.isNative === true);
    if (existing) return existing;

    // Always render the native workspace at the top.
    const ws: Workspace = {
      id: uuid(),
      name: NATIVE_WORKSPACE_NAME,
      color: NATIVE_WORKSPACE_COLOR,
      icon: NATIVE_WORKSPACE_ICON,
      defaultUrls: [],
      order: -1,
      collapsed: false,
      isNative: true,
      createdAt: now(),
    };
    await getDb().workspaces.put(ws);
    return ws;
  }
}

export const macImporter = new MacImporter();
