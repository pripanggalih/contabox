import { invoke, onBroadcast } from '@shared/messaging';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOptionsStore } from '../state/store';

interface SyncStatus {
  connected: boolean;
  unlocked: boolean;
  dirty: boolean;
  includeSnapshots: boolean;
  lastSyncedAt: number | null;
  blobSize: number | null;
}

export function SyncPanel() {
  const vault = useOptionsStore((s) => s.vault);
  const refresh = useOptionsStore((s) => s.refresh);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = async () => {
    try {
      setStatus(await invoke({ type: 'sync.status' }));
    } catch {
      /* engine not ready yet */
    }
  };
  useEffect(() => {
    void refreshStatus();
    return onBroadcast((e) => {
      if (e.type === 'state.sync') void refreshStatus();
    });
  }, []);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke({ type: 'sync.connect' });
      void refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await invoke({ type: 'sync.now', payload: { password } });
      if (r.conflict === 'password-mismatch') {
        setConflict(true);
      } else {
        setPassword('');
        void refresh();
      }
      void refreshStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (choice: 'use-remote' | 'push-local') => {
    setBusy(true);
    setError(null);
    try {
      await invoke({ type: 'sync.resolveConflict', payload: { choice, password } });
      setConflict(false);
      setPassword('');
      void refresh();
      void refreshStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <p className="text-sm opacity-70">Loading…</p>;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Sync (Google Drive)</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Your data is encrypted on this device before it leaves. Google stores only ciphertext —
          your master password never leaves your computer.
        </p>
      </header>

      {!status.connected ? (
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void connect()}
        >
          <Cloud size={14} /> Connect Google Drive
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            Connected. Last synced:{' '}
            {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'never'}.
          </p>
          {status.blobSize != null && (
            <p className="text-sm text-[var(--color-text-muted)]">
              Backup size: {(status.blobSize / 1024).toFixed(1)} KB
            </p>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={status.includeSnapshots}
              disabled={busy}
              onChange={(e) =>
                void invoke({
                  type: 'sync.setIncludeSnapshots',
                  payload: { on: e.target.checked },
                }).then(refreshStatus)
              }
            />
            <span>
              <strong>Include snapshots (cookies).</strong> Moves live login sessions across
              devices, so a tab opens already signed in elsewhere. Off by default — snapshots can be
              tens of MB, making the backup much larger and syncs slower.
            </span>
          </label>

          {!status.unlocked && (
            <p className="text-sm text-amber-600">Unlock the vault (Vault tab) to sync.</p>
          )}

          <form className="flex items-center gap-2" onSubmit={syncNow}>
            <input
              type="password"
              className="input"
              placeholder="Master password"
              value={password}
              disabled={busy || !vault.unlocked}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={busy || !vault.unlocked || password.length < 8}
            >
              <RefreshCw size={14} /> Sync now
            </button>
          </form>

          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            disabled={busy}
            onClick={() => void invoke({ type: 'sync.disconnect' }).then(refreshStatus)}
          >
            <CloudOff size={14} /> Disconnect
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {conflict && (
        <div role="dialog" aria-label="Sync reconcile" className="space-y-3 rounded-md border p-4">
          <h3 className="font-semibold">
            This Google Drive already has Contabox data from another setup.
          </h3>
          <p className="text-sm">
            The backup on Drive uses a different master password than this device. They can&apos;t
            be merged automatically because each is encrypted with its own password. Choose how to
            continue:
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void resolve('use-remote')}
            >
              Use the Drive data — replace this device&apos;s data with the synced data.
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void resolve('push-local')}
            >
              Push this device&apos;s data to Drive — overwrite the other setup&apos;s backup.
            </button>
            <button
              type="button"
              className="text-sm text-[var(--color-text-muted)]"
              disabled={busy}
              onClick={() => setConflict(false)}
            >
              Cancel — leave both untouched.
            </button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            “Use the Drive data” asks for the backup’s master password and replaces local data.
            Export an encrypted backup first (Vault tab) if you have local-only changes.
          </p>
        </div>
      )}

      <style>{`.btn { border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-bg-primary); padding: 6px 10px; font-size: 13px; }
        .btn:hover { background: var(--color-bg-secondary); }`}</style>
    </section>
  );
}
