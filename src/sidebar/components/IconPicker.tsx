import type { ContainerIcon } from '@shared/types';
/**
 * Searchable Lucide icon picker.
 *
 * The catalog of selectable icons lives in `palette.ts` (CUSTOM_ICON_CATALOG)
 * — about 100 hand-picked Lucide icons grouped by category. Keeping the list
 * explicit lets esbuild tree-shake the lucide-react library down to just the
 * icons we ship, instead of pulling in all ~1500.
 *
 * Layout:
 *   - Trigger button shows the current icon (default: native fallback).
 *   - Popover opens beneath the trigger with a search input and a 12-column
 *     grid. The catalog is small enough (~100) that no virtualisation is
 *     needed.
 */
import { Search, Shuffle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CUSTOM_ICON_CATALOG, displayIcon, randomLucideIcon } from '../lib/palette';

interface PickedIcon {
  name: string;
  Component: LucideIcon;
}

const ALL_ICONS: PickedIcon[] = Object.entries(CUSTOM_ICON_CATALOG).map(([name, Component]) => ({
  name,
  Component,
}));

interface Props {
  /** Current Lucide name override, or undefined to use native fallback. */
  value?: string;
  /** Native enum used when no custom value is set (drives the trigger preview). */
  nativeIcon: ContainerIcon;
  /** Tint colour applied to icon previews. */
  color?: string;
  /** Pass `undefined` to clear the override (i.e. revert to native). */
  onChange: (value: string | undefined) => void;
}

export function IconPicker({ value, nativeIcon, color, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const TriggerIcon = useMemo(
    () => displayIcon({ icon: nativeIcon, ext: { customIcon: value } }),
    [nativeIcon, value],
  );

  // Filter — quick case-insensitive substring + prefix bias.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_ICONS;
    const exact: PickedIcon[] = [];
    const prefix: PickedIcon[] = [];
    const contains: PickedIcon[] = [];
    for (const it of ALL_ICONS) {
      const lc = it.name.toLowerCase();
      if (lc === q) exact.push(it);
      else if (lc.startsWith(q)) prefix.push(it);
      else if (lc.includes(q)) contains.push(it);
    }
    return [...exact, ...prefix, ...contains];
  }, [query]);

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Auto-focus search input when popover opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-sm hover:bg-[var(--color-bg-hover)]"
        >
          <span className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md"
              style={
                color
                  ? { color, background: `${color}1a` }
                  : { background: 'var(--color-bg-hover)' }
              }
            >
              <TriggerIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {value ?? `${nativeIcon} (native)`}
            </span>
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {open ? 'close' : 'change'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onChange(randomLucideIcon())}
          title="Pick a random icon"
          aria-label="Pick a random icon"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent)]"
        >
          <Shuffle className="h-3.5 w-3.5" />
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Pick an icon"
          className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${ALL_ICONS.length} icons…`}
              spellCheck={false}
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            {value !== undefined ? (
              <button
                type="button"
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                className="rounded px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
              >
                Reset
              </button>
            ) : null}
          </div>

          <div
            className="grid max-h-64 gap-0.5 overflow-y-auto p-1.5"
            style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}
          >
            {matches.length === 0 ? (
              <div className="col-span-12 px-2 py-6 text-center text-xs text-[var(--color-text-muted)]">
                No icons match "{query}".
              </div>
            ) : (
              matches.map(({ name, Component }) => {
                const selected = value === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={selected}
                    onClick={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                      selected
                        ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <Component className="h-3.5 w-3.5" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
