import { useDroppable } from '@dnd-kit/core';
import { fuzzyScore } from '@shared/fuzzy';
import { invoke } from '@shared/messaging';
import type { ContainerView, Workspace } from '@shared/types';
import { ChevronDown, ChevronRight, FolderPlus, Play, Power } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useContaboxStore } from '../state/store';
import { ContainerRow } from './ContainerRow';
import { WorkspaceGlyph } from './WorkspaceGlyph';

const ORPHAN_ID = '__orphan__';

interface SectionProps {
  workspace: Workspace | null;
  containers: ContainerView[];
}

function WorkspaceSection({ workspace, containers }: SectionProps) {
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);

  const id = workspace?.id ?? ORPHAN_ID;
  const [collapsed, setCollapsed] = useState<boolean>(workspace?.collapsed ?? false);
  const { setNodeRef, isOver } = useDroppable({ id });

  useEffect(() => {
    setCollapsed(workspace?.collapsed ?? false);
  }, [workspace?.collapsed]);

  async function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (workspace) {
      try {
        await invoke({
          type: 'workspace.update',
          payload: { id: workspace.id, collapsed: next },
        });
      } catch (err) {
        console.warn('persist collapse failed', err);
      }
    }
  }

  async function openAll() {
    if (!workspace) return;
    try {
      const r = await invoke({ type: 'workspace.openAll', payload: { id: workspace.id } });
      pushToast({ variant: 'success', message: `Opened ${r.opened} containers` });
    } catch (err) {
      pushToast({ variant: 'error', message: `Open all failed: ${String(err)}` });
    }
  }

  async function hibernate() {
    if (!workspace) return;
    try {
      const r = await invoke({ type: 'workspace.hibernate', payload: { id: workspace.id } });
      pushToast({ variant: 'info', message: `Closed ${r.closed} tabs` });
    } catch (err) {
      pushToast({ variant: 'error', message: `Hibernate failed: ${String(err)}` });
    }
  }

  async function deleteWs() {
    if (!workspace) return;
    if (!confirm(`Delete workspace "${workspace.name}"? Its containers will be unassigned.`)) {
      return;
    }
    try {
      await invoke({
        type: 'workspace.delete',
        payload: { id: workspace.id, orphanContainers: true },
      });
      await refresh();
    } catch (err) {
      pushToast({ variant: 'error', message: `Delete workspace failed: ${String(err)}` });
    }
  }

  return (
    <section
      ref={setNodeRef}
      className={`border-b border-[var(--color-border)] last:border-b-0 ${
        isOver ? 'bg-[var(--color-accent)]/10' : ''
      }`}
      aria-label={workspace?.name ?? 'Orphaned'}
    >
      <header className="group flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="flex items-center text-sm" aria-hidden="true">
          {workspace ? <WorkspaceGlyph workspace={workspace} /> : '📥'}
        </span>
        <span className="flex-1 truncate text-sm font-medium">
          {workspace ? workspace.name : 'Orphaned'}
          <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">
            ({containers.length})
          </span>
        </span>
        {workspace ? (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={openAll}
              aria-label="Open all"
              title="Open all"
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
            >
              <Play className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={hibernate}
              aria-label="Hibernate"
              title="Hibernate (close tabs)"
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
            >
              <Power className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={deleteWs}
              aria-label="Delete workspace"
              title="Delete workspace"
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
            >
              ×
            </button>
          </div>
        ) : null}
      </header>

      {!collapsed ? (
        <ul role="group" className="pb-1">
          {containers.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
              {workspace
                ? 'Drag containers here, or assign via Edit details.'
                : 'No uncategorized containers.'}
            </li>
          ) : containers.length > 30 ? (
            <Virtuoso
              data={containers}
              style={{ height: Math.min(containers.length * 32, 400) }}
              itemContent={(_i, c) => <ContainerRow key={c.cookieStoreId} view={c} />}
            />
          ) : (
            containers.map((c) => <ContainerRow key={c.cookieStoreId} view={c} />)
          )}
        </ul>
      ) : null}
    </section>
  );
}

interface Props {
  onCreateWorkspace: () => void;
}

export function WorkspaceTree({ onCreateWorkspace }: Props) {
  const containers = useContaboxStore((s) => s.containers);
  const workspaces = useContaboxStore((s) => s.workspaces);
  const search = useContaboxStore((s) => s.search);
  const tagFilter = useContaboxStore((s) => s.tagFilter);

  const filtered = useMemo(() => {
    let list = containers;
    if (tagFilter) {
      list = list.filter((c) => c.ext.tags.includes(tagFilter));
    }
    const q = search.trim();
    if (!q) return list;

    return list
      .map((c) => {
        const haystack = `${c.name} ${c.ext.tags.join(' ')} ${c.ext.notes}`;
        return { c, score: fuzzyScore(q, haystack) };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.c);
  }, [containers, search, tagFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ContainerView[]>();
    for (const w of workspaces) map.set(w.id, []);
    map.set(ORPHAN_ID, []);
    for (const c of filtered) {
      const key = c.ext.workspaceId && map.has(c.ext.workspaceId) ? c.ext.workspaceId : ORPHAN_ID;
      map.get(key)?.push(c);
    }
    return map;
  }, [filtered, workspaces]);

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-1.5 text-xs uppercase text-[var(--color-text-muted)]">
        <span>Workspaces</span>
        <button
          type="button"
          onClick={onCreateWorkspace}
          aria-label="New workspace"
          className="rounded p-0.5 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {workspaces.map((w) => (
        <WorkspaceSection key={w.id} workspace={w} containers={grouped.get(w.id) ?? []} />
      ))}
      {(grouped.get(ORPHAN_ID)?.length ?? 0) > 0 ? (
        <WorkspaceSection workspace={null} containers={grouped.get(ORPHAN_ID) ?? []} />
      ) : null}
    </div>
  );
}

export { ORPHAN_ID };
