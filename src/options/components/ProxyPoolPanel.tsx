import { invoke } from '@shared/messaging';
import type { Proxy, ProxyPool, RotationStrategy } from '@shared/types';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useOptionsStore } from '../state/store';

export function ProxyPoolPanel() {
  const pools = useOptionsStore((s) => s.proxyPools);
  const proxies = useOptionsStore((s) => s.proxies);
  const refresh = useOptionsStore((s) => s.refresh);

  const [showAdd, setShowAdd] = useState(false);

  return (
    <section className="rounded-lg border border-[var(--color-border)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Proxy pools</h2>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          <Plus className="h-3.5 w-3.5" />
          New pool
        </button>
      </header>

      {showAdd ? <PoolForm proxies={proxies} onDone={() => setShowAdd(false)} /> : null}

      {pools.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No pools yet. Group proxies into pools to use rotation strategies.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {pools.map((pool) => (
            <PoolRow key={pool.id} pool={pool} proxies={proxies} onChange={refresh} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PoolRow({
  pool,
  proxies,
  onChange,
}: {
  pool: ProxyPool;
  proxies: Proxy[];
  onChange: () => Promise<void>;
}) {
  const memberLabels = pool.proxyIds
    .map((id) => proxies.find((p) => p.id === id)?.label)
    .filter((s): s is string => !!s);

  async function remove() {
    if (!confirm(`Delete pool "${pool.name}"?`)) return;
    await invoke({ type: 'proxyPool.delete', payload: { id: pool.id } });
    await onChange();
  }

  return (
    <li className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-mono text-xs">
          {pool.rotation}
        </span>
        <span className="flex-1 truncate font-medium">{pool.name}</span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {pool.proxyIds.length} proxies · cooldown {pool.cooldownSec}s
        </span>
        <button
          type="button"
          onClick={remove}
          aria-label="Delete pool"
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {memberLabels.length > 0 ? (
        <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
          {memberLabels.join(', ')}
        </p>
      ) : null}
    </li>
  );
}

function PoolForm({ proxies, onDone }: { proxies: Proxy[]; onDone: () => void }) {
  const refresh = useOptionsStore((s) => s.refresh);

  const [name, setName] = useState('');
  const [rotation, setRotation] = useState<RotationStrategy>('round-robin');
  const [cooldownSec, setCooldownSec] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await invoke({
        type: 'proxyPool.create',
        payload: {
          name: name.trim(),
          rotation,
          cooldownSec,
          proxyIds: [...selected],
        },
      });
      await refresh();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-4 space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
    >
      <div className="grid grid-cols-12 gap-3">
        <Field label="Name" className="col-span-5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
          />
        </Field>
        <Field label="Rotation" className="col-span-4">
          <select
            value={rotation}
            onChange={(e) => setRotation(e.target.value as RotationStrategy)}
            className="input"
          >
            <option value="random">random</option>
            <option value="round-robin">round-robin</option>
            <option value="sticky-per-session">sticky-per-session</option>
          </select>
        </Field>
        <Field label="Cooldown (s)" className="col-span-3">
          <input
            type="number"
            min={0}
            max={86_400}
            value={cooldownSec}
            onChange={(e) => setCooldownSec(Number(e.target.value) || 0)}
            className="input"
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">
          Members ({selected.size}/{proxies.length})
        </legend>
        <div className="max-h-40 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          {proxies.length === 0 ? (
            <p className="p-2 text-xs text-[var(--color-text-muted)]">Add proxies first.</p>
          ) : (
            <ul>
              {proxies.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-[var(--color-bg-hover)]">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="truncate">{p.label}</span>
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">
                      {p.host}:{p.port}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
