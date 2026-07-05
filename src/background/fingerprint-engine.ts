/**
 * FingerprintEngine — orchestrates fingerprint spoofing.
 *
 * Two surfaces, kept consistent so a site never sees a spoofed header next to a
 * real JS value (the classic detectable mismatch):
 *
 *   1. JS APIs in the page world — the spoof runs at the VERY START of the
 *      document, before any page script, by injecting an inline `<script>` into
 *      the HTML response stream via `webRequest.filterResponseData`. The profile
 *      is embedded in that script, so there is NO async round-trip and NO race
 *      (unlike `scripting.executeScript`, which can lose to inline page scripts).
 *      Because the inline script would otherwise be blocked by a strict page CSP,
 *      we add a per-response nonce to the CSP's `script-src` (we EXTEND the
 *      policy for our one script — we never strip the page's protections).
 *      Runtimes without stream filtering fall back to the executeScript hook.
 *   2. HTTP headers (`User-Agent`, `Accept-Language`) — rewritten via
 *      `webRequest.onBeforeSendHeaders` keyed on cookieStoreId.
 *
 * In-memory `routing` map is the hot-path source of truth; `refresh()` rebuilds
 * it after profile/container assignment changes.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import { FINGERPRINT_PRESETS, presetByKey, randomizeFromPreset } from '@shared/fingerprint-presets';
import type { FingerprintProfile } from '@shared/types';
import { now, uuid } from '@shared/utils';

/** Max bytes we buffer while hunting for the HTML injection point before giving
 *  up and streaming the response through untouched. */
const MAX_SCAN_BYTES = 256 * 1024;
const EMPTY_BYTES = new Uint8Array(0);

export class FingerprintEngine {
  private attached = false;
  private routing = new Map<string, FingerprintProfile>();

  async attach(): Promise<void> {
    if (this.attached) return;
    // Register listeners FIRST (synchronously). MV3 event pages must add
    // listeners in the first turn; doing it after the awaits below risks missing
    // the navigation that woke the worker. Until `refresh()` fills the routing
    // map, every handler simply no-ops (safe).
    this.attachInjector();
    this.attachHeaderRewrite();
    this.attached = true;
    await this.seedDefaultsIfEmpty();
    await this.refresh();
  }

  /** Recompute routing. Call after assignment changes. */
  async refresh(): Promise<void> {
    const containers = await getDb().containers.toArray();
    const profiles = await getDb().fingerprints.toArray();
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    this.routing.clear();
    for (const c of containers) {
      if (!c.fingerprintId) continue;
      const profile = profileMap.get(c.fingerprintId);
      if (profile) this.routing.set(c.cookieStoreId, profile);
    }
  }

  routeFor(cookieStoreId: string): FingerprintProfile | undefined {
    return this.routing.get(cookieStoreId);
  }

