import { invoke } from '@shared/messaging';
import { Lock, Unlock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOptionsStore } from '../state/store';

export function VaultPanel() {
  const vault = useOptionsStore((s) => s.vault);
  const refresh = useOptionsStore((s) => s.refresh);

  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        The vault encrypts proxy passwords (and later, vault credentials, TOTP secrets) at rest with
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
        <button
          type="button"
          onClick={lock}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
        >
          Lock now
        </button>
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
