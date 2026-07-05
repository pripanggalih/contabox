import { invoke } from '@shared/messaging';
import type { ContainerColor, ContainerIcon } from '@shared/types';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CONTAINER_COLORS, CONTAINER_ICONS, iconComponent, NATIVE_HEXES } from '../lib/palette';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

interface Props {
  onClose: () => void;
}

export function TemplateManagerDialog({ onClose }: Props) {
  const templates = useContaboxStore((s) => s.templates);
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [namePattern, setNamePattern] = useState('acme-{n:03}');
  const [color, setColor] = useState<ContainerColor>('blue');
  const [icon, setIcon] = useState<ContainerIcon>('briefcase');
  const [defaultUrl, setDefaultUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !name.trim()) return;
    setSubmitting(true);
    try {
      await invoke({
        type: 'template.create',
        payload: {
          name: name.trim(),
          containerSeed: { namePattern, color, icon },
          defaultUrl: defaultUrl.trim() || undefined,
          notes: '',
        },
      });
      await refresh();
      setName('');
      setDefaultUrl('');
      pushToast({ variant: 'success', message: 'Template saved' });
    } catch (err) {
      pushToast({ variant: 'error', message: `Save template failed: ${String(err)}` });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await invoke({ type: 'template.delete', payload: { id } });
      await refresh();
    } catch (err) {
      pushToast({ variant: 'error', message: `Delete failed: ${String(err)}` });
    }
  }

  return (
    <Modal title="Templates" size="lg" onClose={onClose}>
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--color-text-muted)]">
            Existing ({templates.length})
          </h3>
          {templates.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              No templates yet. Create one on the right.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {templates.map((t) => {
                const Icon = iconComponent(t.containerSeed.icon);
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-2"
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: NATIVE_HEXES[t.containerSeed.color] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.name}</div>
                      <div className="truncate text-xs text-[var(--color-text-muted)] font-mono">
                        {t.containerSeed.namePattern}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(t.id, t.name)}
                      aria-label={`Delete template ${t.name}`}
                      className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--color-text-muted)]">
            New template
          </h3>
          <form onSubmit={create} className="space-y-3">
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                placeholder="Affiliate Network A"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
              />
            </Field>

            <Field label="Name pattern">
              <input
                type="text"
                value={namePattern}
                onChange={(e) => setNamePattern(e.target.value)}
                maxLength={80}
                required
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 font-mono text-sm focus:border-[var(--color-accent)] focus:outline-none"
              />
            </Field>

            <Field label="Default URL (optional)">
              <input
                type="url"
                value={defaultUrl}
                onChange={(e) => setDefaultUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Color">
                <div className="flex flex-wrap gap-1">
                  {CONTAINER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      aria-pressed={color === c}
                      onClick={() => setColor(c)}
                      className={`h-6 w-6 rounded-full border-2 ${
                        color === c ? 'border-[var(--color-text-primary)]' : 'border-transparent'
                      }`}
                      style={{ background: NATIVE_HEXES[c] }}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Icon">
                <div className="grid grid-cols-7 gap-1">
                  {CONTAINER_ICONS.map((i) => {
                    const Icon = iconComponent(i);
                    const sel = icon === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-label={i}
                        aria-pressed={sel}
                        onClick={() => setIcon(i)}
                        className={`flex h-7 w-7 items-center justify-center rounded border ${
                          sel
                            ? 'border-[var(--color-accent)] bg-[var(--color-bg-hover)]'
                            : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                        }`}
                        style={{ color: NATIVE_HEXES[color] }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="w-full rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save template'}
            </button>
          </form>
        </section>
      </div>
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
