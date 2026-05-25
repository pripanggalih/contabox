import { invoke, onBroadcast } from '@shared/messaging';
import { Download, Lock, Shield, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Privacy & telemetry settings, plus debug log export. Sits beside the
 * General tab; visible to every user (no vault gate).
 */
export function PrivacyPanel() {
  const [telemetryOptIn, setTelemetryOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [healthIntervalMin, setHealthIntervalMin] = useState(0);

  // Backup state
  const [backupPassword, setBackupPassword] = useState('');
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [pendingImportEncrypted, setPendingImportEncrypted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function exportBackup(encrypted: boolean) {
    setError(null);
    setBusy(true);
    try {
      const bundle = encrypted
        ? await invoke({
            type: 'backup.exportEncrypted',
            payload: { password: backupPassword },
          })
        : await invoke({ type: 'backup.exportPlain' });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `contabox-backup-${encrypted ? 'enc-' : ''}${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupPassword('');
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { encrypted?: boolean };
      setPendingImport(parsed);
      setPendingImportEncrypted(parsed.encrypted === true);
      setImportPassword('');
      setError(null);
    } catch (err) {
      setError(`Invalid file: ${String(err)}`);
    } finally {
      e.target.value = '';
    }
  }

  async function commitImport() {
    if (!pendingImport) return;
    if (
      !confirm(
        'This will REPLACE every container, workspace, snapshot, vault entry, and rule with the contents of the backup. Continue?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await invoke({
        type: 'backup.import',
        payload: {
          bundle: pendingImport,
          ...(pendingImportEncrypted ? { password: importPassword } : {}),
        },
      });
      setPendingImport(null);
      setImportPassword('');
      alert(`Restored ${r.restored} rows. Re-unlock the vault from the Vault tab.`);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
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

      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <header className="mb-2 flex items-center gap-2">
          <Lock className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-base font-semibold">Backup &amp; restore</h2>
        </header>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Full snapshot of every container, workspace, snapshot, proxy, fingerprint, rule, and vault
          entry. Restore is destructive — it replaces your current data. Vault entries are always
          individually encrypted; "Encrypted backup" wraps the whole bundle on top of that, suitable
          for cloud storage.
        </p>

        {error ? (
          <div className="mb-3 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportBackup(false)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)] disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              Plain backup
            </button>
            <label className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]">
              <Upload className="h-3.5 w-3.5" />
              Restore from file
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => void onPickFile(e)}
                className="hidden"
              />
            </label>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">
              Encrypted backup uses your master vault password.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="password"
                placeholder="Master password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                autoComplete="current-password"
                className="flex-1 min-w-[180px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void exportBackup(true)}
                disabled={busy || backupPassword.length < 8}
                className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                Encrypted backup
              </button>
            </div>
          </div>

          {pendingImport ? (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
              <p className="mb-2 text-xs text-[var(--color-text-muted)]">
                Selected backup file.{' '}
                {pendingImportEncrypted
                  ? 'This bundle is encrypted — provide the master password used at export time.'
                  : 'This is a plain bundle.'}
              </p>
              {pendingImportEncrypted ? (
                <input
                  type="password"
                  placeholder="Master password used at export"
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  className="mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm"
                />
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void commitImport()}
                  disabled={busy || (pendingImportEncrypted && !importPassword)}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  Replace data with this backup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingImport(null);
                    setImportPassword('');
                  }}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
