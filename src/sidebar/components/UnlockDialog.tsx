import { invoke } from '@shared/messaging';
import type { ContainerView } from '@shared/types';
import { useEffect, useState } from 'react';
import { Modal } from './Modal';

interface Props {
  view: ContainerView;
  onUnlocked: () => void;
  onClose: () => void;
}

/**
 * Modal that prompts for the credential to unlock a container's
 * session-locked state. The BG decides whether the container expects a PIN
 * or a master-password unlock; we ask for the PIN first if available, then
 * fall back to master password.
 */
export function UnlockDialog({ view, onUnlocked, onClose }: Props) {
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const status = await invoke({
          type: 'lock.status',
          payload: { cookieStoreId: view.cookieStoreId },
        });
        setHasPin(status.hasPin);
      } catch {
        /* default: master password mode */
      }
    })();
  }, [view.cookieStoreId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await invoke({
        type: 'lock.unlock',
        payload: {
          cookieStoreId: view.cookieStoreId,
          ...(hasPin ? { pin } : { masterPassword }),
        },
      });
      onUnlocked();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Unlock — ${view.name}`} size="sm" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          {hasPin
            ? 'This container is protected by a PIN.'
            : 'Unlock with the global vault master password.'}
        </p>
        {error ? (
          <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        ) : null}
        {hasPin ? (
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
        ) : (
          <input
            type="password"
            autoFocus
            placeholder="Master password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (hasPin ? pin.length < 4 : masterPassword.length < 1)}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
