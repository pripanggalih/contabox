/**
 * ContainerManager — single owner of container state.
 *
 * Wraps Firefox's native `contextualIdentities` API and persists extended
 * attributes (workspace assignment, tags, notes, proxy/fingerprint refs,
 * lock state, etc.) in IndexedDB keyed by `cookieStoreId`.
 *
 * Soft-delete: deletes go to a 5-second pending bin so the sidebar can offer
 * an undo toast. After the timer, both the native container and its ext row
 * are removed permanently.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import type {
  CreateContainerInput,
  UpdateContainerInput,
  BulkCreateInput,
  BulkOpenUrlInput,
} from '@shared/schemas';
import type {
  ContainerColor,
  ContainerExt,
  ContainerIcon,
  ContainerView,
  NativeContainer,
} from '@shared/types';
import { expandPattern, now, sleep } from '@shared/utils';
import { closestNativeColor, randomHexColor } from '@shared/color';

const UNDO_WINDOW_MS = 5_000;

interface PendingDelete {
  cookieStoreId: string;
  native: NativeContainer;
  ext: ContainerExt;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class ContainerManager {
  /** In-memory undo bin. Keyed by cookieStoreId of the original (now-deleted) container. */
  private readonly pending = new Map<string, PendingDelete>();

  async list(): Promise<ContainerView[]> {
    const natives = (await browser.contextualIdentities.query({})) as unknown as NativeContainer[];
    const exts = await getDb().containers.toArray();
    const extMap = new Map(exts.map((e) => [e.cookieStoreId, e]));

    const views: ContainerView[] = natives.map((n) => ({
      ...n,
      ext: extMap.get(n.cookieStoreId) ?? this.defaultExt(n.cookieStoreId),
    }));

    // Sort by ext.order (ascending), then lastUsedAt desc as tiebreaker.
    views.sort((a, b) => {
      if (a.ext.order !== b.ext.order) return a.ext.order - b.ext.order;
      return b.ext.lastUsedAt - a.ext.lastUsedAt;
    });

    return views;
  }

  async getView(cookieStoreId: string): Promise<ContainerView | null> {
    try {
      const native = (await browser.contextualIdentities.get(
        cookieStoreId,
      )) as unknown as NativeContainer;
      const ext = (await getDb().containers.get(cookieStoreId)) ?? this.defaultExt(cookieStoreId);
      return { ...native, ext };
    } catch {
      return null;
    }
  }

  async create(input: CreateContainerInput): Promise<ContainerView> {
    const nativeColor = input.customColor ? closestNativeColor(input.customColor) : input.color;

    const native = (await browser.contextualIdentities.create({
      name: input.name,
      color: nativeColor,
      icon: input.icon,
    })) as unknown as NativeContainer;

    const order = await this.nextOrder();
    const ext: ContainerExt = {
      cookieStoreId: native.cookieStoreId,
      workspaceId: input.workspaceId,
      templateId: input.templateId,
      tags: input.tags ?? [],
      notes: input.notes ?? '',
      isLocked: false,
      autoSnapshot: false,
      defaultUrl: input.defaultUrl,
      customColor: input.customColor,
      order,
      createdAt: now(),
      lastUsedAt: now(),
    };
    await getDb().containers.put(ext);

    return { ...native, ext };
  }

  async update(input: UpdateContainerInput): Promise<ContainerView> {
    const { cookieStoreId, ...rest } = input;

    const nativePatch: { name?: string; color?: ContainerColor; icon?: ContainerIcon } = {};
    if (rest.name !== undefined) nativePatch.name = rest.name;
    if (rest.icon !== undefined) nativePatch.icon = rest.icon;
    if (rest.customColor !== undefined && rest.customColor !== null) {
      nativePatch.color = closestNativeColor(rest.customColor);
    } else if (rest.color !== undefined) {
      nativePatch.color = rest.color;
    }

    if (Object.keys(nativePatch).length > 0) {
      await browser.contextualIdentities.update(cookieStoreId, nativePatch);
    }

    const existing =
      (await getDb().containers.get(cookieStoreId)) ?? this.defaultExt(cookieStoreId);

    const next: ContainerExt = {
      ...existing,
      workspaceId: rest.workspaceId === null ? undefined : (rest.workspaceId ?? existing.workspaceId),
      defaultUrl: rest.defaultUrl === null ? undefined : (rest.defaultUrl ?? existing.defaultUrl),
      customColor:
        rest.customColor === null ? undefined : (rest.customColor ?? existing.customColor),
      tags: rest.tags ?? existing.tags,
      notes: rest.notes ?? existing.notes,
      isLocked: rest.isLocked ?? existing.isLocked,
      proxyId: rest.proxyId === null ? undefined : (rest.proxyId ?? existing.proxyId),
      fingerprintId:
        rest.fingerprintId === null ? undefined : (rest.fingerprintId ?? existing.fingerprintId),
      lastUsedAt: existing.lastUsedAt,
    };
    await getDb().containers.put(next);

    const view = await this.getView(cookieStoreId);
    if (!view) throw new Error('container disappeared after update');
    return view;
  }

  /**
   * Soft-delete with undo.
   * Returns `restorable: true` and schedules permanent deletion. Caller must
   * call `restoreDeleted` within {@link UNDO_WINDOW_MS} to undo.
   */
  async delete(cookieStoreId: string): Promise<{ cookieStoreId: string; restorable: boolean }> {
    const view = await this.getView(cookieStoreId);
    if (!view) return { cookieStoreId, restorable: false };

    // Remove from native immediately so tabs in this container don't keep using it.
    await browser.contextualIdentities.remove(cookieStoreId);

    // Stash for undo. We re-create the native identity if user undoes.
    const timeoutId = setTimeout(() => {
      void this.purgePending(cookieStoreId);
    }, UNDO_WINDOW_MS);

    this.pending.set(cookieStoreId, {
      cookieStoreId,
      native: { ...view },
      ext: view.ext,
      timeoutId,
    });

    return { cookieStoreId, restorable: true };
  }

  async restoreDeleted(cookieStoreId: string): Promise<ContainerView> {
    const pending = this.pending.get(cookieStoreId);
    if (!pending) {
      throw new Error('no pending delete for this id (undo window expired)');
    }
    clearTimeout(pending.timeoutId);
    this.pending.delete(cookieStoreId);

    const recreated = (await browser.contextualIdentities.create({
      name: pending.native.name,
      color: pending.native.color,
      icon: pending.native.icon,
    })) as unknown as NativeContainer;

    // The recreated container has a NEW cookieStoreId. Re-key the ext row.
    const newExt: ContainerExt = {
      ...pending.ext,
      cookieStoreId: recreated.cookieStoreId,
    };
    await getDb().containers.put(newExt);

    return { ...recreated, ext: newExt };
  }

  async bulkCreate(input: BulkCreateInput): Promise<ContainerView[]> {
    const out: ContainerView[] = [];
    for (let i = 1; i <= input.count; i++) {
      const name = expandPattern(input.namePattern, i);
      const customColor = input.randomColor
        ? randomHexColor()
        : input.customColor;
      const view = await this.create({
        name,
        color: input.color,
        icon: input.icon,
        customColor,
        workspaceId: input.workspaceId,
        templateId: input.templateId,
        tags: input.tags,
      });
      out.push(view);
    }
    return out;
  }

  async openDefault(
    cookieStoreId: string,
    options: { newWindow?: boolean } = {},
  ): Promise<{ tabId: number }> {
    const view = await this.getView(cookieStoreId);
    if (!view) throw new Error('container not found');
    if (view.ext.isLocked) {
      throw new Error('container is locked — unlock from sidebar');
    }
    const url = view.ext.defaultUrl;

    const tab = options.newWindow
      ? await this.openInNewWindow(url, cookieStoreId)
      : await browser.tabs.create({
          cookieStoreId,
          ...(url ? { url } : {}),
        });

    if (!tab.id) throw new Error('tab create returned no id');
    await getDb().containers.update(cookieStoreId, { lastUsedAt: now() });
    return { tabId: tab.id };
  }

  async setLocked(cookieStoreId: string, locked: boolean): Promise<ContainerView> {
    return this.update({ cookieStoreId, isLocked: locked });
  }

  async lockAll(): Promise<{ count: number }> {
    const all = await getDb().containers.toArray();
    let count = 0;
    for (const c of all) {
      if (!c.isLocked) {
        await getDb().containers.update(c.cookieStoreId, { isLocked: true });
        count++;
      }
    }
    return { count };
  }

  /* ---------- bulk operations on a selection ---------- */

  async bulkDelete(ids: string[]): Promise<{ deleted: number }> {
    let deleted = 0;
    for (const id of ids) {
      try {
        await this.delete(id);
        deleted++;
      } catch (err) {
        console.warn('[contabox] bulkDelete fail', id, err);
      }
    }
    return { deleted };
  }

  async bulkSetLocked(ids: string[], locked: boolean): Promise<{ count: number }> {
    let count = 0;
    for (const id of ids) {
      try {
        await getDb().containers.update(id, { isLocked: locked });
        count++;
      } catch (err) {
        console.warn('[contabox] bulkSetLocked fail', id, err);
      }
    }
    return { count };
  }

  async bulkSetWorkspace(
    ids: string[],
    workspaceId: string | null,
  ): Promise<{ count: number }> {
    let count = 0;
    for (const id of ids) {
      try {
        await getDb().containers.update(id, {
          workspaceId: workspaceId ?? undefined,
        });
        count++;
      } catch (err) {
        console.warn('[contabox] bulkSetWorkspace fail', id, err);
      }
    }
    return { count };
  }

  async bulkAddTags(ids: string[], tags: string[]): Promise<{ count: number }> {
    let count = 0;
    for (const id of ids) {
      try {
        await getDb().containers.update(id, (existing) => {
          const set = new Set([...(existing.tags ?? []), ...tags]);
          existing.tags = [...set];
        });
        count++;
      } catch (err) {
        console.warn('[contabox] bulkAddTags fail', id, err);
      }
    }
    return { count };
  }

  async bulkRemoveTags(ids: string[], tags: string[]): Promise<{ count: number }> {
    const drop = new Set(tags);
    let count = 0;
    for (const id of ids) {
      try {
        await getDb().containers.update(id, (existing) => {
          existing.tags = (existing.tags ?? []).filter((t) => !drop.has(t));
        });
        count++;
      } catch (err) {
        console.warn('[contabox] bulkRemoveTags fail', id, err);
      }
    }
    return { count };
  }

  async bulkSetProxy(ids: string[], proxyId: string | null): Promise<{ count: number }> {
    let count = 0;
    for (const id of ids) {
      try {
        await this.update({ cookieStoreId: id, proxyId });
        count++;
      } catch (err) {
        console.warn('[contabox] bulkSetProxy fail', id, err);
      }
    }
    return { count };
  }

  async bulkSetFingerprint(
    ids: string[],
    fingerprintId: string | null,
  ): Promise<{ count: number }> {
    let count = 0;
    for (const id of ids) {
      try {
        await this.update({ cookieStoreId: id, fingerprintId });
        count++;
      } catch (err) {
        console.warn('[contabox] bulkSetFingerprint fail', id, err);
      }
    }
    return { count };
  }

  /** Close every open tab belonging to any of the listed containers. */
  async bulkHibernate(ids: string[]): Promise<{ closed: number }> {
    const idSet = new Set(ids);
    const tabs = await browser.tabs.query({});
    const targets = tabs
      .filter((t) => t.cookieStoreId && idSet.has(t.cookieStoreId))
      .map((t) => t.id)
      .filter((n): n is number => typeof n === 'number');
    if (targets.length > 0) await browser.tabs.remove(targets);
    return { closed: targets.length };
  }

  /** Open each container's default URL (or a blank tab) for the whole selection. */
  async bulkOpenDefault(
    ids: string[],
    options: { newWindow?: boolean; staggerMs?: number } = {},
  ): Promise<{ opened: number }> {
    let opened = 0;
    const stagger = options.staggerMs ?? 0;
    for (const id of ids) {
      try {
        await this.openDefault(id, { newWindow: options.newWindow });
        opened++;
      } catch (err) {
        console.warn('[contabox] bulkOpenDefault fail', id, err);
      }
      if (stagger > 0 && id !== ids.at(-1)) await sleep(stagger);
    }
    return { opened };
  }

  async bulkOpenUrl(input: BulkOpenUrlInput): Promise<{ opened: number }> {
    let opened = 0;
    for (const cookieStoreId of input.containerIds) {
      try {
        if (input.newWindow) {
          await this.openInNewWindow(input.url, cookieStoreId);
        } else {
          await browser.tabs.create({ cookieStoreId, url: input.url, active: false });
        }
        opened++;
      } catch (err) {
        console.warn(`[contabox] bulkOpenUrl failed for ${cookieStoreId}:`, err);
      }
      if (input.staggerMs > 0 && cookieStoreId !== input.containerIds.at(-1)) {
        await sleep(input.staggerMs);
      }
    }
    return { opened };
  }

  // ---- internals --------------------------------------------------------

  private async openInNewWindow(
    url: string | undefined,
    cookieStoreId: string,
  ): Promise<browser.tabs.Tab> {
    const win = await browser.windows.create({ incognito: false });
    // Replace the auto-created tab with one in the target container.
    const blank = win.tabs?.[0];
    const created = await browser.tabs.create({
      windowId: win.id,
      cookieStoreId,
      ...(url ? { url } : {}),
    });
    if (blank?.id && blank.id !== created.id) {
      try {
        await browser.tabs.remove(blank.id);
      } catch {
        /* ignore */
      }
    }
    return created;
  }

  private async purgePending(cookieStoreId: string): Promise<void> {
    this.pending.delete(cookieStoreId);
    await getDb().containers.delete(cookieStoreId);
  }

  private async nextOrder(): Promise<number> {
    const last = await getDb().containers.orderBy('order').last();
    return (last?.order ?? -1) + 1;
  }

  private defaultExt(cookieStoreId: string): ContainerExt {
    return {
      cookieStoreId,
      tags: [],
      notes: '',
      isLocked: false,
      autoSnapshot: false,
      order: 0,
      createdAt: now(),
      lastUsedAt: now(),
    };
  }
}

export const containerManager = new ContainerManager();
