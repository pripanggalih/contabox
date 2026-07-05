import { invoke } from '@shared/messaging';
import type { ContainerColor, ContainerIcon } from '@shared/types';
import { useEffect, useRef, useState } from 'react';
import { CONTAINER_COLORS, CONTAINER_ICONS, iconComponent, NATIVE_HEXES } from '../lib/palette';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

interface Props {
  onClose: () => void;
}

export function CreateContainerDialog({ onClose }: Props) {
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState<ContainerColor>('blue');
  const [icon, setIcon] = useState<ContainerIcon>('fingerprint');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);

    try {
      await invoke({
        type: 'container.create',
        payload: {
          name: name.trim(),
          color,
          icon,
        },
      });
      await refresh();
      pushToast({ variant: 'success', message: `Container "${name.trim()}" created` });
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: `Create failed: ${String(err)}` });
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New container" size="sm" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Name
          </span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            placeholder="acme-prod"
            spellCheck={false}
            required
          />
        </label>

        <fieldset className="mb-3">
          <legend className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">
            Color
          </legend>
          <div className="grid grid-cols-9 gap-1.5" role="radiogroup" aria-label="Color">
            {CONTAINER_COLORS.map((c) => {
              const selected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={[
                    'h-7 w-7 rounded-full border-2 transition',
                    selected
                      ? 'scale-110 border-[var(--color-text-primary)]'
                      : 'border-transparent hover:scale-105',
                  ].join(' ')}
                  style={{ background: NATIVE_HEXES[c] }}
                />
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">
            Icon
          </legend>
          <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Icon">
            {CONTAINER_ICONS.map((i) => {
              const Icon = iconComponent(i);
              const selected = icon === i;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={i}
                  onClick={() => setIcon(i)}
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-md border transition',
                    selected
                      ? 'border-[var(--color-accent)] bg-[var(--color-bg-hover)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]',
                  ].join(' ')}
                  style={{ color: NATIVE_HEXES[color] }}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
