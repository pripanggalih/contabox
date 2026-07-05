import { onBroadcast } from '@shared/messaging';
import { getTheme, setTheme, type Theme } from '@ui/theme';
import { useEffect, useState } from 'react';
import { AutoRulesPanel } from './components/AutoRulesPanel';
import { FingerprintPanel } from './components/FingerprintPanel';
import { PrivacyPanel } from './components/PrivacyPanel';
import { ProxyPanel } from './components/ProxyPanel';
import { ProxyPoolPanel } from './components/ProxyPoolPanel';
import { VaultEntriesPanel } from './components/VaultEntriesPanel';
import { VaultPanel } from './components/VaultPanel';
import { useOptionsStore } from './state/store';

type Tab = 'general' | 'proxy' | 'fingerprint' | 'rules' | 'vault' | 'privacy';

export function Options() {
  const refresh = useOptionsStore((s) => s.refresh);
  const containers = useOptionsStore((s) => s.containers);
  const [tab, setTab] = useState<Tab>('general');

  useEffect(() => {
    void refresh();
    const off = onBroadcast((event) => {
      if (
        event.type === 'state.containers' ||
        event.type === 'state.proxies' ||
        event.type === 'state.fingerprints' ||
        event.type === 'state.autoRules' ||
        event.type === 'state.vault'
      ) {
        void refresh();
      }
    });
    return off;
  }, [refresh]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Contabox</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        Settings — version {browser.runtime.getManifest().version}
      </p>

      <nav
        role="tablist"
        aria-label="Settings sections"
        className="mb-4 flex gap-1 border-b border-[var(--color-border)]"
      >
        {(['general', 'proxy', 'fingerprint', 'rules', 'vault', 'privacy'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-1.5 text-sm capitalize ${
              tab === t
                ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'general' ? <GeneralPanel /> : null}
      {tab === 'proxy' ? (
        <div className="space-y-4">
          <ProxyPanel />
          <ProxyPoolPanel />
        </div>
      ) : null}
      {tab === 'fingerprint' ? <FingerprintPanel /> : null}
      {tab === 'rules' ? <AutoRulesPanel containers={containers} /> : null}
      {tab === 'vault' ? (
        <div className="space-y-4">
          <VaultPanel />
          <VaultEntriesPanel />
        </div>
      ) : null}
      {tab === 'privacy' ? <PrivacyPanel /> : null}

      <style>{`.input { width: 100%; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-bg-primary); padding: 6px 8px; font-size: 13px; }
        .input:focus { outline: none; border-color: var(--color-accent); }`}</style>
    </div>
  );
}

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function GeneralPanel() {
  const [theme, setThemeState] = useState<Theme>(getTheme());

  function pick(t: Theme) {
    setThemeState(t);
    setTheme(t);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="mb-2 text-base font-medium">Appearance</h2>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1.5">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              onClick={() => pick(t.value)}
              className={`rounded-md border px-2 py-1.5 text-sm ${
                theme === t.value
                  ? 'border-[var(--color-accent)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--color-border)] p-4">
        <h2 className="mb-2 text-base font-medium">About</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Contabox <strong>{browser.runtime.getManifest().version}</strong> — local-first container
          manager with proxy, fingerprint, and encrypted vault.
        </p>
      </div>
    </section>
  );
}
