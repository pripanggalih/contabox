/**
 * Browser API surface.
 *
 * In Firefox the global `browser` is promise-native — we use it directly.
 * In jsdom tests, the test setup mounts a mock on `globalThis.browser` before
 * any module touches `browser.*`. To keep both paths working without an eager
 * import of `webextension-polyfill` (which throws outside an extension), we
 * expose a lazy Proxy that forwards every property access to whatever lives
 * on `globalThis.browser` at call time.
 */
import type browserPolyfill from 'webextension-polyfill';

type BrowserNs = typeof browserPolyfill;

function getNamespace(): Record<string, unknown> {
  const g = globalThis as Record<string, unknown>;
  const ns = g.browser ?? g.chrome;
  if (!ns) {
    throw new Error(
      'No browser API available. In tests, set `globalThis.browser` before invoking.',
    );
  }
  return ns as Record<string, unknown>;
}

export const browser: BrowserNs = new Proxy({} as BrowserNs, {
  get(_target, prop) {
    return (getNamespace() as Record<string, unknown>)[prop as string];
  },
});

export type Browser = typeof browser;
