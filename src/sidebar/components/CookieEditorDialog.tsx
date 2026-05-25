import { invoke } from '@shared/messaging';
import type { ContainerView, SnapshotCookie } from '@shared/types';
import { Download, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useContaboxStore } from '../state/store';
import { Modal } from './Modal';

interface Props {
  view: ContainerView;
  onClose: () => void;
}

type CookieRow = SnapshotCookie & { storeId: string };

export function CookieEditorDialog({ view, onClose }: Props) {
  const pushToast = useContaboxStore((s) => s.pushToast);
  const [cookies, setCookies] = useState<CookieRow[]>([]);
  const [filter, setFilter] = useState('');
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'json' | 'netscape'>('json');
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const list = await invoke({
      type: 'cookie.list',
      payload: { storeId: view.cookieStoreId },
    });
    setCookies(list);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function remove(c: CookieRow) {
    try {
      await invoke({
        type: 'cookie.remove',
        payload: {
          storeId: view.cookieStoreId,
          name: c.name,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
        },
      });
      await refresh();
    } catch (err) {
      pushToast({ variant: 'error', message: `Delete failed: ${String(err)}` });
    }
  }

  async function exportCookies(format: 'json' | 'netscape') {
    const data = await invoke({
      type: format === 'json' ? 'cookie.exportJson' : 'cookie.exportNetscape',
      payload: { storeId: view.cookieStoreId },
    });
    const blob = new Blob([data], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cookies-${view.name}-${Date.now()}.${format === 'json' ? 'json' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await invoke({
        type: importMode === 'json' ? 'cookie.importJson' : 'cookie.importNetscape',
        payload: { storeId: view.cookieStoreId, text: importText },
      });
      pushToast({
        variant: r.errors.length === 0 ? 'success' : 'info',
        message: `Imported ${r.imported}${r.errors.length ? ` · ${r.errors.length} errors` : ''}`,
      });
      await refresh();
      if (r.errors.length === 0) {
        setImportText('');
        setShowImport(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const filtered = filter
    ? cookies.filter(
        (c) =>
          c.name.toLowerCase().includes(filter.toLowerCase()) ||
          c.domain.toLowerCase().includes(filter.toLowerCase()),
      )
    : cookies;

  return (
    <Modal title={`Cookies — ${view.name}`} size="lg" onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or domain…"
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
        >
          <Upload className="h-3.5 w-3.5" />
          Import
        </button>
        <button
          type="button"
          onClick={() => exportCookies('json')}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
        >
          <Download className="h-3.5 w-3.5" />
          JSON
        </button>
        <button
          type="button"
          onClick={() => exportCookies('netscape')}
          className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
        >
          .txt
        </button>
      </div>

      {showImport ? (
        <form
          onSubmit={doImport}
          className="mb-3 space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2"
        >
          <div className="flex gap-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={importMode === 'json'}
                onChange={() => setImportMode('json')}
              />
              JSON
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={importMode === 'netscape'}
                onChange={() => setImportMode('netscape')}
              />
              Netscape (.txt)
            </label>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            required
            rows={6}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 font-mono text-xs focus:border-[var(--color-accent)] focus:outline-none"
            placeholder={
              importMode === 'json'
                ? '[{ "name": "...", "value": "...", ... }]'
                : '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t0\tname\tvalue'
            }
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowImport(false)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !importText.trim()}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="max-h-96 overflow-y-auto rounded-md border border-[var(--color-border)]">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-[var(--color-text-muted)]">No cookies match.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--color-bg-elevated)]">
              <tr className="text-left">
                <th className="px-2 py-1.5">Domain</th>
                <th className="px-2 py-1.5">Name</th>
                <th className="px-2 py-1.5">Value</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={`${c.domain}|${c.path}|${c.name}`}
                  className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]"
                >
                  <td className="px-2 py-1 font-mono">{c.domain}</td>
                  <td className="px-2 py-1 font-mono">{c.name}</td>
                  <td className="max-w-xs truncate px-2 py-1 font-mono" title={c.value}>
                    {c.value}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      aria-label={`Delete cookie ${c.name}`}
                      className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        {filtered.length} of {cookies.length} cookies
      </p>
    </Modal>
  );
}
