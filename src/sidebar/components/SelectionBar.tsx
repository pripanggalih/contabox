/**
 * Selection action bar — appears at the bottom of the sidebar whenever ≥1
 * container is selected. Surfaces the most common bulk operations and routes
 * the rest to a "more" menu.
 */
import { invoke } from '@shared/messaging';
import {
  ChevronDown,
  ExternalLink,
  Lock,
  MoreHorizontal,
  Power,
  Tag,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useContaboxStore } from '../state/store';
import { BulkOpenUrlDialog } from './BulkOpenUrlDialog';
import { BulkTagsDialog } from './BulkTagsDialog';

export function SelectionBar() {
  const containers = useContaboxStore((s) => s.containers);
  const workspaces = useContaboxStore((s) => s.workspaces);
  const selectedIds = useContaboxStore((s) => s.selectedIds);
  const clearSelection = useContaboxStore((s) => s.clearSelection);
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);

  const [showOpenUrl, setShowOpenUrl] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);

  // Auto-clear selection when nothing exists anymore (e.g. after refresh).
  useEffect(() => {
    if (selectedIds.size === 0) {
      setMoreOpen(false);
      setMoveMenuOpen(false);
    }
  }, [selectedIds.size]);

  if (selectedIds.size === 0) return null;

  const ids = [...selectedIds];
  const selectedViews = containers.filter((c) => selectedIds.has(c.cookieStoreId));
  const allLocked = selectedViews.length > 0 && selectedViews.every((v) => v.ext.isLocked);

  async function bulk<
    T extends { count?: number; deleted?: number; closed?: number; opened?: number },
  >(fn: () => Promise<T>, label: (r: T) => string) {
    try {
      const r = await fn();
      pushToast({ variant: 'success', message: label(r) });
      await refresh();
    } catch (err) {
      pushToast({ variant: 'error', message: String(err) });
    }
  }

  async function bulkOpenAll() {
    setMoreOpen(false);
    await bulk(
      () => invoke({ type: 'container.bulkOpenDefault', payload: { ids, staggerMs: 100 } }),
      (r) => `Opened ${r.opened ?? 0} containers`,
    );
  }

  async function bulkLockToggle() {
    setMoreOpen(false);
    const next = !allLocked;
    await bulk(
      () => invoke({ type: 'container.bulkSetLocked', payload: { ids, locked: next } }),
      (r) => `${next ? 'Locked' : 'Unlocked'} ${r.count ?? 0}`,
    );
  }

  async function bulkHibernate() {
    setMoreOpen(false);
    await bulk(
      () => invoke({ type: 'container.bulkHibernate', payload: { ids } }),
      (r) => `Closed ${r.closed ?? 0} tabs`,
    );
  }

  async function bulkDelete() {
    setMoreOpen(false);
    if (!confirm(`Delete ${ids.length} container${ids.length === 1 ? '' : 's'}?`)) return;
    await bulk(
      () => invoke({ type: 'container.bulkDelete', payload: { ids } }),
      (r) => `Deleted ${r.deleted ?? 0}`,
    );
    clearSelection();
  }

  async function moveToWorkspace(workspaceId: string | null) {
    setMoveMenuOpen(false);
    setMoreOpen(false);
    await bulk(
      () => invoke({ type: 'container.bulkSetWorkspace', payload: { ids, workspaceId } }),
      (r) => `Moved ${r.count ?? 0}`,
    );
  }

  return (
    <>
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="flex items-center gap-1 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5"
      >
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Clear selection"
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <span className="px-1 text-xs font-medium text-[var(--color-text-muted)]">
          {selectedIds.size} selected
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          <BarButton
            onClick={bulkOpenAll}
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            label="Open all"
          />
          <BarButton
            onClick={() => setShowOpenUrl(true)}
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            label="Open URL…"
          />
          <BarButton
            onClick={() => setShowTags(true)}
            icon={<Tag className="h-3.5 w-3.5" />}
            label="Tags…"
          />
          <div className="relative">
            <BarButton
              onClick={() => {
                setMoveMenuOpen((v) => !v);
                setMoreOpen(false);
              }}
              icon={<ChevronDown className="h-3.5 w-3.5" />}
              label="Move…"
              expanded={moveMenuOpen}
            />
            {moveMenuOpen ? (
              <Menu onClose={() => setMoveMenuOpen(false)}>
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    role="menuitem"
                    onClick={() => moveToWorkspace(w.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-hover)]"
                  >
                    <span style={{ color: w.color }}>{w.icon}</span>
                    <span className="truncate">{w.name}</span>
                  </button>
                ))}
                <div className="border-t border-[var(--color-border)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => moveToWorkspace(null)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
                >
                  Remove from workspace
                </button>
              </Menu>
            ) : null}
          </div>

          <BarButton
            onClick={bulkLockToggle}
            icon={allLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            label={allLocked ? 'Unlock' : 'Lock'}
          />

          <div className="relative">
            <BarButton
              onClick={() => {
                setMoreOpen((v) => !v);
                setMoveMenuOpen(false);
              }}
              icon={<MoreHorizontal className="h-3.5 w-3.5" />}
              label="More"
              expanded={moreOpen}
            />
            {moreOpen ? (
              <Menu onClose={() => setMoreOpen(false)}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={bulkHibernate}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-hover)]"
                >
                  <Power className="h-3.5 w-3.5" />
                  Hibernate (close tabs)
                </button>
                <div className="border-t border-[var(--color-border)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={bulkDelete}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete {selectedIds.size}
                </button>
              </Menu>
            ) : null}
          </div>
        </div>
      </div>

      {showOpenUrl ? (
        <BulkOpenUrlDialog initialContainerIds={ids} onClose={() => setShowOpenUrl(false)} />
      ) : null}
      {showTags ? <BulkTagsDialog ids={ids} onClose={() => setShowTags(false)} /> : null}
    </>
  );
}

function BarButton({
  onClick,
  icon,
  label,
  expanded,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      className="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function Menu({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-bulk-menu]')) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      data-bulk-menu
      role="menu"
      className="absolute bottom-full right-0 z-30 mb-1 w-56 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
