import { useMemo } from 'react';
import { useContaboxStore } from '../state/store';
import { ContainerRow } from './ContainerRow';

export function ContainerTree() {
  const containers = useContaboxStore((s) => s.containers);
  const search = useContaboxStore((s) => s.search);
  const loading = useContaboxStore((s) => s.loading);

  const filtered = useMemo(() => {
    if (!search.trim()) return containers;
    const q = search.toLowerCase();
    return containers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.ext.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.ext.notes.toLowerCase().includes(q),
    );
  }, [containers, search]);

  if (loading && containers.length === 0) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]" role="status">
        Loading…
      </div>
    );
  }

  if (containers.length === 0) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        <p className="mb-2 font-medium text-[var(--color-text-primary)]">No containers yet.</p>
        <p>Click "New container" below to create your first.</p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">No matches for "{search}".</div>
    );
  }

  return (
    <ul className="py-1" role="tree" aria-label="Containers">
      {filtered.map((c) => (
        <ContainerRow key={c.cookieStoreId} view={c} />
      ))}
    </ul>
  );
}
