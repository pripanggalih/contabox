import { invoke } from '@shared/messaging';
import { parseOtpauthUri, secondsRemaining } from '@shared/totp';
import { Copy, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOptionsStore } from '../state/store';

interface Entry {
  id: string;
  scope: 'global' | 'container';
  containerId?: string;
  origin: string;
  kind: 'password' | 'totp' | 'note' | 'proxy-credential';
  label: string;
  createdAt: number;
  updatedAt: number;
}

export function VaultEntriesPanel() {
  const vault = useOptionsStore((s) => s.vault);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [autoLock, setAutoLock] = useState(15);

  async function refresh() {
    if (!vault.unlocked) {
      setEntries([]);
      return;
    }
    const list = (await invoke({ type: 'vault.listEntries' })) as Entry[];
    setEntries(list);
  }

  useEffect(() => {
    void refresh();
  }, [vault.unlocked]);

  async function remove(id: string) {
    if (!confirm('Delete entry?')) return;
    await invoke({ type: 'vault.deleteEntry', payload: { id } });
    await refresh();
  }

  async function applyAutoLock() {
    await invoke({ type: 'vault.setAutoLock', payload: { minutes: autoLock } });
  }

  if (!vault.unlocked) {
    return (
      <section className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="mb-2 text-base font-semibold">Vault entries</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Unlock the vault (Vault tab) to see and manage entries.
        </p>
      </section>
    );
  }

  const passwords = entries.filter((e) => e.kind === 'password');
  const totps = entries.filter((e) => e.kind === 'totp');
  const notes = entries.filter((e) => e.kind === 'note');

  return (
    <section className="rounded-lg border border-[var(--color-border)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Vault entries</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            Auto-lock (min)
            <input
              type="number"
              min={0}
              max={1440}
              value={autoLock}
              onChange={(e) => setAutoLock(Number(e.target.value) || 0)}
              onBlur={applyAutoLock}
              className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add entry
          </button>
        </div>
      </header>

      {showAdd ? (
        <AddEntryForm
          onDone={() => {
            setShowAdd(false);
            void refresh();
          }}
        />
      ) : null}

      <Group title="TOTP" entries={totps} onDelete={remove}>
        {(e) => <TotpRow entry={e} />}
      </Group>
      <Group title="Passwords" entries={passwords} onDelete={remove}>
        {(e) => <RevealRow entry={e} />}
      </Group>
      <Group title="Notes" entries={notes} onDelete={remove}>
        {(e) => <RevealRow entry={e} />}
      </Group>
    </section>
  );
}

function Group({
  title,
  entries,
  onDelete,
  children,
}: {
  title: string;
  entries: Entry[];
  onDelete: (id: string) => void | Promise<void>;
  children: (e: Entry) => React.ReactNode;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-xs font-semibold uppercase text-[var(--color-text-muted)]">
        {title} ({entries.length})
      </h3>
      <ul className="space-y-1">
        {entries.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-sm"
          >
            <KeyRound className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{e.label}</div>
              <div className="truncate text-xs text-[var(--color-text-muted)]">{e.origin}</div>
            </div>
            {children(e)}
            <button
              type="button"
              onClick={() => onDelete(e.id)}
              aria-label="Delete entry"
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RevealRow({ entry }: { entry: Entry }) {
  const [revealed, setRevealed] = useState<string | null>(null);

  async function reveal() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    const r = await invoke({ type: 'vault.getSecret', payload: { id: entry.id } });
    setRevealed(r.secret);
  }

  return (
    <>
      {revealed ? (
        <code className="max-w-xs truncate rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-xs">
          {revealed}
        </code>
      ) : null}
      <button
        type="button"
        onClick={reveal}
        className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-hover)]"
      >
        {revealed ? 'Hide' : 'Reveal'}
      </button>
      {revealed ? (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(revealed)}
          aria-label="Copy"
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </>
  );
}

function TotpRow({ entry }: { entry: Entry }) {
  const [code, setCode] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(secondsRemaining());

  async function refresh() {
    try {
      const r = await invoke({ type: 'vault.totpCode', payload: { id: entry.id } });
      setCode(r.code);
    } catch {
      setCode('error');
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      setRemaining(secondsRemaining());
      if (secondsRemaining() === 30) void refresh();
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <code className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-mono text-sm">
        {code ?? '— — —'}
      </code>
      <span className="text-xs text-[var(--color-text-muted)]">{remaining}s</span>
      <button
        type="button"
        onClick={() => code && navigator.clipboard.writeText(code)}
        aria-label="Copy"
        className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={refresh}
        aria-label="Regenerate"
        className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

function AddEntryForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<'password' | 'totp' | 'note'>('password');
  const [label, setLabel] = useState('');
  const [origin, setOrigin] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let storedSecret = secret;
      let resolvedLabel = label.trim();
      let resolvedOrigin = origin.trim();

      if (kind === 'totp' && /^otpauth:\/\//i.test(secret.trim())) {
        const parsed = parseOtpauthUri(secret.trim());
        storedSecret = parsed.secret;
        resolvedLabel = resolvedLabel || parsed.label;
        resolvedOrigin = resolvedOrigin || parsed.issuer || '';
      }

      await invoke({
        type: 'vault.addEntry',
        payload: {
          scope: 'global',
          kind,
          label: resolvedLabel,
          origin: resolvedOrigin,
          secret: storedSecret,
        },
      });
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
      <div className="grid grid-cols-12 gap-2">
        <label className="col-span-3 block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Kind
          </span>
          <select value={kind} onChange={(e) => setKind(e.target.value as never)} className="input">
            <option value="password">password</option>
            <option value="totp">TOTP</option>
            <option value="note">note</option>
          </select>
        </label>
        <label className="col-span-4 block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Label
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required={kind !== 'totp'}
            className="input"
            placeholder="GitHub — alice"
          />
        </label>
        <label className="col-span-5 block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Origin / issuer
          </span>
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="input"
            placeholder="https://github.com"
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
          {kind === 'totp' ? 'Secret (base32) or otpauth:// URI' : 'Secret / value'}
        </span>
        <input
          type={kind === 'note' ? 'text' : 'password'}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          required
          className="input font-mono"
          autoComplete="new-password"
        />
      </label>
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
