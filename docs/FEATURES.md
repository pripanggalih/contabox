# Feature Catalog — Contabox

**Version:** 0.1
**Last updated:** 2026-05-25

Detailed feature inventory grouped by tier. Tiers map to roadmap milestones (see `ROADMAP.md`).

---

## Tier 1 — Core (MVP)

### F1.1 Container CRUD
Full lifecycle management on top of `contextualIdentities`. Renaming/recoloring is instant. Deletion offers confirmation and a 24-hour soft-delete recovery window via local storage.

**Acceptance:**
- Create container with name, color, icon in ≤ 1 click after sidebar opens
- Rename inline by double-click
- Delete with confirm dialog + undo toast (5s)

### F1.2 Bulk Create
Spawn N containers from a template in one operation.

- Naming pattern with tokens: `{n}`, `{n:03}`, `{date}`, `{uuid4}`, `{random:5}`
- Live preview shows first 5 names before commit
- Progress bar for N > 10

**Acceptance:**
- Create 50 containers in < 5s
- Cancel mid-operation cleans up partial state

### F1.3 Bulk Open URL
Open one URL across N selected containers simultaneously.

- Window options: same window (tab group) or new window
- Stagger option (open every 200ms) to avoid rate-limiting target site

### F1.4 Container Templates
Reusable presets for fast onboarding.

- Stored locally; exportable as JSON
- Template applied to new bulk-create
- Template applied to existing container (overrides metadata, prompts before overwrite)

### F1.5 Workspaces
Logical grouping for many containers.

- Tree: Workspace > Container > Tab
- A container ∈ ≤ 1 workspace
- "Orphan" workspace shows uncategorized
- Workspace actions: Open all, Close all, Hibernate, Rename, Color

### F1.6 Sidebar UI
Persistent sidebar via `sidebar_action`.

- Virtual scroll for 500+ containers
- Status icons: proxy on, fingerprint custom, locked, snapshot recent
- Drag-and-drop reorder within workspace; drag across workspaces to move
- Filter chips: Active, With Tabs, Locked, By Tag

### F1.7 Command Palette
`Cmd/Ctrl+K` overlay.

- Fuzzy search across containers, workspaces, templates, snapshots, actions
- Recent actions section at top
- Result preview pane (container icon, tab count, proxy status)
- ESC to dismiss

### F1.8 Popup
Lightweight quick view for current tab.

- Shows container of active tab
- "Move to container" submenu
- "Reopen in container" submenu
- Link to sidebar

### F1.9 Onboarding
First-run wizard.

- Detects existing MAC containers → offers import
- Optional master password setup for vault
- Quick tour (3 steps): sidebar, templates, command palette

### F1.10 Settings / Options Page
Configuration UI in full tab.

- General: theme, default workspace, command palette shortcut
- Privacy: telemetry opt-in toggle, debug log export, scheduled proxy health interval
- Vault: lock timer, change master password, encrypted export/import
- Advanced: experimental flags

---

## Tier 2 — Power User

### F2.1 Proxy per Container
Native proxy routing via `proxy.onRequest` and `cookieStoreId` filter.

- Supported: HTTP, HTTPS, SOCKS4, SOCKS5 (with auth)
- Credential storage in vault
- Per-container fallback chain: container proxy → workspace proxy → none

**Acceptance:**
- Setting proxy applies without browser restart
- WebRTC IP leak test passes when `webrtcMode: 'proxy'`

### F2.2 Proxy Pools & Rotation
Group proxies, rotate per strategy.

- Strategies: random, round-robin, sticky-per-session (same proxy for same TLD until cookie cleared), weighted (by health)
- Cooldown: seconds before a proxy can be reused
- Bulk import from `host:port:user:pass` lines or JSON

### F2.3 Proxy Health Check
Probe configurable endpoint (default `https://httpbin.org/ip`).

- Manual button + scheduled (every N minutes)
- Latency + IP echo displayed in proxy list
- Auto-disable unhealthy proxy after 3 consecutive fails

### F2.4 Fingerprint per Container
Spoof JS APIs + headers per container.

**Spoofed surfaces:**
- `navigator.userAgent`, `navigator.platform`, `navigator.language(s)`
- `navigator.hardwareConcurrency`, `navigator.deviceMemory`
- `screen.width/height/colorDepth/availWidth/availHeight`
- `Canvas.toDataURL` + `getImageData` with noise injection
- `WebGLRenderingContext.getParameter` (vendor, renderer, version)
- `AudioContext` analyser node noise
- `Intl.DateTimeFormat().resolvedOptions().timeZone`
- `Date.prototype.getTimezoneOffset`
- `document.fonts` allowlist
- `Accept-Language` header rewrite

**Presets:**
- Windows-Chrome-Latest
- Windows-Firefox-Latest
- macOS-Safari-Latest
- macOS-Firefox-Latest
- Linux-Firefox-ESR
- Android-Chrome
- Random (regenerate button)

### F2.5 Auto-Assign Rules
URL → container routing.

- Pattern types: substring, glob, regex
- Action: open in container, redirect existing tab, prompt user
- Conflict resolution: priority order (drag to reorder)
- Live test field in rule editor

### F2.6 Session Snapshots
Capture and restore browsing state.