  private attachTabHook(): void {
    const tabs = (browser as { tabs?: typeof browser.tabs }).tabs;
    if (!tabs?.onUpdated) return;

    tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      // Inject as early as possible — `loading` with a URL is the first event
      // after navigation begins. document_start equivalent.
      if (changeInfo.status !== 'loading' || !tab.url) return;
      if (!tab.cookieStoreId || tab.cookieStoreId === 'firefox-default') return;
      const profile = this.routeFor(tab.cookieStoreId);
      if (!profile) return;
      // Skip privileged URLs.
      if (!/^https?:\/\//i.test(tab.url)) return;

      const scripting = (browser as { scripting?: typeof browser.scripting }).scripting;
      if (!scripting?.executeScript) return;
      try {
        await scripting.executeScript({
          // Cover sub-frames too: ad/tracker iframes are the usual
          // fingerprinting surface, and a frame seeing the real navigator.* while
          // the UA header is spoofed is a trivially-detectable inconsistency.
          target: { tabId, allFrames: true } as never,
          world: 'MAIN' as never,
          injectImmediately: true as never,
          args: [serializeProfile(profile)] as never,
          func: spoofFn as never,
        });
      } catch (err) {
        // Pages we can't access (about:, addons.mozilla.org, etc.) — ignore.
        void err;
      }
    });
  }

  /**
   * Prefer stream-filter injection (race-free, per-container). Fall back to the
   * executeScript tab hook only when `filterResponseData` is unavailable.
   */
  private attachInjector(): void {
    const wr = (browser as unknown as { webRequest?: WebRequestLike }).webRequest;
    if (wr?.onHeadersReceived?.addListener && typeof wr.filterResponseData === 'function') {
      wr.onHeadersReceived.addListener(
        this.onHeadersInject as never,
        { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame'] as never },
        ['blocking', 'responseHeaders'] as never,
      );
    } else {
      this.attachTabHook();
    }
  }

  /**
   * onHeadersReceived handler: for HTML responses in a spoofed container, add a
   * nonce to the CSP and stream-inject an inline spoof `<script>` at the top of
   * the document so it runs before any page script.
   */
  private onHeadersInject = (details: {
    requestId: string;
    cookieStoreId?: string;
    responseHeaders?: Array<{ name: string; value?: string }>;
  }): { responseHeaders?: Array<{ name: string; value?: string }> } => {
    const profile = details.cookieStoreId ? this.routing.get(details.cookieStoreId) : undefined;
    if (!profile) return {};
    const headers = details.responseHeaders ?? [];
    const contentType = headers.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '';
    if (!/^\s*text\/html\b/i.test(contentType)) return {};

    const wr = (browser as unknown as { webRequest?: WebRequestLike }).webRequest;
    const filterFactory = wr?.filterResponseData;
    if (!filterFactory) return {};

    const nonce = makeNonce();
    const scriptBytes = buildInjectedScript(profile, nonce);
    const filter = filterFactory(details.requestId);
    let buffer: Uint8Array = EMPTY_BYTES;
    let done = false;

    filter.ondata = (event: { data: ArrayBuffer }) => {
      const chunk = new Uint8Array(event.data);
      if (done) {
        filter.write(chunk);
        return;
      }
      buffer = concatBytes(buffer, chunk);
      const off = findInsertionOffset(buffer);
      if (off >= 0) {
        filter.write(buffer.subarray(0, off));
        filter.write(scriptBytes);
        filter.write(buffer.subarray(off));
        done = true;
        buffer = EMPTY_BYTES;
      } else if (buffer.length > MAX_SCAN_BYTES) {
        // No injection point found — stream the response through unmodified.
        filter.write(buffer);
        done = true;
        buffer = EMPTY_BYTES;
      }
    };
    filter.onstop = () => {
      if (!done && buffer.length) filter.write(buffer);
      try {
        filter.close();
      } catch {
        /* already closed */
      }
    };
    filter.onerror = () => {
      /* upstream error — nothing to flush */
    };

    return { responseHeaders: addNonceToCsp(headers, nonce) };
  };

  private attachHeaderRewrite(): void {
    const wr = (browser as { webRequest?: typeof browser.webRequest }).webRequest;
    if (!wr?.onBeforeSendHeaders) return;

    wr.onBeforeSendHeaders.addListener(
      (details: {
        cookieStoreId?: string;
        requestHeaders?: Array<{ name: string; value?: string }>;
      }) => {
        if (!details.cookieStoreId) return {};
        const profile = this.routing.get(details.cookieStoreId);
        if (!profile || !details.requestHeaders) return {};

        const headers = details.requestHeaders.map((h) => ({ ...h }));
        for (const h of headers) {
          const lower = h.name.toLowerCase();
          if (lower === 'user-agent') h.value = profile.ua;
          else if (lower === 'accept-language') h.value = profile.language;
        }
        return { requestHeaders: headers };
      },
      { urls: ['<all_urls>'] },
      ['blocking', 'requestHeaders'] as never,
    );
  }

  private async seedDefaultsIfEmpty(): Promise<void> {
    const count = await getDb().fingerprints.count();
    if (count > 0) return;
    const rows: FingerprintProfile[] = FINGERPRINT_PRESETS.map((p) => ({
      id: uuid(),
      name: p.name,
      source: 'preset',
      ...p.seed,
      createdAt: now(),
    }));
    await getDb().fingerprints.bulkPut(rows);
  }
}

