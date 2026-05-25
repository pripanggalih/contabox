/**
 * Autofill content script.
 *
 * Runs in every http(s) page. Detects login forms and OTP fields and offers
 * to fill them with credentials scoped to (this container × this origin).
 *
 * Architecture:
 *   - Pure DOM. No imports from `@shared/messaging` because content scripts
 *     are bundled as IIFE — keep them tiny and dependency-free. We talk to
 *     the BG via `browser.runtime.sendMessage` directly.
 *   - Trust boundary: this script lives in the page's tab process. We never
 *     touch vault keys; only request short-lived secrets per fill action.
 *   - Defensive: if `browser` is absent (page sandbox / unit tests), the
 *     script no-ops silently.
 *
 * UI:
 *   - A single floating "Contabox" button hovers over the focused password or
 *     OTP input when matching credentials exist. Clicking opens a tiny picker
 *     listing available labels.
 *   - All UI is rendered inside a closed shadow DOM root so page CSS / page
 *     scripts can't reach in (mitigates T1 from SECURITY.md).
 */

interface MatchEntry {
  id: string;
  kind: 'password' | 'totp';
  label: string;
  origin: string;
  scope: 'global' | 'container';
}

(() => {
  // Content scripts in Firefox expose `browser`. We also tolerate `chrome` for
  // any future Chromium port. Both globals come from the host runtime, not the
  // page world.
  const g = globalThis as { browser?: typeof browser; chrome?: typeof browser };
  const maybeBrowser = g.browser ?? g.chrome ?? null;
  if (!maybeBrowser?.runtime?.sendMessage) return;
  const browserApi: typeof browser = maybeBrowser;

  // Avoid double-injection if the script is loaded twice somehow.
  const FLAG = '__contaboxAutofillInstalled';
  const w = window as unknown as Record<string, unknown>;
  if (w[FLAG]) return;
  w[FLAG] = true;

  const HOST_ID = 'contabox-autofill-host';
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let currentInput: HTMLInputElement | null = null;
  let currentMatches: MatchEntry[] = [];

  const OTP_RE =
    /(\botp\b|\bone[\s-]?time\b|\bauth(entication)?\s?code\b|\b2fa\b|\bmfa\b|\bverification\b)/i;

  function isPasswordInput(el: Element | null): el is HTMLInputElement {
    return (
      !!el &&
      el instanceof HTMLInputElement &&
      el.type === 'password' &&
      !el.readOnly &&
      !el.disabled
    );
  }

  function isOtpInput(el: Element | null): el is HTMLInputElement {
    if (!el || !(el instanceof HTMLInputElement)) return false;
    if (el.readOnly || el.disabled) return false;

    // Most common: numeric input with maxLength 6.
    if (
      (el.type === 'tel' || el.type === 'text' || el.type === 'number') &&
      el.maxLength >= 4 &&
      el.maxLength <= 8
    ) {
      const inputmode = el.getAttribute('inputmode')?.toLowerCase() ?? '';
      if (inputmode === 'numeric') return true;
      const autocomplete = el.getAttribute('autocomplete')?.toLowerCase() ?? '';
      if (autocomplete === 'one-time-code') return true;
    }
    // Fallback: name / id / aria-label hints.
    const haystack = `${el.name} ${el.id} ${el.getAttribute('aria-label') ?? ''} ${el.placeholder ?? ''}`;
    return OTP_RE.test(haystack);
  }

  function ensureShadow(): ShadowRoot {
    if (shadow) return shadow;
    host = document.createElement('div');
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: 'fixed',
      zIndex: '2147483647',
      top: '0',
      left: '0',
      pointerEvents: 'none',
    });
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      .button {
        pointer-events: auto;
        position: fixed;
        background: #1a1a1a;
        color: #fff;
        border: 1px solid #444;
        border-radius: 6px;
        font: 600 11px/1 system-ui, -apple-system, sans-serif;
        padding: 5px 8px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,.3);
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .button:hover { background: #2a2a2a; }
      .picker {
        pointer-events: auto;
        position: fixed;
        background: #1a1a1a;
        color: #fff;
        border: 1px solid #444;
        border-radius: 8px;
        font: 12px/1.4 system-ui, -apple-system, sans-serif;
        min-width: 220px;
        max-width: 320px;
        box-shadow: 0 8px 24px rgba(0,0,0,.4);
        overflow: hidden;
      }
      .picker .row {
        padding: 8px 10px;
        cursor: pointer;
        border-bottom: 1px solid #2c2c2c;
      }
      .picker .row:last-child { border-bottom: none; }
      .picker .row:hover { background: #2a2a2a; }
      .picker .label { font-weight: 600; }
      .picker .meta { color: #888; font-size: 11px; margin-top: 2px; }
      .dot { width: 6px; height: 6px; border-radius: 50%; background: #6cf; display: inline-block; }
    `;
    shadow.appendChild(style);
    return shadow;
  }

  function clearOverlay() {
    if (!shadow) return;
    while (shadow.children.length > 1) {
      // keep <style>
      shadow.removeChild(shadow.lastChild as Node);
    }
  }

  function showButton(input: HTMLInputElement, kind: 'password' | 'totp') {
    const root = ensureShadow();
    clearOverlay();

    const btn = document.createElement('div');
    btn.className = 'button';
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    const dot = document.createElement('span');
    dot.className = 'dot';
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(kind === 'totp' ? 'Fill OTP' : 'Fill login'));

    const rect = input.getBoundingClientRect();
    btn.style.top = `${rect.top + window.scrollY - 28}px`;
    btn.style.left = `${rect.right + window.scrollX - 96}px`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      void showPicker(
        input,
        currentMatches.filter((m) => m.kind === kind),
      );
    });
    btn.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault();
        void showPicker(
          input,
          currentMatches.filter((m) => m.kind === kind),
        );
      }
    });
    root.appendChild(btn);
  }

  async function showPicker(input: HTMLInputElement, matches: MatchEntry[]) {
    const root = ensureShadow();
    clearOverlay();
    const picker = document.createElement('div');
    picker.className = 'picker';
    const rect = input.getBoundingClientRect();
    picker.style.top = `${rect.bottom + window.scrollY + 4}px`;
    picker.style.left = `${rect.left + window.scrollX}px`;

    if (matches.length === 0) {
      const row = document.createElement('div');
      row.className = 'row';
      row.textContent = 'No matching entries';
      picker.appendChild(row);
    }

    for (const m of matches) {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      const lbl = document.createElement('div');
      lbl.className = 'label';
      lbl.textContent = m.label || m.origin;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${m.kind === 'totp' ? '6-digit code' : 'password'} · ${m.scope}`;
      row.appendChild(lbl);
      row.appendChild(meta);
      const fillHandler = async (ev: Event) => {
        ev.stopPropagation();
        try {
          const res = (await browserApi.runtime.sendMessage({
            type: 'autofill.getSecret',
            payload: { id: m.id, origin: window.location.origin },
          })) as { ok: true; data: { secret: string } } | { ok: false; error: string };
          if (!res || !('ok' in res)) return;
          if (!res.ok) {
            console.warn('[contabox] autofill.getSecret failed', res.error);
            return;
          }
          fillInput(input, res.data.secret);
        } finally {
          clearOverlay();
        }
      };
      row.addEventListener('click', fillHandler);
      row.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') void fillHandler(e);
      });
      picker.appendChild(row);
    }
    root.appendChild(picker);
  }

  /**
   * Fill an input value while triggering the events React/Vue/etc. depend on
   * to recognise the change. Native setter dispatch + input/change events.
   */
  function fillInput(input: HTMLInputElement, value: string) {
    const proto = Object.getPrototypeOf(input) as HTMLInputElement;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function refreshMatches(): Promise<void> {
    try {
      const res = (await browserApi.runtime.sendMessage({
        type: 'autofill.match',
        payload: { origin: window.location.origin },
      })) as { ok: true; data: MatchEntry[] } | { ok: false } | undefined;
      if (res && 'ok' in res && res.ok) {
        currentMatches = res.data;
      } else {
        currentMatches = [];
      }
    } catch {
      currentMatches = [];
    }
  }

  function onFocusIn(e: FocusEvent) {
    const target = e.target as Element | null;
    if (!target) return;
    if (isOtpInput(target)) {
      currentInput = target;
      const otp = currentMatches.filter((m) => m.kind === 'totp');
      if (otp.length > 0) showButton(target, 'totp');
      return;
    }
    if (isPasswordInput(target)) {
      currentInput = target;
      const pw = currentMatches.filter((m) => m.kind === 'password');
      if (pw.length > 0) showButton(target, 'password');
      return;
    }
    // Focused something else — clear any open overlay.
    clearOverlay();
    currentInput = null;
  }

  function onScrollOrResize() {
    if (!currentInput) {
      clearOverlay();
      return;
    }
    // Re-position the button under the new input rect.
    if (isOtpInput(currentInput)) showButton(currentInput, 'totp');
    else if (isPasswordInput(currentInput)) showButton(currentInput, 'password');
  }

  function onClickOutside(e: MouseEvent) {
    const path = e.composedPath();
    if (host && path.includes(host)) return;
    clearOverlay();
  }

  // Boot — fetch matches once on load, then on visibility change refresh.
  void refreshMatches();
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('mousedown', onClickOutside, true);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshMatches();
  });
})();
