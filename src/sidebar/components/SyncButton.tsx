import { browser } from '@shared/browser';
import { invoke, onBroadcast } from '@shared/messaging';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SyncStatus {
  connected: boolean;
  unlocked: boolean;
  dirty: boolean;
}

/**
 * Sidebar Sync shortcut. The sidebar has no master-password UI, so the button
 * opens the Options Sync tab (which owns the password + reconcile flow). A dot
 * badge marks unsynced local changes. Hidden until the user has connected Drive
 * at least once, so first-time setup stays in Options.
 * ponytail: no in-sidebar password prompt — the Options Sync panel already has
 * one; duplicating it would drift. Add a sidebar prompt if users want instant
 * one-click sync without leaving the sidebar.
 */
export function SyncButton() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const refresh = () =>
    invoke({ type: 'sync.status' })
      .then(setStatus)
      .catch(() => setStatus(null));
  useEffect(() => {
    void refresh();
    return onBroadcast((e) => {
      if (e.type === 'state.sync' || e.type === 'state.vault') void refresh();
    });
  }, []);

  if (!status?.connected) return null;

  return (
    <button
      type="button"
      title={
        status.unlocked
          ? status.dirty
            ? 'Unsynced changes — open Sync settings'
            : 'Open Sync settings'
          : 'Unlock the vault (Sync settings) to sync'
      }
      onClick={() => void browser.runtime.openOptionsPage()}
      className="relative flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-xs hover:bg-[var(--color-bg-hover)]"
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      Sync
      {status.dirty ? (
        <span
          className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500"
          aria-label="Unsynced changes"
        />
      ) : null}
    </button>
  );
}