interface SerializedProfile {
  ua: string;
  canvasNoise: number;
  webglVendor: string;
  webglRenderer: string;
  audioNoise: number;
  width: number;
  height: number;
  colorDepth: number;
  timezone: string;
  language: string;
  hardwareConcurrency: number;
  deviceMemory: number;
}

function serializeProfile(p: FingerprintProfile): SerializedProfile {
  return {
    ua: p.ua,
    canvasNoise: p.canvas.noise,
    webglVendor: p.webgl.vendor,
    webglRenderer: p.webgl.renderer,
    audioNoise: p.audio.noise,
    width: p.screen.width,
    height: p.screen.height,
    colorDepth: p.screen.colorDepth,
    timezone: p.timezone,
    language: p.language,
    hardwareConcurrency: p.hardwareConcurrency,
    deviceMemory: p.deviceMemory,
  };
}

/** Minimal shape of Firefox's `nsIStreamFilter` (webRequest.filterResponseData). */
interface StreamFilter {
  ondata: (event: { data: ArrayBuffer }) => void;
  onstop: () => void;
  onerror: () => void;
  write: (data: ArrayBuffer | Uint8Array) => void;
  close: () => void;
  disconnect: () => void;
}

/** The slice of `browser.webRequest` we touch (Firefox-only stream filtering). */
interface WebRequestLike {
  onHeadersReceived?: { addListener: Function };
  filterResponseData?: (requestId: string) => StreamFilter;
}

/** Random CSP nonce token (hex — valid nonce-value characters). */
function makeNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Build the inline `<script>` bytes to inject. Pure ASCII (profile strings are
 * ASCII; any stray non-ASCII / `<` is \u-escaped) so it can be spliced into the
 * response at the byte level without decoding the page's charset.
 */
function buildInjectedScript(profile: FingerprintProfile, nonce: string): Uint8Array {
  const data = serializeProfile(profile);
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    // Escape every non-ASCII code unit so the payload is pure ASCII and can be
    // spliced into the response at the byte level regardless of page charset.
    .replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const html = `<script nonce="${nonce}">;(${spoofFn.toString()})(${json});</script>`;
  return new TextEncoder().encode(html);
}

/**
 * Byte offset just after the first structural anchor (`<head>` preferred, then
 * `<html>`, then the doctype). Returns -1 if the anchor isn't in the buffer yet
 * (caller should wait for more data). latin1 decoding is a 1:1 byte↔char map so
 * a char index equals the byte index for any ASCII-compatible charset.
 */
export function findInsertionOffset(buf: Uint8Array): number {
  const window = buf.subarray(0, Math.min(buf.length, MAX_SCAN_BYTES));
  const text = new TextDecoder('latin1').decode(window).toLowerCase();
  for (const anchor of ['<head', '<html', '<!doctype']) {
    const i = text.indexOf(anchor);
    if (i === -1) continue;
    const gt = text.indexOf('>', i);
    return gt === -1 ? -1 : gt + 1; // wait for '>' if the tag is split across chunks
  }
  return -1;
}

/**
 * Return a copy of the response headers with our `nonce` added to whichever CSP
 * directive governs inline `<script>` elements. We EXTEND the page's policy
 * (allow our one script) rather than stripping it — the page keeps every other
 * protection. Headers without a script-governing directive are left untouched.
 */
function addNonceToCsp(
  headers: Array<{ name: string; value?: string }>,
  nonce: string,
): Array<{ name: string; value?: string }> {
  return headers.map((h) => {
    if (h.name.toLowerCase() !== 'content-security-policy' || !h.value) return h;
    return { ...h, value: injectCspNonce(h.value, nonce) };
  });
}

