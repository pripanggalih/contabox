import { browser } from '@shared/browser';
import { LayoutTemplate, Search, Settings } from 'lucide-react';
import { useState } from 'react';
import { useContaboxStore } from '../state/store';
import { TemplateManagerDialog } from './TemplateManagerDialog';

export function Header() {
  const search = useContaboxStore((s) => s.search);
  const setSearch = useContaboxStore((s) => s.setSearch);
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <>
      <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search containers…"
            aria-label="Search containers"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1.5 pl-7 pr-2 text-sm placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
          aria-label="Manage templates"
          onClick={() => setShowTemplates(true)}
        >
          <LayoutTemplate className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
          aria-label="Open settings"
          onClick={() => browser.runtime.openOptionsPage()}
        >
          <Settings className="h-4 w-4" />
        </button>
      </header>
      {showTemplates ? <TemplateManagerDialog onClose={() => setShowTemplates(false)} /> : null}
    </>
  );
}
