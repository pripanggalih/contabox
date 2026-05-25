import { invoke } from '@shared/messaging';
import type { ContainerColor, ContainerIcon } from '@shared/types';
import { expandPattern } from '@shared/utils';
import { Shuffle } from 'lucide-react';
import { useMemo, useState } from 'react';
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

export function BulkCreateDialog({ onClose }: Props) {
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);
  const templates = useContaboxStore((s) => s.templates);
  const workspaces = useContaboxStore((s) => s.workspaces);

  const [count, setCount] = useState(10);
  const [namePattern, setNamePattern] = useState('acme-{n:03}');
  const [hex, setHex] = useState<string>(NATIVE_HEXES.blue);
  const [randomColor, setRandomColor] = useState(false);
  const [icon, setIcon] = useState<ContainerIcon>('briefcase');
  const [customIcon, setCustomIcon] = useState<string | undefined>(undefined);
  const [randomIcon, setRandomIcon] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const previewNames = useMemo(() => {
    const sample = Math.min(count, 5);
    return Array.from({ length: sample }, (_, i) => expandPattern(namePattern, i + 1));
  }, [count, namePattern]);

  const previewSwatches = useMemo(() => {
    if (!randomColor) return [];
    return Array.from({ length: Math.min(count, 5) }, () => randomHex());
  }, [randomColor, count]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const native: ContainerColor = closestNative(hex);
      const isNative = (Object.values(NATIVE_HEXES) as string[]).includes(hex.toLowerCase());

      const created = await invoke({
        type: 'container.bulkCreate',
        payload: {
          count,
          namePattern,
          color: native,
          icon,
          customColor: randomColor || isNative ? undefined : hex,
          customIcon: randomIcon ? undefined : customIcon,
          randomColor,
          randomIcon,
          workspaceId: workspaceId || undefined,
          templateId: templateId || undefined,
          tags: tags.length > 0 ? tags : undefined,
        },
      });
      await refresh();
      pushToast({
        variant: 'success',
        message: `Created ${created.length} containers`,
      });
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: `Bulk create failed: ${String(err)}` });
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Bulk create containers" size="lg" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Count">
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </Field>
          <Field label="Naming pattern">
            <input
              type="text"
              value={namePattern}
              onChange={(e) => setNamePattern(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 font-mono text-sm focus:border-[var(--color-accent)] focus:outline-none"
              maxLength={80}
              spellCheck={false}
              required
            />
          </Field>
        </div>

        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5">
          <div className="mb-1 text-xs text-[var(--color-text-muted)]">Preview</div>
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            {previewNames.map((n, i) => (
              <span
                key={n}
                className="flex items-center gap-1 rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5"
              >
                {randomColor ? (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: previewSwatches[i] ?? hex }}
                  />
                ) : null}
                {n}
              </span>
            ))}
            {count > 5 ? (
              <span className="text-[var(--color-text-muted)]">… {count - 5} more</span>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
            Tokens: <code>{'{n}'}</code> <code>{'{n:03}'}</code> <code>{'{date}'}</code>{' '}
            <code>{'{uuid4:8}'}</code> <code>{'{random:5}'}</code>
          </p>
        </div>

        <fieldset>
          <legend className="mb-1.5 flex w-full items-center justify-between text-xs font-medium text-[var(--color-text-muted)]">
            <span>Color</span>
            <label className="flex items-center gap-1.5 text-[11px] normal-case">
              <input
                type="checkbox"
                checked={randomColor}
                onChange={(e) => setRandomColor(e.target.checked)}
              />
              <Shuffle className="h-3 w-3" />
              Random per container
            </label>
          </legend>
          <div
            className={`grid grid-cols-12 gap-1.5 transition-opacity ${
              randomColor ? 'opacity-40 pointer-events-none' : ''
            }`}
            role="radiogroup"
            aria-label="Color"
            aria-disabled={randomColor}
          >
            {EXTENDED_HEXES.map((c) => {
              const sel = hex.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-checked={sel}
                  role="radio"
                  onClick={() => setHex(c)}
                  className={`h-6 w-6 rounded-full border-2 ${
                    sel ? 'border-[var(--color-text-primary)]' : 'border-transparent'
                  }`}
                  style={{ background: c }}
                />
              );
            })}
          </div>
          {!randomColor ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                aria-label="Custom hex"
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
            </div>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 flex w-full items-center justify-between text-xs font-medium text-[var(--color-text-muted)]">
            <span>Icon</span>
            <label className="flex items-center gap-1.5 text-[11px] normal-case">
              <input
                type="checkbox"
                checked={randomIcon}
                onChange={(e) => setRandomIcon(e.target.checked)}
              />
              <Shuffle className="h-3 w-3" />
              Random per container
            </label>
          </legend>
          <div
            className={`grid grid-cols-13 gap-1 transition-opacity ${
              randomIcon ? 'opacity-40 pointer-events-none' : ''
            }`}
            style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}
            aria-disabled={randomIcon}
          >
            {CONTAINER_ICONS.map((i) => {
              const Icon = iconComponent(i);
              const sel = icon === i && !customIcon;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={i}
                  aria-pressed={sel}
                  onClick={() => {
                    setIcon(i);
                    setCustomIcon(undefined);
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded border ${
                    sel
                      ? 'border-[var(--color-accent)] bg-[var(--color-bg-hover)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                  }`}
                  style={{ color: randomColor ? 'var(--color-text-primary)' : hex }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
          {!randomIcon ? (
            <div className="mt-2">
              <IconPicker
                nativeIcon={icon}
                value={customIcon}
                color={randomColor ? undefined : hex}
                onChange={setCustomIcon}
              />
            </div>
          ) : null}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Workspace (optional)">
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="">— None —</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Template (optional)">
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const tpl = templates.find((t) => t.id === e.target.value);
                if (tpl) {
                  setIcon(tpl.containerSeed.icon);
                  setNamePattern(tpl.containerSeed.namePattern);
                }
              }}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="">— None —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tags (comma-separated)">
          <input
            type="text"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="marketing, affiliate"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
        </Field>

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
            disabled={submitting}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating…' : `Create ${count}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
