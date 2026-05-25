import { invoke } from '@shared/messaging';
import { ArrowRight, Check, Download, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

const ONBOARDED_KEY = 'onboarded';

interface Props {
  onClose: () => void;
}

export function OnboardingWizard({ onClose }: Props) {
  const refresh = useContaboxStore((s) => s.refresh);
  const pushToast = useContaboxStore((s) => s.pushToast);

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [macCount, setMacCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await invoke({ type: 'mac.detect' });
        setMacCount(r.count);
      } catch {
        setMacCount(0);
      }
    })();
  }, []);

  async function complete() {
    try {
      await invoke({ type: 'meta.set', payload: { key: ONBOARDED_KEY, value: true } });
    } catch (err) {
      console.warn('persist onboarded flag failed', err);
    }
    onClose();
  }

  async function doImport() {
    setImporting(true);
    try {
      const r = await invoke({ type: 'mac.import' });
      pushToast({ variant: 'success', message: `Imported ${r.imported} containers` });
      await refresh();
      setStep(1);
    } catch (err) {
      pushToast({ variant: 'error', message: `Import failed: ${String(err)}` });
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="Welcome to Contabox" onClose={complete}>
      {step === 0 ? (
        <div className="space-y-4">
          <p className="text-sm">
            Contabox makes Firefox's native containers manageable at scale — bulk ops, workspaces,
            templates, and (later) per-container proxy and fingerprint.
          </p>
          {macCount !== null && macCount > 0 ? (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm">
              <p className="mb-2">
                Detected <strong>{macCount}</strong> existing container{macCount === 1 ? '' : 's'}.
                Import them now?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={importing}
                  onClick={doImport}
                  className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" />
                  {importing ? 'Importing…' : `Import ${macCount}`}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Skip
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              No existing containers detected — clean slate.
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Quick tour</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-mono text-xs">
                Cmd/Ctrl+K
              </span>
              <span>Command palette — jump to any container or action.</span>
            </li>
            <li className="flex gap-2">
              <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-mono text-xs">
                Bulk
              </span>
              <span>Spawn N containers with a naming pattern in seconds.</span>
            </li>
            <li className="flex gap-2">
              <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 font-mono text-xs">
                Drag
              </span>
              <span>Drop containers between workspaces to reorganize.</span>
            </li>
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">You're set</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Proxy, fingerprint, snapshots, and vault land in upcoming milestones. Watch the roadmap
            on the Options page.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={complete}
              className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
            >
              <Check className="h-3.5 w-3.5" />
              Get started
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export const ONBOARDED_META_KEY = ONBOARDED_KEY;
