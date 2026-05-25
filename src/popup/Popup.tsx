import { browser } from '@shared/browser';
import { invoke } from '@shared/messaging';
import type { ContainerView } from '@shared/types';
import { useEffect, useState } from 'react';
import { displayHex, iconComponent } from '../sidebar/lib/palette';

export function Popup() {
  const [activeContainer, setActiveContainer] = useState<ContainerView | null>(null);
  const [activeUrl, setActiveUrl] = useState<string>('');

  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.cookieStoreId) return;
      setActiveUrl(tab.url ?? '');
      const containers = await invoke({ type: 'container.list' });
      setActiveContainer(containers.find((c) => c.cookieStoreId === tab.cookieStoreId) ?? null);
    })();
  }, []);

  return (
    <div className="p-3">
      <h1 className="mb-2 text-base font-semibold">Contabox</h1>

      {activeContainer ? (
        <ActiveContainerCard view={activeContainer} url={activeUrl} />
      ) : (
        <p className="mb-2 text-sm text-[var(--color-text-muted)]">
          Active tab is in the default container.
        </p>
      )}

      <button
        type="button"
        onClick={() => browser.sidebarAction.open()}
        className="mt-2 w-full rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
      >
        Open sidebar
      </button>
    </div>
  );
}

function ActiveContainerCard({ view, url }: { view: ContainerView; url: string }) {
  const Icon = iconComponent(view.icon);
  return (
    <div className="rounded-md border border-[var(--color-border)] p-2">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ color: displayHex(view), background: `${displayHex(view)}1a` }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{view.name}</div>
          <div className="truncate text-xs text-[var(--color-text-muted)]" title={url}>
            {url || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