- Captures: cookies, localStorage, sessionStorage, IndexedDB (opt-in per
  container via `snapshotIncludeIdb`)
- Per-origin granularity (user can choose subset of origins)
- Manual save with label, or auto-save (when `autoSnapshot` is on) on
  container-idle (last tab closed) or pre-delete
- Browse snapshots: timeline view per container
- Diff viewer: what changed since previous snapshot
- Retention: per-container `retentionDays` (0 = forever) auto-prunes only
  rows whose label starts with `auto · `

**Acceptance:**
- Snapshot of typical site (≤ 10MB IDB) saves in < 1s
- Restore reproduces login on apps like GitHub, Notion, Linear

### F2.7 Cookie Editor
GUI cookie jar editor per container.

- View, edit, delete cookies per origin
- Import: Netscape `cookies.txt`, JSON array, raw `document.cookie`
- Export: same formats
- Search and filter

### F2.8 Tag System
Free-form tags on containers for organization beyond workspaces.

- Multi-select tags
- Tag-based filter in sidebar
- Tag-based bulk action target

### F2.9 Keyboard Shortcuts
Configurable shortcuts.

- Defaults: `Cmd+K` palette, `Cmd+Shift+C` new container, `Cmd+Shift+L` lock all
- Per-container shortcut assignment (e.g., `Cmd+1` opens default URL in container 1)

---

## Tier 3 — Differentiators

### F3.1 Container Lock
Password-gate sensitive containers.

- Lock individual containers with PIN (4–12 digits, PBKDF2-100k) or fall back
  to the global vault master password
- Locked container: tabs hidden via `tabs.hide` until unlocked
- Cannot be opened until unlocked; sidebar prompts on open attempt
- Session-unlock state cleared on `vault.lock` and on browser close
- "Lock all" keyboard shortcut (`Ctrl+Shift+L`) re-locks every container

### F3.2 Credential Vault
Encrypted credential storage with per-container scoping.

- Manual entry + browser import (Firefox Lockwise JSON)
- Autofill via content script (scoped to matching origin + container)
- Search vault from command palette

### F3.3 2FA TOTP
Built-in time-based one-time password generator.

- Add by secret string or QR scan (camera permission opt-in)
- Auto-fill OTP into focused 6-digit input
- Per-container scoping

### F3.4 Encrypted Template Sync
Optional cloud sync of *templates only* (not cookies/snapshots).

- Backends: GitHub Gist, generic WebDAV, S3-compatible
- E2E encrypted with user key (derived from sync passphrase)
- Conflict resolution: last-write-wins with diff prompt

### F3.5 Activity Log
Per-container event timeline.

- Events: opened, closed, login detected (heuristic), proxy switched, snapshot taken
- Local-only, configurable retention (default 30 days)

### F3.6 Bandwidth Analytics
Track data usage per container.

- Source: `webRequest.onCompleted` response sizes
- Display: chart per container, per day
- Optional alert at threshold

### F3.7 Webhook on Event
Fire HTTP POST on container events.

- Events: container created, tab opened, snapshot taken, cookie expiring
- Configurable per-event webhook URL
- Useful for external automation (Make, n8n, Zapier-like)

### F3.8 Native Messaging API
Local socket for programmatic control.

- Companion Native Messaging Host (separate binary, Rust)
- Commands: create container, open URL, take snapshot, list containers
- Auth: shared secret in installer
- Use case: integrate with Puppeteer-like external scripts

---

## Tier 4 — Pro / Niche

### F4.1 Profile Farm Mode
Manage 100+ containers as a fleet.

- Bulk health dashboard (cookies valid, proxy alive, last login)
- Warmup scheduler: open default URLs on random cadence to age cookies
- Auto-suspend stale containers

### F4.2 Cookie Aging Simulation
Background tab visits to simulate human session.

- Configurable list of URLs to "visit" periodically
- Random intervals within bounds
- Scroll/click simulation (limited — WebExtension API caps)

### F4.3 Anti-Detect Score
In-extension fingerprint quality test.

- Run against pixelscan.net, creepjs.com, fingerprintjs.com (results parsed locally)
- Score and surface-level diagnostics
- Per-container test history

### F4.4 CSV Bulk Import
Spreadsheet-driven container creation.

- Columns: name, color, icon, proxy_uri, ua_preset, tags, workspace, notes
- Dry-run preview
- Error report row-by-row

### F4.5 Container Cloning with State
Clone a container *including* its current cookies/storage.

- Resulting container is a logical "fork"
- Useful for branching test scenarios

### F4.6 Tor Preset
One-click Tor proxy with sane defaults.

- Auto-configure SOCKS5 to `127.0.0.1:9150` (Tor Browser bundle port)
- Documentation: requires Tor running locally
- Hardened fingerprint preset paired (Tor Browser-like)

---

## Excluded Features (and Why)

| Feature | Reason |
|---|---|
| Selling/sharing cookies | Legal/ethical risk; abuse vector |
| Account marketplace | Out of scope, abuse risk |
| VPN integration | Proxy covers 90% of use cases; VPN belongs at OS level |
| Mobile/Android | Firefox Android extension API too limited as of 2026 |
| Chromium port | Separate project (`multi-session`) |
| Server-side state | Local-first principle |
| Auto-create accounts on websites | Out of scope; CAPTCHA arms race |
