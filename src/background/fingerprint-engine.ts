/**
 * FingerprintEngine — orchestrates fingerprint spoofing.
 *
 * Two surfaces:
 *   1. JS APIs in the page world — overridden via `scripting.executeScript`
 *      with `world: 'MAIN'`, triggered on `tabs.onUpdated` for tabs whose
 *      cookieStoreId has an assigned profile.
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

export class FingerprintEngine {
  private attached = false;
  private routing = new Map<string, FingerprintProfile>();

  async attach(): Promise<void> {
    if (this.attached) return;
    await this.seedDefaultsIfEmpty();
    await this.refresh();
    this.attachTabHook();
    this.attachHeaderRewrite();
    this.attached = true;
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
          target: { tabId },
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

/**
 * Page-world spoof function — serialized into the page via `executeScript`.
 * Must be self-contained (no closures, no imports). Receives the profile as
 * its sole argument.
 */
function spoofFn(fp: SerializedProfile): void {
  // biome-ignore lint/suspicious/noExplicitAny: page-world dynamic
  type Any = any;

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
  defineGetter(Navigator.prototype, 'deviceMemory', fp.deviceMemory);

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
