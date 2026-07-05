// Local UI theme override. System = follow OS (prefers-color-scheme).
// Persisted in localStorage: synchronous (no flash on load) and shared across
// all surfaces since every extension page shares one origin. Pure UI pref,
// not a trust boundary — no BG round-trip, no Zod.
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'contabox.theme';

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function setTheme(t: Theme): void {
  if (t === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, t);
  applyTheme(t);
}

// Sets <html data-theme>; CSS keys the dark palette off it (see styles.css).
export function applyTheme(t: Theme = getTheme()): void {
  const el = document.documentElement;
  if (t === 'system') delete el.dataset.theme;
  else el.dataset.theme = t;
}
