import { Shuffle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@shared/messaging';
import type { ContainerColor, ContainerIcon } from '@shared/types';
import {
  CONTAINER_ICONS,
  EXTENDED_HEXES,
  NATIVE_HEXES,
  closestNative,
  iconComponent,
  randomHex,
} from '../lib/palette';
import { useContaboxStore } from '../state/store';
import { IconPicker } from './IconPicker';
import { Modal } from './Modal';

interface Props {
  onClose: () => void;
}

export function CreateContainerDialog({ onClose }: Props) {
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [hex, setHex] = useState<string>(NATIVE_HEXES.blue);
  const [icon, setIcon] = useState<ContainerIcon>('fingerprint');
  const [customIcon, setCustomIcon] = useState<string | undefined>(undefined);
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

    const native: ContainerColor = closestNative(hex);
    const isNative = (Object.values(NATIVE_HEXES) as string[]).includes(hex.toLowerCase());

    try {
      await invoke({
        type: 'container.create',
        payload: {
          name: name.trim(),
          color: native,
          icon,
          customColor: isNative ? undefined : hex,
          customIcon,
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
          <legend className="mb-1.5 flex w-full items-center justify-between text-xs font-medium text-[var(--color-text-muted)]">
            <span>Color</span>
            <button
              type="button"
              onClick={() => setHex(randomHex())}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]"
            >
              <Shuffle className="h-3 w-3" />
              Random
            </button>
          </legend>
          <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Color">
            {EXTENDED_HEXES.map((c) => {
              const selected = hex.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={c}
                  onClick={() => setHex(c)}
                  className={[
                    'h-7 w-7 rounded-full border-2 transition',
                    selected
                      ? 'scale-110 border-[var(--color-text-primary)]'
                      : 'border-transparent hover:scale-105',
                  ].join(' ')}
                  style={{ background: c }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              aria-label="Custom hex color"
              className="h-7 w-10 cursor-pointer rounded border border-[var(--color-border)] bg-transparent"
            />
            <input
              type="text"
              value={hex}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setHex(v);
              }}
              maxLength={7}
              spellCheck={false}
              className="w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1 font-mono text-xs uppercase focus:border-[var(--color-accent)] focus:outline-none"
            />
            <span className="text-[10px] text-[var(--color-text-muted)]">
              snaps to <strong>{closestNative(hex)}</strong> in tab strip
            </span>
          </div>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">
            Icon
          </legend>
          <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Icon">
            {CONTAINER_ICONS.map((i) => {
              const Icon = iconComponent(i);
              const selected = icon === i && !customIcon;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={i}
                  onClick={() => {
                    setIcon(i);
                    setCustomIcon(undefined);
                  }}
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-md border transition',
                    selected
                      ? 'border-[var(--color-accent)] bg-[var(--color-bg-hover)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]',
                  ].join(' ')}
                  style={{ color: hex }}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
          <div className="mt-2">
            <IconPicker
              nativeIcon={icon}
              value={customIcon}
              color={hex}
              onChange={setCustomIcon}
            />
            <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
              Picking a custom icon only affects sidebar/popup. Firefox's tab strip
              still uses the native glyph above.
            </p>
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
