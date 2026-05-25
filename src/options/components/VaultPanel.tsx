import { invoke } from '@shared/messaging';
import { Download, Lock, Unlock, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useOptionsStore } from '../state/store';

export function VaultPanel() {
  const vault = useOptionsStore((s) => s.vault);
  const refresh = useOptionsStore((s) => s.refresh);

  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Change-master-password sub-form
  const [showChange, setShowChange] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');

  // Import file input ref
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPw, setImportPw] = useState('');
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function initialize(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError('Password must be ≥ 8 characters.');
      return;
    }
    if (pw !== pwConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await invoke({ type: 'vault.initialize', payload: { password: pw } });
      await refresh();
      setPw('');
      setPwConfirm('');
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await invoke({ type: 'vault.unlock', payload: { password: pw } });
      await refresh();
      setPw('');
    } catch (err) {
      setError('Wrong password.');
      void err;
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    await invoke({ type: 'vault.lock' });
    await refresh();
  }

  async function changeMaster(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPw.length < 8) {
      setError('New password must be ≥ 8 characters.');
      return;
    }
    if (newPw !== newPwConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await invoke({ type: 'vault.changeMasterPassword', payload: { newPassword: newPw } });
      setNewPw('');
      setNewPwConfirm('');
      setShowChange(false);
      await refresh();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function exportVault() {
    setError(null);
    setBusy(true);
    try {
      const envelope = await invoke({ type: 'vault.export' });
      const blob = new Blob([JSON.stringify(envelope, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contabox-vault-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
      const envelope = JSON.parse(text);
      setPendingImport(envelope);
      setImportPw('');
      setError(null);
    } catch (err) {
      setError(`Invalid file: ${String(err)}`);
    } finally {
      e.target.value = '';
    }
  }

  async function commitImport() {
    if (!pendingImport) return;
    setBusy(true);
    setError(null);
    try {
      const r = await invoke({
        type: 'vault.import',
        payload: { envelope: pendingImport, password: importPw },
      });
      setPendingImport(null);
      setImportPw('');
      await refresh();
      alert(`Imported ${r.imported} entr${r.imported === 1 ? 'y' : 'ies'}.`);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] p-4">
      <header className="mb-3 flex items-center gap-2">
        {vault.unlocked ? (
          <Unlock className="h-4 w-4 text-[var(--color-success)]" aria-hidden="true" />
        ) : (
          <Lock className="h-4 w-4" aria-hidden="true" />
        )}
        <h2 className="text-base font-semibold">Vault</h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {vault.initialized ? (vault.unlocked ? 'Unlocked' : 'Locked') : 'Not initialized'}
        </span>
      </header>

      <p className="mb-3 text-sm text-[var(--color-text-muted)]">
        The vault encrypts proxy passwords, vault credentials, and TOTP secrets at rest with
        AES-GCM-256 / PBKDF2-600k. Master password is held in memory only and cleared when Firefox
        closes.
      </p>

      {error ? (
        <div className="mb-3 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}

      {!vault.initialized ? (
        <form onSubmit={initialize} className="space-y-2">
          <Field label="Master password (≥ 8 chars)">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </Field>
          <Field label="Confirm">
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </Field>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            Initialize vault
          </button>

          <div className="mt-4 border-t border-[var(--color-border)] pt-3">
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">
              Or import a previously-exported vault:
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void onPickFile(e)}
              className="text-sm"
            />
            {pendingImport ? (
              <div className="mt-2 space-y-1">
                <input
                  type="password"
                  placeholder="Master password used at export time"
                  value={importPw}
                  onChange={(e) => setImportPw(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !importPw}
                  onClick={() => void commitImport()}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  Import vault
                </button>
              </div>
            ) : null}
          </div>
        </form>
      ) : !vault.unlocked ? (
        <form onSubmit={unlock} className="flex items-end gap-2">
          <Field label="Master password" className="flex-1">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </Field>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            Unlock
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={lock}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
            >
              Lock now
            </button>
            <button
              type="button"
              onClick={() => setShowChange((v) => !v)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
            >
              Change master password
            </button>
            <button
              type="button"
              onClick={() => void exportVault()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)] disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              Export vault
            </button>
            <label className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]">
              <Upload className="h-3.5 w-3.5" />
              Import vault
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => void onPickFile(e)}
                className="hidden"
              />
            </label>
          </div>

          {showChange ? (
            <form
              onSubmit={changeMaster}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
            >
              <p className="mb-2 text-xs text-[var(--color-text-muted)]">
                All vault entries are re-encrypted under the new password. Make sure no other
                Contabox window is mid-operation.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="New password">
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field label="Confirm">
                  <input
                    type="password"
                    value={newPwConfirm}
                    onChange={(e) => setNewPwConfirm(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm"
                  />
                </Field>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? 'Re-encrypting…' : 'Update password'}
              </button>
            </form>
          ) : null}

          {pendingImport ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void commitImport();
              }}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
            >
              <p className="mb-2 text-xs text-[var(--color-text-muted)]">
                Importing replaces the local vault. Provide the master password used at export time.
              </p>
              <input
                type="password"
                placeholder="Master password"
                value={importPw}
                onChange={(e) => setImportPw(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !importPw}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  Replace vault
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingImport(null);
                    setImportPw('');
                  }}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
