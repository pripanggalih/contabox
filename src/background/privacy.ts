/**
 * Privacy & telemetry settings.
 *
 * Contabox is local-first. Telemetry is opt-in and limited to anonymous,
 * aggregate counters (e.g. "container.create called N times this week").
 * No URLs, cookies, or identifiers ever leave the device.
 *
 * This module exposes:
 *   - Read/write of the opt-in toggle
 *   - A debug-log export that bundles the most recent console captures and
 *     non-sensitive metadata (no vault, no cookies, no URLs of open tabs).
 */
import { getDb } from '@shared/db';
import { META_TELEMETRY_OPT_IN } from '@shared/meta-keys';
import { now } from '@shared/utils';

export interface PrivacyState {
  telemetryOptIn: boolean;
}

export class PrivacyManager {
  async get(): Promise<PrivacyState> {
    const row = await getDb().meta.get(META_TELEMETRY_OPT_IN);
    return { telemetryOptIn: row?.value === true };
  }

  async setTelemetry(enabled: boolean): Promise<void> {
    await getDb().meta.put({ key: META_TELEMETRY_OPT_IN, value: enabled === true });
  }

  /**
   * Build a JSON debug bundle. Includes:
   *   - Versions
   *   - Counts (containers, workspaces, snapshots, vault entries)
   *   - Recent console messages (best-effort; we keep an in-memory ring)
   *
   * Excludes: cookies, snapshot bodies, vault ciphertext, URLs of open tabs.
   */
  async exportDebugLogs(): Promise<string> {
    const [containers, workspaces, snapshots, vault, proxies, rules] = await Promise.all([
      getDb().containers.count(),
      getDb().workspaces.count(),
      getDb().snapshots.count(),
      getDb().vault.count(),
      getDb().proxies.count(),
      getDb().rules.count(),
    ]);
    const bundle = {
      generatedAt: now(),
      version: '0.1.0',
      counts: { containers, workspaces, snapshots, vault, proxies, rules },
      recentLogs: getLogRing(),
    };
    return JSON.stringify(bundle, null, 2);
  }
}

export const privacy = new PrivacyManager();

/* ---------- in-memory log ring ---------- */

const RING_SIZE = 200;
const ring: Array<{ ts: number; level: string; msg: string }> = [];

/**
 * Wrap console methods so we can replay the last few hundred messages on
 * "Export debug logs". Skipping over `console.debug` to avoid spam.
 */
export function installLogRing(): void {
  const wrap = (level: 'log' | 'info' | 'warn' | 'error') => {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        ring.push({
          ts: Date.now(),
          level,
          msg: args.map((a) => formatArg(a)).join(' '),
        });
        if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
      } catch {
        /* ignore */
      }
      orig(...args);
    };
  };
  wrap('log');
  wrap('info');
  wrap('warn');
  wrap('error');
}

function formatArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function getLogRing(): typeof ring {
  return [...ring];
}
