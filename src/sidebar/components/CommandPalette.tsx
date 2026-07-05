import { invoke } from '@shared/messaging';
import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { displayHex, displayIcon } from '../lib/palette';
import { useContaboxStore } from '../state/store';
import { WorkspaceGlyph } from './WorkspaceGlyph';

interface Props {
  onClose: () => void;
}

export function CommandPalette({ onClose }: Props) {
  const containers = useContaboxStore((s) => s.containers);
  const workspaces = useContaboxStore((s) => s.workspaces);
  const templates = useContaboxStore((s) => s.templates);
  const pushToast = useContaboxStore((s) => s.pushToast);

  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function openContainer(id: string) {
    try {
      await invoke({ type: 'container.openDefault', payload: { cookieStoreId: id } });
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: `Open failed: ${String(err)}` });
    }
  }

  async function openWorkspaceAll(id: string) {
    try {
      const r = await invoke({ type: 'workspace.openAll', payload: { id } });
      pushToast({ variant: 'success', message: `Opened ${r.opened} containers` });
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: `Open all failed: ${String(err)}` });
    }
  }

  async function hibernateWorkspace(id: string) {
    try {
      const r = await invoke({ type: 'workspace.hibernate', payload: { id } });
      pushToast({ variant: 'info', message: `Closed ${r.closed} tabs` });
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: `Hibernate failed: ${String(err)}` });
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Command
        className="w-full max-w-lg overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl"
        loop
        shouldFilter
      >
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search containers, workspaces, actions…"
          className="w-full border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2.5 text-sm focus:outline-none"
        />
        <Command.List className="max-h-[60vh] overflow-y-auto p-1">
          <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
            No results.
          </Command.Empty>

          {containers.length > 0 ? (
            <Command.Group heading="Containers" className="cmdk-group">
              {containers.map((c) => {
                const Icon = displayIcon(c);
                const ws = workspaces.find((w) => w.id === c.ext.workspaceId);
                return (
                  <Command.Item
                    key={c.cookieStoreId}
                    value={`container ${c.name} ${c.ext.tags.join(' ')} ${ws?.name ?? ''}`}
                    onSelect={() => openContainer(c.cookieStoreId)}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm aria-selected:bg-[var(--color-bg-hover)]"
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: displayHex(c) }} />
                    <span className="flex-1 truncate">{c.name}</span>
                    {ws ? (
                      <span className="text-xs text-[var(--color-text-muted)]">{ws.name}</span>
                    ) : null}
                  </Command.Item>
                );
              })}
            </Command.Group>
          ) : null}

          {workspaces.length > 0 ? (
            <Command.Group heading="Workspaces" className="cmdk-group">
              {workspaces.map((w) => (
                <div key={w.id}>
                  <Command.Item
                    value={`open all ${w.name}`}
                    onSelect={() => openWorkspaceAll(w.id)}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm aria-selected:bg-[var(--color-bg-hover)]"
                  >
                    <WorkspaceGlyph workspace={w} className="h-3.5 w-3.5" />
                    <span>Open all in {w.name}</span>
                  </Command.Item>
                  <Command.Item
                    value={`hibernate ${w.name}`}
                    onSelect={() => hibernateWorkspace(w.id)}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm aria-selected:bg-[var(--color-bg-hover)]"
                  >
                    <WorkspaceGlyph workspace={w} className="h-3.5 w-3.5" />
                    <span>Hibernate {w.name}</span>
                  </Command.Item>
                </div>
              ))}
            </Command.Group>
          ) : null}

          {templates.length > 0 ? (
            <Command.Group heading="Templates" className="cmdk-group">
              {templates.map((t) => (
                <Command.Item
                  key={t.id}
                  value={`template ${t.name}`}
                  onSelect={() => onClose()}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm aria-selected:bg-[var(--color-bg-hover)]"
                >
                  <span>{t.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
      </Command>
    </div>,
    document.body,
  );
}