export function injectCspNonce(value: string, nonce: string): string {
  const directives = value
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  const nameOf = (d: string) => d.split(/\s+/)[0]?.toLowerCase() ?? '';
  const token = `'nonce-${nonce}'`;
  const withNonce = (d: string) => {
    const parts = d.split(/\s+/);
    const sources = parts.slice(1);
    // `'none'` must stand alone; replace it rather than appending.
    if (sources.length === 1 && sources[0]?.toLowerCase() === "'none'") {
      return `${parts[0]} ${token}`;
    }
    return `${d} ${token}`;
  };

  const idxElem = directives.findIndex((d) => nameOf(d) === 'script-src-elem');
  const idxSrc = directives.findIndex((d) => nameOf(d) === 'script-src');
  const idxDefault = directives.findIndex((d) => nameOf(d) === 'default-src');

  if (idxElem !== -1) {
    directives[idxElem] = withNonce(directives[idxElem] as string);
  } else if (idxSrc !== -1) {
    directives[idxSrc] = withNonce(directives[idxSrc] as string);
  } else if (idxDefault !== -1) {
    // No explicit script directive — mirror default-src into a script-src that
    // additionally trusts our nonce, so we don't loosen non-script fetches.
    const defSources = (directives[idxDefault] as string)
      .split(/\s+/)
      .slice(1)
      .filter((s) => s.toLowerCase() !== "'none'");
    directives.push(`script-src ${[...defSources, token].join(' ')}`.trim());
  } else {
    return value; // nothing restricts scripts; inline already runs
  }
  return directives.join('; ');
}

/**
 * Page-world spoof function — serialized into the page (inline `<script>` or
 * `executeScript`). Must be self-contained (no closures, no imports). Receives
 * the profile as its sole argument.
 */
