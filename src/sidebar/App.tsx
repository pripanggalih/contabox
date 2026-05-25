import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { invoke, onBroadcast } from '@shared/messaging';
import { useEffect, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { CreateWorkspaceDialog } from './components/CreateWorkspaceDialog';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { OnboardingWizard, ONBOARDED_META_KEY } from './components/OnboardingWizard';
import { SelectionBar } from './components/SelectionBar';
import { TagFilterBar } from './components/TagFilterBar';
import { ToastHost } from './components/ToastHost';
import { ORPHAN_ID, WorkspaceTree } from './components/WorkspaceTree';
import { useContaboxStore } from './state/store';

export function App() {
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    void (async () => {
      await refresh();
      try {
        const onboarded = await invoke({
          type: 'meta.get',
          payload: { key: ONBOARDED_META_KEY },
        });
        if (!onboarded) setShowOnboarding(true);
      } catch {
        /* first run / no DB row yet */
      }
    })();
    const off = onBroadcast((event) => {
      if (
        event.type === 'state.containers' ||
        event.type === 'state.workspaces' ||
        event.type === 'state.templates'
      ) {
        void refresh();
      }
    });
    return off;
  }, [refresh]);

  // Listen for BG-dispatched UI events (keyboard shortcuts).
  useEffect(() => {
    function listener(msg: unknown) {
      if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).__ui === true) {
        const event = msg as { type: string };
        if (event.type === 'ui.openPalette') setShowPalette(true);
      }
      return undefined;
    }
    if (typeof browser !== 'undefined') {
      browser.runtime.onMessage.addListener(listener);
      return () => browser.runtime.onMessage.removeListener(listener);
    }
    return undefined;
  }, []);

  // Cmd/Ctrl+K opens palette inside sidebar even without BG dispatch.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      // Esc clears selection if no modal is open.
      if (e.key === 'Escape' && !showCreateWs && !showPalette && !showOnboarding) {
        useContaboxStore.getState().clearSelection();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreateWs, showPalette, showOnboarding]);

  async function onDragEnd(e: DragEndEvent) {
    const cookieStoreId = String(e.active.id);
    const overId = e.over?.id;
    if (!overId) return;
    const newWorkspaceId = overId === ORPHAN_ID ? null : String(overId);

    try {
      await invoke({
        type: 'container.update',
        payload: { cookieStoreId, workspaceId: newWorkspaceId },
      });
      await refresh();
    } catch (err) {
      pushToast({ variant: 'error', message: `Move failed: ${String(err)}` });
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Header />
      <TagFilterBar />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <main className="flex-1 overflow-y-auto" aria-label="Containers">
          <WorkspaceTree onCreateWorkspace={() => setShowCreateWs(true)} />
        </main>
      </DndContext>
      <SelectionBar />
      <Footer />
      <ToastHost />
      {showCreateWs ? <CreateWorkspaceDialog onClose={() => setShowCreateWs(false)} /> : null}
      {showPalette ? <CommandPalette onClose={() => setShowPalette(false)} /> : null}
      {showOnboarding ? <OnboardingWizard onClose={() => setShowOnboarding(false)} /> : null}
    </div>
  );
}
