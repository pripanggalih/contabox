/**
 * Single row in the container tree.
 *
 * Interaction model:
 *   - Click row body          → open container (default URL)
 *   - Cmd/Ctrl/Shift + click  → toggle select (power-user shortcut)
 *   - Click checkbox          → toggle select (mouse-friendly path)
 *   - Double click            → inline rename
 *   - Drag colored icon       → reorder / move between workspaces
 *
 * Selection visibility:
 *   - Idle:        checkbox hidden, fades in on row hover
 *   - Active:      any container selected → all checkboxes visible
 *                  (so "select more" is discoverable without re-hovering)
 *   - Locked:      row click warns; opening blocked
 */
import { useDraggable } from '@dnd-kit/core';
import { invoke } from '@shared/messaging';
import type { ContainerView } from '@shared/types';
import { Lock, MoreVertical } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { displayHex, iconComponent } from '../lib/palette';
import { useContaboxStore } from '../state/store';
import { ContainerDetailDrawer } from './ContainerDetailDrawer';
import { CookieEditorDialog } from './CookieEditorDialog';
import { SnapshotsDialog } from './SnapshotsDialog';

interface Props {
  view: ContainerView;
}

const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a, [role="menu"], [data-no-row-open]';

export function ContainerRow({ view }: Props) {
  const editingId = useContaboxStore((s) => s.editingId);
  const startEditing = useContaboxStore((s) => s.startEditing);
  const stopEditing = useContaboxStore((s) => s.stopEditing);
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);
  const dismissToast = useContaboxStore((s) => s.dismissToast);
  const selectedIds = useContaboxStore((s) => s.selectedIds);
  const toggleSelected = useContaboxStore((s) => s.toggleSelected);

  const editing = editingId === view.cookieStoreId;
  const selected = selectedIds.has(view.cookieStoreId);
  // "Selection mode" is active whenever ≥ 1 container is selected.
  // While active, all checkboxes are revealed so the user can extend the
  // selection without re-hovering each row.
  const selectionMode = selectedIds.size > 0;

  const Icon = iconComponent(view.icon);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftName, setDraftName] = useState(view.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showCookies, setShowCookies] = useState(false);

  const dragDisabled = editing || menuOpen || showDetail || showSnapshots || showCookies;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: view.cookieStoreId,
    disabled: dragDisabled,
  });

  useEffect(() => {
    if (editing) {
      setDraftName(view.name);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, view.name]);

  async function commitRename() {
    const trimmed = draftName.trim();
    stopEditing();
    if (!trimmed || trimmed === view.name) return;
    try {
      await invoke({
        type: 'container.update',
        payload: { cookieStoreId: view.cookieStoreId, name: trimmed },
      });
      await refresh();
    } catch (err) {
      pushToast({ variant: 'error', message: `Rename failed: ${String(err)}` });
    }
  }

  async function openContainer(newWindow: boolean) {
    if (view.ext.isLocked) {
      pushToast({ variant: 'error', message: `Container "${view.name}" is locked.` });
      return;
    }
    try {
      await invoke({
        type: 'container.openDefault',
        payload: { cookieStoreId: view.cookieStoreId, newWindow },
      });
    } catch (err) {
      pushToast({ variant: 'error', message: `Open failed: ${String(err)}` });
    }
  }

  function handleRowClick(e: React.MouseEvent<HTMLLIElement>) {
    if (editing) return;
    if (menuOpen || showDetail || showSnapshots || showCookies) return;
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTOR)) return;

    // Modifier-click extends or builds a selection without opening.
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      toggleSelected(view.cookieStoreId, 'multi');
      return;
    }
    void openContainer(false);
  }

  async function toggleLock() {
    setMenuOpen(false);
    try {
      await invoke({
        type: 'container.setLocked',
        payload: { cookieStoreId: view.cookieStoreId, locked: !view.ext.isLocked },
      });
      await refresh();
    } catch (err) {
      pushToast({ variant: 'error', message: `Lock toggle failed: ${String(err)}` });
    }
  }

  async function handleDelete() {
    setMenuOpen(false);
    try {
      const result = await invoke({
        type: 'container.delete',
        payload: { cookieStoreId: view.cookieStoreId },
      });
      await refresh();

      if (result.restorable) {
        pushToast({
          variant: 'undo',
          message: `Deleted "${view.name}"`,
          durationMs: 5000,
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await invoke({
                  type: 'container.deleteRestore',
                  payload: { cookieStoreId: view.cookieStoreId },
                });
                await refresh();
              } catch (err) {
                pushToast({ variant: 'error', message: `Undo failed: ${String(err)}` });
              }
            },
          },
        });
        void dismissToast;
      }
    } catch (err) {
      pushToast({ variant: 'error', message: `Delete failed: ${String(err)}` });
    }
  }

  return (
    <Fragment>
      <li
        role="treeitem"
        aria-label={view.name}
        aria-grabbed={isDragging}
        aria-selected={selected}
        className={`group relative flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors ${
          selected
            ? 'bg-[var(--color-accent)]/15 hover:bg-[var(--color-accent)]/20'
            : 'hover:bg-[var(--color-bg-hover)]'
        } ${isDragging ? 'opacity-40' : ''}`}
        onClick={handleRowClick}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
          startEditing(view.cookieStoreId);
        }}
      >
        {/* Checkbox slot — fixed width, fades in on hover or while in
            selection mode. Click toggles selection without firing row open. */}
        <span
          className={`flex h-4 w-4 flex-shrink-0 items-center justify-center transition-opacity ${
            selectionMode || selected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
          }`}
          data-no-row-open
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggleSelected(view.cookieStoreId, 'multi')}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${view.name}`}
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
          />
        </span>

        {/* Color icon doubles as drag handle. Subtle visual cue:
            cursor changes to grab on hover. */}
        <span
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          aria-label="Drag to reorder"
          data-no-row-open
          className="flex h-6 w-6 flex-shrink-0 cursor-grab items-center justify-center rounded-md transition-transform hover:scale-105 active:cursor-grabbing"
          style={{ color: displayHex(view), background: `${displayHex(view)}1a` }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>

        {editing ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                stopEditing();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            maxLength={50}
            className="flex-1 rounded border border-[var(--color-accent)] bg-[var(--color-bg-elevated)] px-1 py-0.5 text-sm focus:outline-none"
          />
        ) : (
          <span className="flex-1 truncate text-sm">{view.name}</span>
        )}

        {view.ext.isLocked ? (
          <Lock
            className="h-3 w-3 flex-shrink-0 text-[var(--color-text-muted)]"
            aria-label="Locked"
          />
        ) : null}

        <div className="relative">
          <button
            type="button"
            data-no-row-open
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Actions for ${view.name}`}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] focus:opacity-100 group-hover:opacity-100"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>

          {menuOpen ? (
            <RowMenu
              onClose={() => setMenuOpen(false)}
              onRename={() => {
                setMenuOpen(false);
                startEditing(view.cookieStoreId);
              }}
              onEdit={() => {
                setMenuOpen(false);
                setShowDetail(true);
              }}
              onSnapshots={() => {
                setMenuOpen(false);
                setShowSnapshots(true);
              }}
              onCookies={() => {
                setMenuOpen(false);
                setShowCookies(true);
              }}
              onOpenNewWindow={() => {
                setMenuOpen(false);
                void openContainer(true);
              }}
              onToggleLock={toggleLock}
              isLocked={view.ext.isLocked}
              onDelete={handleDelete}
            />
          ) : null}
        </div>
      </li>

      {showDetail ? (
        <ContainerDetailDrawer view={view} onClose={() => setShowDetail(false)} />
      ) : null}
      {showSnapshots ? (
        <SnapshotsDialog view={view} onClose={() => setShowSnapshots(false)} />
      ) : null}
      {showCookies ? (
        <CookieEditorDialog view={view} onClose={() => setShowCookies(false)} />
      ) : null}
    </Fragment>
  );
}

