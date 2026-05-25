import { invoke } from '@shared/messaging';
import { useState } from 'react';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

interface Props {
  ids: string[];
  onClose: () => void;
}

export function BulkTagsDialog({ ids, onClose }: Props) {
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);
  const [add, setAdd] = useState('');
  const [remove, setRemove] = useState('');
  const [busy, setBusy] = useState(false);

  function parse(raw: string): string[] {
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const addTags = parse(add);
    const removeTags = parse(remove);
    if (addTags.length === 0 && removeTags.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (addTags.length > 0) {
        await invoke({ type: 'container.bulkAddTags', payload: { ids, tags: addTags } });
      }
      if (removeTags.length > 0) {
        await invoke({ type: 'container.bulkRemoveTags', payload: { ids, tags: removeTags } });
      }
      await refresh();
      pushToast({ variant: 'success', message: `Updated ${ids.length} containers` });
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Tags — ${ids.length} container${ids.length === 1 ? '' : 's'}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Add tags (comma-separated)
          </span>
          <input
            type="text"
            value={add}
            onChange={(e) => setAdd(e.target.value)}
            placeholder="marketing, q4"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Remove tags
          </span>
          <input
            type="text"
            value={remove}
            onChange={(e) => setRemove(e.target.value)}
            placeholder="old, deprecated"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
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
            disabled={busy || (!add.trim() && !remove.trim())}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
