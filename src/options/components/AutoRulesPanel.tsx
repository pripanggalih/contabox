import { invoke } from '@shared/messaging';
import type { AutoRule, ContainerView } from '@shared/types';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  containers: ContainerView[];
}

export function AutoRulesPanel({ containers }: Props) {
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  async function refresh() {
    setRules(await invoke({ type: 'autoRule.list' }));
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function remove(r: AutoRule) {
    if (!confirm('Delete this rule?')) return;
    await invoke({ type: 'autoRule.delete', payload: { id: r.id } });
    await refresh();
  }

  async function toggle(r: AutoRule) {
    await invoke({ type: 'autoRule.update', payload: { id: r.id, enabled: !r.enabled } });
    await refresh();
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Auto-rules</h2>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          <Plus className="h-3.5 w-3.5" />
          New rule
        </button>
      </header>

      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Match URLs and route them to a specific container. First-match wins by order.
      </p>

      {showAdd ? (
        <RuleForm
          containers={containers}
          onDone={() => {
            setShowAdd(false);
            void refresh();
          }}
        />
      ) : null}

      {rules.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No rules yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rules.map((r) => {
            const target = containers.find((c) => c.cookieStoreId === r.containerId);
            return (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={() => toggle(r)}
                  aria-label="Enabled"
                />
                <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-mono text-[10px] uppercase">
                  {r.patternType}
                </span>
                <span className="flex-1 truncate font-mono text-xs">{r.pattern}</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  → {target?.name ?? r.containerId}
                </span>
                <button
                  type="button"
                  onClick={() => remove(r)}
                  aria-label="Delete rule"
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
  );
}

function RuleForm({ containers, onDone }: { containers: ContainerView[]; onDone: () => void }) {
  const [pattern, setPattern] = useState('');
  const [patternType, setPatternType] = useState<'domain' | 'substring' | 'glob' | 'regex'>(
    'domain',
  );
  const [containerId, setContainerId] = useState('');
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function test() {
    if (!pattern || !testUrl) return;
    const r = await invoke({
      type: 'autoRule.test',
      payload: {
        rule: {
          pattern,
          patternType,
          containerId: containerId || (containers[0]?.cookieStoreId ?? ''),
          enabled: true,
          action: 'open-in',
        },
        url: testUrl,
      },
    });
    setTestResult(r.matches);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await invoke({
        type: 'autoRule.create',
        payload: {
          pattern,
          patternType,
          containerId,
          enabled: true,
          action: 'open-in',
        },
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-3 space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
    >
      <div className="grid grid-cols-12 gap-2">
        <label className="col-span-7 block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Pattern
          </span>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            required
            className="input font-mono"
            placeholder={
              patternType === 'glob'
                ? 'https://*.figma.com/*'
                : patternType === 'regex'
                  ? '^https://github\\.com/'
                  : patternType === 'domain'
                    ? 'github.com'
                    : 'github.com'
            }
          />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Type
          </span>
          <select
            value={patternType}
            onChange={(e) => setPatternType(e.target.value as never)}
            className="input"
          >
            <option value="domain">domain</option>
            <option value="substring">substring</option>
            <option value="glob">glob</option>
            <option value="regex">regex</option>
          </select>
        </label>
        <label className="col-span-3 block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Container
          </span>
          <select
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
            required
            className="input"
          >
            <option value="">— pick —</option>
            {containers.map((c) => (
              <option key={c.cookieStoreId} value={c.cookieStoreId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5">
        <FlaskConical className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        <input
          type="text"
          value={testUrl}
          onChange={(e) => {
            setTestUrl(e.target.value);
            setTestResult(null);
          }}
          placeholder="Test URL"
          className="flex-1 bg-transparent text-sm focus:outline-none"
        />
        <button
          type="button"
          onClick={test}
          disabled={!pattern || !testUrl}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
        >
          Test
        </button>
        {testResult !== null ? (
          <span
            className={`text-xs font-medium ${
              testResult ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
            }`}
          >
            {testResult ? 'matches' : 'no match'}
          </span>
        ) : null}
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
          disabled={busy || !pattern || !containerId}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
