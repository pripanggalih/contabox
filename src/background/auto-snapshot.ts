/**
 * Auto-snapshot lifecycle.
 *
 * Two triggers:
 *   1. `contextualIdentities.onRemoved` — when a container is *deleted*, take
 *      a final snapshot first (if `autoSnapshot` flag is set) so the user can
 *      restore state into a freshly recreated container later.
 *   2. Last tab in a container closing — take a "session-end" snapshot. This
 *      runs from `tabs.onRemoved`; we keep a per-container active-tab counter
 *      so we don't fire mid-session when the user closes a single tab among
 *      many.
 *
 * Retention pruning runs:
 *   - On every auto-snapshot insert (cheap; one query).
 *   - Periodically via a chrome.alarms entry (default daily) so retention
 *     applies even when no new snapshots are taken.
 *
 * Per-container `retentionDays` overrides the global default; 0 = forever.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import { broadcast } from '@shared/messaging';
import { META_AUTO_SNAPSHOT_RETENTION } from '@shared/meta-keys';
import { now } from '@shared/utils';
import { snapshotEngine } from './snapshot-engine';

const PRUNE_ALARM = 'contabox.autosnapshot.prune';
const PRUNE_INTERVAL_MIN = 24 * 60; // daily

export class AutoSnapshotEngine {
  private attached = false;
  /** cookieStoreId → number of currently-open tabs we know about. */
  private tabCount = new Map<string, number>();

  async attach(): Promise<void> {
    if (this.attached) return;
    await this.bootstrapTabCounts();

    // Note: pre-delete snapshots are taken in `containerManager.delete` since
    // `contextualIdentities.onRemoved` fires AFTER the cookie store is gone,
    // making cookie/storage capture impossible. Native-side removals (user
    // deletes from about:preferences) skip auto-snapshot — by design.

    const tabs = (browser as { tabs?: typeof browser.tabs }).tabs;
    if (tabs?.onCreated?.addListener) {
      tabs.onCreated.addListener((tab) => {
        if (tab.cookieStoreId) {
          this.tabCount.set(tab.cookieStoreId, (this.tabCount.get(tab.cookieStoreId) ?? 0) + 1);
        }
      });
    }
    if (tabs?.onRemoved?.addListener) {
      tabs.onRemoved.addListener(async (tabId, info) => {
        // Track count by querying *before* the listener fires would be ideal
        // but Firefox already removed it; we maintain our own counter.
        // We don't know which container the closing tab belonged to from the
        // event alone — `tabs.get` will fail for removed tabs. Solution:
        // re-query open tabs and detect any container that dropped to zero.
        await this.afterTabRemoved(tabId, info);
      });
    }

    // Periodic prune alarm.
    const alarms = (browser as { alarms?: typeof browser.alarms }).alarms;
    if (alarms?.create) {
      alarms.create(PRUNE_ALARM, { periodInMinutes: PRUNE_INTERVAL_MIN });
      alarms.onAlarm?.addListener((alarm) => {
        if (alarm.name === PRUNE_ALARM) {
          void this.pruneAll().catch((err) => console.warn('[contabox] prune failed', err));
        }
      });
    }

    this.attached = true;
  }

  private async afterTabRemoved(_tabId: number, _info: unknown): Promise<void> {
    void _tabId;
    void _info;
    // Re-bootstrap counters and detect transitions to zero.
    const before = new Map(this.tabCount);
    await this.bootstrapTabCounts();
    for (const [csid, prev] of before) {
      const after = this.tabCount.get(csid) ?? 0;
      if (prev > 0 && after === 0) {
        await this.onContainerWentIdle(csid).catch((err) =>
          console.warn('[contabox] autoSnapshot idle handler failed', err),
        );
      }
    }
  }

  private async onContainerWentIdle(cookieStoreId: string): Promise<void> {
    const ext = await getDb().containers.get(cookieStoreId);
    if (!ext?.autoSnapshot) return;
    await snapshotEngine.capture(cookieStoreId, `auto · idle ${formatDate(now())}`);
    void broadcast({ type: 'state.snapshots' });
    await this.prune(cookieStoreId);
  }

  /**
   * Remove auto-snapshots beyond the retention window for one container. Only
   * trims rows whose label starts with `auto · ` so manually-labelled
   * snapshots are never pruned.
   */
  async prune(containerId: string): Promise<{ deleted: number }> {
    const ext = await getDb().containers.get(containerId);
    const days = await this.retentionDays(ext?.retentionDays);
    if (days <= 0) return { deleted: 0 };

    const cutoff = now() - days * 24 * 60 * 60 * 1000;
    const candidates = await getDb().snapshots.where('containerId').equals(containerId).toArray();
    const toDelete = candidates.filter(
      (s) => s.createdAt < cutoff && s.label.startsWith('auto · '),
    );
    for (const s of toDelete) await getDb().snapshots.delete(s.id);
    if (toDelete.length > 0) void broadcast({ type: 'state.snapshots' });
    return { deleted: toDelete.length };
  }

  /** Walk every container with autoSnapshot=true and prune old auto entries. */
  async pruneAll(): Promise<{ deleted: number }> {
    // Boolean indices in IndexedDB are awkward across runtimes; just scan.
    const all = await getDb().containers.toArray();
    const targets = all.filter((c) => c.autoSnapshot);
    let deleted = 0;
    for (const c of targets) {
      const r = await this.prune(c.cookieStoreId);
      deleted += r.deleted;
    }
    return { deleted };
  }

  private async retentionDays(perContainer: number | undefined): Promise<number> {
    if (perContainer !== undefined && perContainer >= 0) return perContainer;
    const row = await getDb().meta.get(META_AUTO_SNAPSHOT_RETENTION);
    const v = Number(row?.value ?? 30);
    return Number.isFinite(v) && v >= 0 ? v : 30;
  }

  private async bootstrapTabCounts(): Promise<void> {
    try {
      const tabs = await browser.tabs.query({});
      const counts = new Map<string, number>();
      for (const t of tabs) {
        if (!t.cookieStoreId) continue;
        counts.set(t.cookieStoreId, (counts.get(t.cookieStoreId) ?? 0) + 1);
      }
      this.tabCount = counts;
    } catch {
      /* ignore */
    }
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export const autoSnapshotEngine = new AutoSnapshotEngine();
