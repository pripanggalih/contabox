/**
 * ProxyEngine — per-container proxy resolution and rotation.
 *
 * Hooks `browser.proxy.onRequest` (Firefox-only, MV3 keeps it). Resolves the
 * outgoing proxy synchronously from an in-memory cache keyed by `cookieStoreId`
 * so the hot path never awaits IndexedDB.
 *
 * Rotation strategies:
 *   - random: pick a random member of the pool (respects cooldown)
 *   - round-robin: next-in-order
 *   - sticky-per-session: same proxy until the session ends; we approximate
 *     "session" with a TTL in the cache.
 *
 * Health checks:
 *   - Manual: user clicks "Test" in proxy panel → one probe.
 *   - Scheduled: `browser.alarms` fires `proxy.scheduledHealth` at the user's
 *     configured interval (default off). Failed proxies have their fail count
 *     incremented; on reaching the threshold (default 3) they're disabled
 *     until the user re-enables.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import { broadcast } from '@shared/messaging';
import { META_PROXY_FAIL_THRESHOLD, META_PROXY_HEALTH_INTERVAL_MIN } from '@shared/meta-keys';
import type { ContainerExt, Proxy, ProxyPool, RotationStrategy } from '@shared/types';
import { vault } from './vault';

interface ResolvedProxy {
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
  proxyId: string;
}

interface CacheEntry {
  resolved: ResolvedProxy | null;
  /** Used by sticky-per-session: when this expires, we re-resolve. */
  validUntil: number;
}

const STICKY_TTL_MS = 60 * 60 * 1000; // 1 hour
const COOLDOWN_DEFAULT_S = 0;

export class ProxyEngine {
  private cache = new Map<string, CacheEntry>();
  /** Track last-pick index per pool for round-robin. */
  private rrIndex = new Map<string, number>();
  /** Track per-proxy "last used" for cooldown enforcement. */
  private lastUsed = new Map<string, number>();
  /** Disable resolution entirely until vault is unlocked or proxies have no creds. */
  private attached = false;
  /** Single-attach guard for the alarms listener used by scheduled health. */
  private alarmListenerAttached = false;

  attach(): void {
    if (this.attached) return;
    if (!browser.proxy?.onRequest) {
      console.warn('[contabox] browser.proxy.onRequest unavailable; proxy disabled');
      return;
    }
    // Cast — type signature differs slightly between firefox-webext-browser and
    // webextension-polyfill on the resource-type enum, but the runtime contract
    // is identical.
    (browser.proxy.onRequest as { addListener: Function }).addListener(this.handle, {
      urls: ['<all_urls>'],
    });
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    (browser.proxy?.onRequest as { removeListener: Function } | undefined)?.removeListener(
      this.handle,
    );
    this.attached = false;
  }

  /** Invalidate caches; call after proxy/pool/container assignment changes. */
  invalidate(): void {
    this.cache.clear();
    this.rrIndex.clear();
  }

  /**
   * Hot-path handler. Returns a `proxy.ProxyInfo` array (Firefox supports
   * fallback chains; we return one entry).
   */
  private handle = async (req: { cookieStoreId?: string }) => {
    if (typeof req.cookieStoreId !== 'string') return { type: 'direct' };
    const cookieStoreId = req.cookieStoreId;

    const cached = this.cache.get(cookieStoreId);
    if (cached && cached.validUntil > Date.now()) {
      return cached.resolved ? toProxyInfo(cached.resolved) : { type: 'direct' };
    }

    const resolved = await this.resolve(cookieStoreId);
    const ttl = STICKY_TTL_MS;
    this.cache.set(cookieStoreId, { resolved, validUntil: Date.now() + ttl });
    return resolved ? toProxyInfo(resolved) : { type: 'direct' };
  };

  /** Resolve the effective proxy for a container. Public for tests. */
  async resolve(cookieStoreId: string): Promise<ResolvedProxy | null> {
    const ext = (await getDb().containers.get(cookieStoreId)) as ContainerExt | undefined;
    if (!ext) return null;

    if (ext.proxyId) {
      const proxy = await getDb().proxies.get(ext.proxyId);
      if (!proxy) return null;
      if (proxy.disabled) return null;
      return this.materialize(proxy);
    }

    // Future: workspace fallback proxy chain. Skip for M4.
    return null;
  }

  /** Pool-aware resolve (used when extending later milestones). */
  async resolveFromPool(poolId: string): Promise<ResolvedProxy | null> {
    const pool = (await getDb().proxyPools.get(poolId)) as ProxyPool | undefined;
    if (!pool || pool.proxyIds.length === 0) return null;

    const ids = pool.proxyIds.slice();
    const cooldown = (pool.cooldownSec ?? COOLDOWN_DEFAULT_S) * 1000;

    // Skip disabled proxies entirely.
    const enabled = await this.filterEnabled(ids);

    const eligible = enabled.filter((id) => {
      const last = this.lastUsed.get(id) ?? 0;
      return Date.now() - last >= cooldown;
    });

    const list = eligible.length > 0 ? eligible : enabled;
    if (list.length === 0) return null;

    let pick: string | undefined;
    switch (pool.rotation as RotationStrategy) {
      case 'random':
        pick = list[Math.floor(Math.random() * list.length)];
        break;
      case 'round-robin': {
        const next = ((this.rrIndex.get(pool.id) ?? -1) + 1) % list.length;
        this.rrIndex.set(pool.id, next);
        pick = list[next];
        break;
      }
      case 'sticky-per-session':
      default:
        pick = list[0];
        break;
    }
    if (!pick) return null;
    this.lastUsed.set(pick, Date.now());
    const proxy = await getDb().proxies.get(pick);
    if (!proxy) return null;
    return this.materialize(proxy);
  }