interface MenuProps {
  onClose: () => void;
  onRename: () => void;
  onEdit: () => void;
  onSnapshots: () => void;
  onCookies: () => void;
  onOpenNewWindow: () => void;
  onToggleLock: () => void;
  isLocked: boolean;
  onDelete: () => void | Promise<void>;
}

function RowMenu({
  onClose,
  onRename,
  onEdit,
  onSnapshots,
  onCookies,
  onOpenNewWindow,
  onToggleLock,
  isLocked,
  onDelete,
}: MenuProps) {
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-row-menu]')) onClose();
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
      data-row-menu
      data-no-row-open
      role="menu"
      className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-md"
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem onClick={onOpenNewWindow}>Open in new window</MenuItem>
      <Divider />
      <MenuItem onClick={onRename}>Rename</MenuItem>
      <MenuItem onClick={onEdit}>Edit details…</MenuItem>
      <MenuItem onClick={onSnapshots}>Snapshots…</MenuItem>
      <MenuItem onClick={onCookies}>Cookies…</MenuItem>
      <MenuItem onClick={onToggleLock}>{isLocked ? 'Unlock' : 'Lock'}</MenuItem>
      <Divider />
      <MenuItem onClick={() => void onDelete()} danger>
        Delete
      </MenuItem>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-hover)] ${
        danger ? 'text-[var(--color-danger)]' : ''
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="border-t border-[var(--color-border)]" />;
}
