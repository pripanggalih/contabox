import { invoke, onBroadcast } from '@shared/messaging';
import { Download, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Privacy & telemetry settings, plus debug log export. Sits beside the
 * General tab; visible to every user (no vault gate).
 */
export function PrivacyPanel() {
  const [telemetryOptIn, setTelemetryOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [healthIntervalMin, setHealthIntervalMin] = useState(0);

  async function refresh() {
    try {
      const p = await invoke({ type: 'settings.getPrivacy' });
      setTelemetryOptIn(p.telemetryOptIn);
    } catch (err) {
      console.warn('settings.getPrivacy failed', err);
    }
    try {
      const v = (await invoke({
        type: 'meta.get',
        payload: { key: 'proxy.healthIntervalMinutes' },
      })) as number | null;
      setHealthIntervalMin(Number(v ?? 0));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refresh();
    const off = onBroadcast((e) => {
      if (e.type === 'state.privacy') void refresh();
    });
    return off;
  }, []);

  async function toggleTelemetry(next: boolean) {
    setBusy(true);
    try {
      await invoke({ type: 'settings.setTelemetryOptIn', payload: { enabled: next } });
      setTelemetryOptIn(next);
    } finally {
      setBusy(false);
    }
  }

  async function applyHealthInterval(value: number) {
    setBusy(true);
    try {
      await invoke({ type: 'proxy.scheduleHealth', payload: { minutes: value } });
      setHealthIntervalMin(value);
    } finally {
      setBusy(false);
    }
  }

  async function downloadLogs() {
    const text = await invoke({ type: 'settings.exportDebugLogs' });
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contabox-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <header className="mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-base font-semibold">Privacy</h2>
        </header>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Contabox is local-first. Nothing leaves your device unless you explicitly opt in below.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={telemetryOptIn}
            disabled={busy}
            onChange={(e) => void toggleTelemetry(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          Send anonymous, aggregate feature-usage counters (no URLs, no identifiers).
        </label>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="mb-2 text-base font-semibold">Background tasks</h2>
        <label className="flex items-center gap-2 text-sm">
          Scheduled proxy health-check interval (minutes; 0 disables)
          <input
            type="number"
            min={0}
            max={1440}
            value={healthIntervalMin}
            onChange={(e) => setHealthIntervalMin(Number(e.target.value) || 0)}
            onBlur={() => void applyHealthInterval(healthIntervalMin)}
            className="ml-2 w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          When active, every proxy is probed at this interval. After 3 consecutive failures a proxy
          auto-disables.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="mb-2 text-base font-semibold">Diagnostics</h2>
        <button
          type="button"
          onClick={() => void downloadLogs()}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
        >
          <Download className="h-3.5 w-3.5" />
          Export debug logs (JSON)
        </button>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Counts only — never cookies, snapshot bodies, vault data, or open-tab URLs.
        </p>
      </div>
    </section>
  );
}