function spoofFn(fp: SerializedProfile): void {
  // biome-ignore lint/suspicious/noExplicitAny: page-world dynamic
  type Any = any;

  // Idempotent — the inline injector and the executeScript fallback could both
  // fire; only the first application should install the traps.
  const marker = '__contaboxFpApplied';
  const w = globalThis as unknown as Record<string, unknown>;
  if (w[marker]) return;
  w[marker] = true;

  function defineGetter(target: object, prop: string, value: unknown): void {
    try {
      Object.defineProperty(target, prop, {
        get: () => value,
        configurable: true,
      });
    } catch (e) {
      void e;
    }
  }

  function detectPlatform(ua: string): string {
    if (/Mac OS X|Macintosh/i.test(ua)) return 'MacIntel';
    if (/Linux/i.test(ua)) return 'Linux x86_64';
    if (/Android/i.test(ua)) return 'Linux armv8l';
    return 'Win32';
  }

  defineGetter(Navigator.prototype, 'userAgent', fp.ua);
  defineGetter(Navigator.prototype, 'appVersion', fp.ua.replace(/^Mozilla\/[0-9.]+\s\(/, '('));
  defineGetter(Navigator.prototype, 'platform', detectPlatform(fp.ua));
  defineGetter(Navigator.prototype, 'language', fp.language);
  defineGetter(Navigator.prototype, 'languages', Object.freeze([fp.language, 'en']));
  defineGetter(Navigator.prototype, 'hardwareConcurrency', fp.hardwareConcurrency);
  // Only spoof deviceMemory where the browser actually exposes it. Firefox does
  // NOT implement navigator.deviceMemory — defining it there is itself a tell
  // (real Firefox returns undefined).
  if ('deviceMemory' in Navigator.prototype || 'deviceMemory' in navigator) {
    defineGetter(Navigator.prototype, 'deviceMemory', fp.deviceMemory);
  }

  defineGetter(Screen.prototype, 'width', fp.width);
  defineGetter(Screen.prototype, 'height', fp.height);
  defineGetter(Screen.prototype, 'availWidth', fp.width);
  defineGetter(Screen.prototype, 'availHeight', fp.height - 40);
  defineGetter(Screen.prototype, 'colorDepth', fp.colorDepth);
  defineGetter(Screen.prototype, 'pixelDepth', fp.colorDepth);

  // Timezone — wrap Intl.DateTimeFormat so resolvedOptions returns spoofed tz.
  try {
    const Orig = Intl.DateTimeFormat as Any;
    const Patched = ((locales: Any, options: Any) =>
      new Orig(locales, { ...options, timeZone: fp.timezone })) as Any;
    Patched.prototype = Orig.prototype;
    (Intl as Any).DateTimeFormat = Patched;
  } catch (e) {
    void e;
  }

  // Canvas noise — touch the buffer just enough to change hash.
  try {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement, ...args: Any[]) {
      try {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          const img = ctx.getImageData(0, 0, this.width, this.height);
          const step = Math.max(1, Math.floor(1 / Math.max(fp.canvasNoise, 1e-6)));
          for (let i = 0; i < img.data.length; i += step * 4) {
            img.data[i] = ((img.data[i] ?? 0) ^ 1) & 0xff;
          }
          ctx.putImageData(img, 0, 0);
        }
      } catch (e) {
        void e;
      }
      return origToDataURL.apply(this, args as Any);
    } as Any;
  } catch (e) {
    void e;
  }

  // WebGL renderer / vendor.
  try {
    const wrap = function (this: WebGLRenderingContext, param: number) {
      if (param === 0x9245) return fp.webglVendor;
      if (param === 0x9246) return fp.webglRenderer;
      return (origGetParameter as Any).call(this, param);
    };
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = wrap as Any;
    if (typeof (globalThis as Any).WebGL2RenderingContext !== 'undefined') {
      (globalThis as Any).WebGL2RenderingContext.prototype.getParameter = wrap;
    }
  } catch (e) {
    void e;
  }

  // Audio noise.
  try {
    const orig = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (channel: number) {
      const data = orig.call(this, channel);
      for (let i = 0; i < data.length; i += 1000) {
        const v = data[i];
        if (v !== undefined) data[i] = v + (Math.random() - 0.5) * fp.audioNoise;
      }
      return data;
    };
  } catch (e) {
    void e;
  }
}

export const fingerprintEngine = new FingerprintEngine();

/* ---------- Manager (CRUD) ---------- */

export class FingerprintManager {
  list(): Promise<FingerprintProfile[]> {
    return getDb().fingerprints.toArray();
  }

  async createCustom(
    input: Omit<FingerprintProfile, 'id' | 'createdAt'>,
  ): Promise<FingerprintProfile> {
    const row: FingerprintProfile = { ...input, id: uuid(), createdAt: now() };
    await getDb().fingerprints.put(row);
    await fingerprintEngine.refresh();
    return row;
  }

  async randomFromPreset(presetKey: string): Promise<FingerprintProfile> {
    const preset = presetByKey(presetKey);
    if (!preset) throw new Error('preset not found');
    const seed = randomizeFromPreset(preset);
    return this.createCustom({
      name: `${preset.name} (random ${Date.now().toString(36).slice(-4)})`,
      source: 'random',
      ...seed,
    });
  }

  async update(id: string, patch: Partial<FingerprintProfile>): Promise<FingerprintProfile> {
    const existing = await getDb().fingerprints.get(id);
    if (!existing) throw new Error('profile not found');
    const next: FingerprintProfile = { ...existing, ...patch, id: existing.id };
    await getDb().fingerprints.put(next);
    await fingerprintEngine.refresh();
    return next;
  }

  async delete(id: string): Promise<{ id: string }> {
    await getDb().fingerprints.delete(id);
    await getDb()
      .containers.where('fingerprintId')
      .equals(id)
      .modify((c) => {
        c.fingerprintId = undefined;
      });
    await fingerprintEngine.refresh();
    return { id };
  }
}

export const fingerprintManager = new FingerprintManager();
