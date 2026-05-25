import { useMemo } from 'react';
import { useContaboxStore } from '../state/store';

/**
 * Compact chip row showing all tags currently in use, with active filter
 * highlighted. Click toggles. Hidden when no tags exist anywhere.
 */
export function TagFilterBar() {
  const containers = useContaboxStore((s) => s.containers);
  const tagFilter = useContaboxStore((s) => s.tagFilter);
  const setTagFilter = useContaboxStore((s) => s.setTagFilter);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of containers) {
      for (const t of c.ext.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [containers]);

  if (tagCounts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] px-2 py-1.5">
      {tagFilter ? (
        <button
          type="button"
          onClick={() => setTagFilter(null)}
          className="rounded-full bg-[var(--color-bg-hover)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          Clear
        </button>
      ) : null}
      {tagCounts.map(([tag, count]) => {
        const active = tagFilter === tag;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => setTagFilter(active ? null : tag)}
            aria-pressed={active}
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              active
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            #{tag} <span className="opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
