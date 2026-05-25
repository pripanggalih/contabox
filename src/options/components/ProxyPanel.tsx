import { invoke } from '@shared/messaging';
import type { ProxyType } from '@shared/types';
import { Activity, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useOptionsStore } from '../state/store';

export function ProxyPanel() {
  const proxies = useOptionsStore((s) => s.proxies);
  const refresh = useOptionsStore((s) => s.refresh);

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  return (
    <section className="rounded-lg border border-[var(--color-border)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Proxies</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
          >
            <Upload className="h-3.5 w-3.5" />
            Bulk import
          </button>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
          >
            + Add proxy
          </button>
        </div>
      </header>

      {showAdd ? <AddProxyForm onDone={() => setShowAdd(false)} /> : null}
      {showImport ? <BulkImportForm onDone={() => setShowImport(false)} /> : null}

      {proxies.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No proxies yet. Add one above or bulk import a list.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {proxies.map((p) => (
            <ProxyRow key={p.id} proxy={p} onChange={refresh} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProxyRow({
  proxy,
  onChange,
}: {
  proxy: import('@shared/types').Proxy;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    try {
      const r = await invoke({ type: 'proxy.healthCheck', payload: { id: proxy.id } });
      setResult(r.ok ? `OK ${r.latencyMs}ms ${r.ip ?? ''}` : `FAIL ${r.error ?? ''}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete proxy "${proxy.label}"?`)) return;
    await invoke({ type: 'proxy.delete', payload: { id: proxy.id } });
    await onChange();
  }

  return (
    <li className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm">
      <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-mono text-xs uppercase">
        {proxy.type}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{proxy.label}</div>
        <div className="truncate font-mono text-xs text-[var(--color-text-muted)]">
          {proxy.host}:{proxy.port}
          {proxy.username ? ` (${proxy.username})` : ''}
        </div>
      </div>
      {result ? <span className="text-xs text-[var(--color-text-muted)]">{result}</span> : null}
      <button
        type="button"
        onClick={check}
        disabled={busy}
        aria-label="Health check"
        title="Health check"
        className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-60"
      >
        <Activity className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={remove}
        aria-label="Delete"
        className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function AddProxyForm({ onDone }: { onDone: () => void }) {
  const refresh = useOptionsStore((s) => s.refresh);
  const vault = useOptionsStore((s) => s.vault);

  const [label, setLabel] = useState('');
  const [type, setType] = useState<ProxyType>('http');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(8080);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password && !vault.unlocked) {
      setError('Unlock the vault before saving a password.');
      return;
    }
    setBusy(true);
    try {
      await invoke({
        type: 'proxy.create',
        payload: {
          label: label.trim(),
          type,
          host: host.trim(),
          port,
          username: username.trim() || undefined,
          password: password || undefined,
        },
      });
      await refresh();
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-4 space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
    >
      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      <div className="grid grid-cols-12 gap-3">
        <Field label="Label" className="col-span-4">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            className="input"
          />
        </Field>
        <Field label="Type" className="col-span-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ProxyType)}
            className="input"
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
            <option value="socks4">SOCKS4</option>
            <option value="socks5">SOCKS5</option>
          </select>
        </Field>
        <Field label="Host" className="col-span-4">
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            required
            className="input"
            placeholder="proxy.example.com"
          />
        </Field>
        <Field label="Port" className="col-span-2">
          <input
            type="number"
            value={port}
            min={1}
            max={65535}
            onChange={(e) => setPort(Number(e.target.value) || 0)}
            required
            className="input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Username (optional)">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            className="input"
          />
        </Field>
        <Field label="Password (optional)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            className="input"
            placeholder={vault.unlocked ? '' : 'Unlock vault first'}
            disabled={!vault.unlocked}
          />
        </Field>
      </div>

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
          disabled={busy}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function BulkImportForm({ onDone }: { onDone: () => void }) {
  const refresh = useOptionsStore((s) => s.refresh);
  const [text, setText] = useState('');
  const [defaultType, setDefaultType] = useState<ProxyType>('http');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await invoke({ type: 'proxy.bulkImport', payload: { text, defaultType } });
      setErrors(r.errors);
      await refresh();
      if (r.errors.length === 0) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-4 space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
    >
      <p className="text-xs text-[var(--color-text-muted)]">
        One per line: <code>host:port</code> or <code>host:port:user:pass</code>. Lines starting
        with <code>#</code> are ignored.
      </p>
      <Field label="Default type">
        <select
          value={defaultType}
          onChange={(e) => setDefaultType(e.target.value as ProxyType)}
          className="input"
        >
          <option value="http">HTTP</option>
          <option value="https">HTTPS</option>
          <option value="socks4">SOCKS4</option>
          <option value="socks5">SOCKS5</option>
        </select>
      </Field>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
        rows={6}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 font-mono text-xs focus:border-[var(--color-accent)] focus:outline-none"
        placeholder="proxy.example.com:8080&#10;proxy2.example.com:8080:alice:secret"
      />
      {errors.length > 0 ? (
        <ul className="max-h-32 overflow-y-auto rounded border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-2 text-xs text-[var(--color-danger)]">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
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
          disabled={busy || !text.trim()}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {busy ? 'Importing…' : 'Import'}
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