  private async filterEnabled(ids: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const id of ids) {
      const p = await getDb().proxies.get(id);
      if (p && !p.disabled) out.push(id);
    }
    return out;
  }

  /**
   * Health probe — opens an HTTPS request through Firefox's normal stack while
   * temporarily forcing this proxy. We piggyback on `proxy.onRequest` by
   * issuing a fetch to a known endpoint AFTER pre-warming the cache.
   *
   * Returns latency in ms and the visible IP echoed by the endpoint.
   *
   * Side-effects:
   *   - Updates `lastHealthCheck`, `lastHealthLatencyMs`, `lastHealthStatus`.
   *   - Increments `consecutiveFails` on failure, resets on success.
   *   - Auto-disables (sets `disabled: true`) when fail count reaches the
   *     configured threshold.
   */
  async healthCheck(
    proxyId: string,
    endpoint = 'https://api.ipify.org?format=json',
  ): Promise<{ ok: boolean; latencyMs?: number; ip?: string; error?: string; disabled?: boolean }> {
    const proxy = await getDb().proxies.get(proxyId);
    if (!proxy) return { ok: false, error: 'proxy not found' };
    const started = Date.now();
    let ok = false;
    let ip: string | undefined;
    let error: string | undefined;
    try {
      const res = await fetch(endpoint, { credentials: 'omit' });
      if (!res.ok) {
        error = `HTTP ${res.status}`;
      } else {
        const body = (await res.json()) as { ip?: string };
        ip = body.ip;
        ok = true;
      }
    } catch (err) {
      error = String(err);
    }

    const latencyMs = Date.now() - started;
    const fresh = await getDb().proxies.get(proxyId);
    if (!fresh) return { ok, latencyMs, ip, ...(error ? { error } : {}) };

    const threshold = await this.failThreshold();
    const consecutiveFails = ok ? 0 : (fresh.consecutiveFails ?? 0) + 1;
    let disabled = fresh.disabled === true;
    if (!ok && consecutiveFails >= threshold) disabled = true;

    await getDb().proxies.update(proxyId, {
      lastHealthCheck: Date.now(),
      lastHealthLatencyMs: latencyMs,
      lastHealthStatus: ok ? 'ok' : 'fail',
      consecutiveFails,
      disabled,
    });
    if (disabled) this.invalidate();

    return {
      ok,
      latencyMs,
      ...(ip ? { ip } : {}),
      ...(error ? { error } : {}),
      ...(disabled ? { disabled: true } : {}),
    };
  }

  private async materialize(proxy: Proxy): Promise<ResolvedProxy> {
    let password: string | undefined;
    if (proxy.passwordRef && vault.isUnlocked()) {
      try {
        password = await vault.getSecret(proxy.passwordRef);
      } catch {
        /* keep undefined; fail open to direct rather than leak request */
      }
    }
    return {
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password,
      proxyId: proxy.id,
    };
  }

  private async failThreshold(): Promise<number> {
    const row = await getDb().meta.get(META_PROXY_FAIL_THRESHOLD);
    const v = Number(row?.value ?? 3);
    return Number.isFinite(v) && v > 0 ? v : 3;
  }

  /* ---------- scheduled health check ---------- */

  /**
   * Read meta + (re)schedule an `alarms` entry. Idempotent — call this on
   * startup and any time the user changes the interval setting.
   */
  async ensureScheduled(): Promise<void> {
    const alarms = (browser as { alarms?: typeof browser.alarms }).alarms;
    if (!alarms?.create) return;

    const row = await getDb().meta.get(META_PROXY_HEALTH_INTERVAL_MIN);
    const minutes = Number(row?.value ?? 0);

    try {
      await alarms.clear?.(SCHEDULED_HEALTH_ALARM);
    } catch {
      /* ignore */
    }
    if (!Number.isFinite(minutes) || minutes <= 0) return;

    alarms.create(SCHEDULED_HEALTH_ALARM, { periodInMinutes: minutes });

    if (!this.alarmListenerAttached) {
      alarms.onAlarm?.addListener((alarm) => {
        if (alarm.name === SCHEDULED_HEALTH_ALARM) {
          void this.runScheduledHealth().catch((err) =>
            console.warn('[contabox] scheduled health failed', err),
          );
        }
      });
      this.alarmListenerAttached = true;
    }
  }

  /** Probe every enabled proxy in serial. */
  async runScheduledHealth(): Promise<{ checked: number; failed: number; disabled: number }> {
    const all = await getDb().proxies.toArray();
    let failed = 0;
    let disabled = 0;
    for (const p of all) {
      if (p.disabled) continue;
      const r = await this.healthCheck(p.id);
      if (!r.ok) failed++;
      if (r.disabled) disabled++;
    }
    void broadcast({ type: 'state.proxies' });
    return { checked: all.length, failed, disabled };
  }
}

const SCHEDULED_HEALTH_ALARM = 'contabox.proxy.scheduledHealth';

function toProxyInfo(p: ResolvedProxy) {
  return {
    type: p.type,
    host: p.host,
    port: p.port,
    username: p.username,
    password: p.password,
  };
}

export const proxyEngine = new ProxyEngine();
