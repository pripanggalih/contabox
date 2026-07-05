import { invoke } from '@shared/messaging';
import type { ContainerColor, ContainerIcon } from '@shared/types';
import { useState } from 'react';
import { CONTAINER_COLORS, CONTAINER_ICONS, iconComponent, NATIVE_HEXES } from '../lib/palette';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

interface Props {
  onClose: () => void;
}

export function CreateWorkspaceDialog({ onClose }: Props) {
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [color, setColor] = useState<ContainerColor>('blue');
  const [icon, setIcon] = useState<ContainerIcon>('briefcase');
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
            {CONTAINER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 ${
                  color === c ? 'border-[var(--color-text-primary)]' : 'border-transparent'
                }`}
                style={{ background: NATIVE_HEXES[c] }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">Icon</legend>
          <div className="flex flex-wrap gap-1.5">
            {CONTAINER_ICONS.map((i) => {
              const Icon = iconComponent(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={i}
                  aria-pressed={icon === i}
                  onClick={() => setIcon(i)}
                  className={`flex h-8 w-8 items-center justify-center rounded border ${
                    icon === i
                      ? 'border-[var(--color-accent)] bg-[var(--color-bg-hover)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                  }`}
                  style={{ color: NATIVE_HEXES[color] }}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
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
