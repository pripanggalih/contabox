import { invoke } from '@shared/messaging';
import { useState } from 'react';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

interface Props {
  onClose: () => void;
}

const SWATCHES = [
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#6b7280',
];

const ICONS = ['🏢', '🎨', '🧪', '🛒', '🔬', '📚', '💼', '🎮', '🎵', '🏠', '🌐', '🚀'];

export function CreateWorkspaceDialog({ onClose }: Props) {
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0] ?? '#3b82f6');
  const [icon, setIcon] = useState(ICONS[0] ?? '🏢');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !name.trim()) return;
    setSubmitting(true);
    try {
      await invoke({
        type: 'workspace.create',
        payload: { name: name.trim(), color, icon, defaultUrls: [] },
      });
      await refresh();
      pushToast({ variant: 'success', message: `Workspace "${name.trim()}" created` });
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: `Create workspace failed: ${String(err)}` });
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New workspace" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            required
            autoFocus
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Color</legend>
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 ${
                  color === c ? 'border-[var(--color-text-primary)]' : 'border-transparent'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Icon</legend>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                aria-label={i}
                aria-pressed={icon === i}
                onClick={() => setIcon(i)}
                className={`flex h-8 w-8 items-center justify-center rounded border text-lg ${
                  icon === i
                    ? 'border-[var(--color-accent)] bg-[var(--color-bg-hover)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </fieldset>

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
            disabled={submitting || !name.trim()}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
