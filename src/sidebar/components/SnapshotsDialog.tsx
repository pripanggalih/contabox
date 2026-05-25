import { invoke } from '@shared/messaging';
import type { ContainerView, Snapshot } from '@shared/types';
import { Camera, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

interface Props {
  view: ContainerView;
  onClose: () => void;
}

export function SnapshotsDialog({ view, onClose }: Props) {
  const pushToast = useContaboxStore((s) => s.pushToast);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const list = await invoke({
      type: 'snapshot.list',
      payload: { containerId: view.cookieStoreId },
    });
    setSnapshots(list);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function capture(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await invoke({
        type: 'snapshot.capture',
        payload: { containerId: view.cookieStoreId, label: label.trim() || 'Manual' },
      });
      setLabel('');
      await refresh();
      pushToast({ variant: 'success', message: 'Snapshot saved' });
    } catch (err) {
      pushToast({ variant: 'error', message: `Capture failed: ${String(err)}` });
    } finally {
      setBusy(false);
    }
  }

  async function restore(s: Snapshot) {
    if (
      !confirm(
        `Restore "${s.label}"? This overwrites cookies and storage for ${s.origins.length} origin(s).`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await invoke({ type: 'snapshot.restore', payload: { snapshotId: s.id } });
      pushToast({ variant: 'success', message: `Restored ${r.origins} origins` });
    } catch (err) {
      pushToast({ variant: 'error', message: `Restore failed: ${String(err)}` });
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Snapshot) {
    if (!confirm(`Delete snapshot "${s.label}"?`)) return;
    await invoke({ type: 'snapshot.delete', payload: { id: s.id } });
    await refresh();
  }

  return (
    <Modal title={`Snapshots — ${view.name}`} size="lg" onClose={onClose}>
      <form onSubmit={capture} className="mb-4 flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Label
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="logged-in fresh"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          <Camera className="h-3.5 w-3.5" />
          {busy ? 'Capturing…' : 'Capture'}
        </button>
      </form>

      {snapshots.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No snapshots yet. Snapshots capture cookies + localStorage so you can restore a session
          later.
        </p>
      ) : (
        <ul className="space-y-1">
          {snapshots.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.label}</div>
                <div className="truncate text-xs text-[var(--color-text-muted)]">
                  {new Date(s.createdAt).toLocaleString()} · {s.origins.length} origin(s)
                  {' · '}
                  {s.origins.reduce((acc, o) => acc + o.cookies.length, 0)} cookies
                </div>
              </div>
              <button
                type="button"
                onClick={() => restore(s)}
                aria-label="Restore"
                title="Restore"
                disabled={busy}
                className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label="Delete"
                className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
