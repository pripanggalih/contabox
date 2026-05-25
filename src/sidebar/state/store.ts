/**
 * Sidebar Zustand store.
 *
 * UI projection of background state. Source of truth lives in BG;
 * this store mirrors via `invoke('*.list')` calls and `state.*` broadcasts.
 */
import { invoke } from '@shared/messaging';
import type { ContainerView, Template, Workspace } from '@shared/types';
import { create } from 'zustand';

export type Toast = {
  id: string;
  variant: 'info' | 'success' | 'error' | 'undo';
  message: string;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};

interface ContaboxState {
  containers: ContainerView[];
  workspaces: Workspace[];
  templates: Template[];
  loading: boolean;
  search: string;
  tagFilter: string | null;
  selectedIds: Set<string>;
  editingId: string | null;
  toasts: Toast[];

  refresh: () => Promise<void>;
  setSearch: (q: string) => void;
  setTagFilter: (tag: string | null) => void;
  toggleSelected: (id: string, mode?: 'single' | 'multi') => void;
  clearSelection: () => void;
  startEditing: (id: string) => void;
  stopEditing: () => void;
  pushToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
}

export const useContaboxStore = create<ContaboxState>((set, get) => ({
  containers: [],
  workspaces: [],
  templates: [],
  loading: false,
  search: '',
  tagFilter: null,
  selectedIds: new Set(),
  editingId: null,
  toasts: [],

  async refresh() {
    set({ loading: true });
    try {
      const [containers, workspaces, templates] = await Promise.all([
        invoke({ type: 'container.list' }),
        invoke({ type: 'workspace.list' }),
        invoke({ type: 'template.list' }),
      ]);
      set({ containers, workspaces, templates, loading: false });
    } catch (err) {
      console.error('[contabox] refresh failed', err);
      set({ loading: false });
      get().pushToast({ variant: 'error', message: `Refresh failed: ${String(err)}` });
    }
  },

  setSearch(q) {
    set({ search: q });
  },

  setTagFilter(tag) {
    set({ tagFilter: tag });
  },

  toggleSelected(id, mode = 'single') {
    const next = new Set(get().selectedIds);
    if (mode === 'single') {
      next.clear();
      next.add(id);
    } else if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedIds: next });
  },

  clearSelection() {
    set({ selectedIds: new Set() });
  },

  startEditing(id) {
    set({ editingId: id });
  },

  stopEditing() {
    set({ editingId: null });
  },

  pushToast(toast) {
    const id = crypto.randomUUID();
    const full: Toast = { id, durationMs: 4000, ...toast };
    set({ toasts: [...get().toasts, full] });
    if (full.durationMs && full.durationMs > 0) {
      setTimeout(() => get().dismissToast(id), full.durationMs);
    }
    return id;
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
