import { invoke } from '@shared/messaging';
import { useState } from 'react';
import { displayHex, displayIcon } from '../lib/palette';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

interface Props {
  initialContainerIds?: string[];
  onClose: () => void;
}

export function BulkOpenUrlDialog({ initialContainerIds, onClose }: Props) {
  const containers = useContaboxStore((s) => s.containers);
  const pushToast = useContaboxStore((s) => s.pushToast);

  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialContainerIds ?? containers.map((c) => c.cookieStoreId)),
  );
  const [newWindow, setNewWindow] = useState(false);
  const [staggerMs, setStaggerMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (selected.size === 0) {
      pushToast({ variant: 'error', message: 'Pick at least one container.' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await invoke({
        type: 'container.bulkOpenUrl',
        payload: {
          url,
          containerIds: Array.from(selected),
          newWindow,
          staggerMs,
        },
      });
      pushToast({
        variant: 'success',
        message: `Opened in ${result.opened} container${result.opened === 1 ? '' : 's'}`,
      });
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: `Bulk open failed: ${String(err)}` });
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Bulk open URL" size="lg" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">URL</span>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            spellCheck={false}
          />
        </label>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">
            Containers ({selected.size}/{containers.length})
          </legend>
          <div className="max-h-64 overflow-y-auto rounded-md border border-[var(--color-border)]">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-xs">
              <button
                type="button"
                onClick={() => setSelected(new Set(containers.map((c) => c.cookieStoreId)))}
                className="text-[var(--color-accent)] hover:underline"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[var(--color-accent)] hover:underline"
              >
                None
              </button>
            </div>
            <ul>
              {containers.map((c) => {
                const Icon = displayIcon(c);
                const checked = selected.has(c.cookieStoreId);
                return (
                  <li key={c.cookieStoreId}>
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.cookieStoreId)}
                      />
                      <Icon className="h-3.5 w-3.5" style={{ color: displayHex(c) }} />
                      <span className="truncate">{c.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newWindow}
              onChange={(e) => setNewWindow(e.target.checked)}
            />
            Open in new window
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--color-text-muted)]">Stagger (ms)</span>
            <input
              type="number"
              min={0}
              max={60000}
              step={50}
              value={staggerMs}
              onChange={(e) => setStaggerMs(Number(e.target.value) || 0)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !url || selected.size === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Opening…' : `Open in ${selected.size}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
