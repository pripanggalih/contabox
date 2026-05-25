import { invoke } from '@shared/messaging';
import type { ContainerView, FingerprintProfile, Proxy, Workspace } from '@shared/types';
import { useEffect, useState } from 'react';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

interface Props {
  view: ContainerView;
  onClose: () => void;
}

export function ContainerDetailDrawer({ view, onClose }: Props) {
  const refresh = useContaboxStore((s) => s.refresh);
  const workspaces = useContaboxStore((s) => s.workspaces);
  const pushToast = useContaboxStore((s) => s.pushToast);

  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [fingerprints, setFingerprints] = useState<FingerprintProfile[]>([]);

  const [name, setName] = useState(view.name);
  const [defaultUrl, setDefaultUrl] = useState(view.ext.defaultUrl ?? '');
  const [tagsRaw, setTagsRaw] = useState(view.ext.tags.join(', '));
  const [notes, setNotes] = useState(view.ext.notes);
  const [workspaceId, setWorkspaceId] = useState(view.ext.workspaceId ?? '');
  const [proxyId, setProxyId] = useState(view.ext.proxyId ?? '');
  const [fingerprintId, setFingerprintId] = useState(view.ext.fingerprintId ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [p, f] = await Promise.all([
        invoke({ type: 'proxy.list' }),
        invoke({ type: 'fingerprint.list' }),
      ]);
      setProxies(p);
      setFingerprints(f);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await invoke({
        type: 'container.update',
        payload: {
          cookieStoreId: view.cookieStoreId,
          name: name.trim(),
          defaultUrl: defaultUrl.trim() || null,
          tags,
          notes,
          workspaceId: workspaceId || null,
          proxyId: proxyId || null,
          fingerprintId: fingerprintId || null,
        },
      });
      await refresh();
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: `Save failed: ${String(err)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Container — ${view.name}`} size="lg" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              required
              className="input"
            />
          </Field>
          <Field label="Default URL">
            <input
              type="url"
              value={defaultUrl}
              onChange={(e) => setDefaultUrl(e.target.value)}
              placeholder="https://example.com"
              className="input"
            />
          </Field>
        </div>

        <Field label="Workspace">
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="input"
          >
            <option value="">— None —</option>
            {workspaces.map((w: Workspace) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Proxy">
            <select value={proxyId} onChange={(e) => setProxyId(e.target.value)} className="input">
              <option value="">— None —</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.type}] {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fingerprint">
            <select
              value={fingerprintId}
              onChange={(e) => setFingerprintId(e.target.value)}
              className="input"
            >
              <option value="">— None —</option>
              {fingerprints.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tags (comma-separated)">
          <input
            type="text"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="marketing, affiliate"
            className="input"
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className="input"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>

        <style>{`.input { width: 100%; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-bg-elevated); padding: 6px 8px; font-size: 13px; }
          .input:focus { outline: none; border-color: var(--color-accent); }`}</style>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
