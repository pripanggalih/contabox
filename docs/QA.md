# QA Checklist — Contabox

**Version:** 0.1
**Last updated:** 2026-05-25

Manual QA checklist for each milestone release. Pair with automated tests; this catches what they miss.

---

## Pre-Release Universal Checklist

Run before tagging any release.

### Environment matrix
- [ ] Firefox Release (latest)
- [ ] Firefox ESR 115+
- [ ] Firefox Developer Edition
- [ ] OS: macOS, Windows, Linux (Ubuntu)

### Smoke
- [ ] Extension loads without console errors
- [ ] Sidebar opens via toolbar button
- [ ] Sidebar opens via View menu
- [ ] Popup opens via toolbar action
- [ ] Options page opens
- [ ] All keyboard shortcuts respond
- [ ] No memory leak after 30 min idle (Task Manager check)

---

## M1 — Container CRUD

- [ ] Create container with name, color, icon
- [ ] Rename inline (double-click)
- [ ] Rename via context menu
- [ ] Change color via picker
- [ ] Change icon via picker
- [ ] Delete container → undo restores it
- [ ] Delete container → after 5s, hard-delete (undo no longer possible)
- [ ] Container survives browser restart
- [ ] Container visible in Firefox's native container UI (consistency)

---

## M2 — Bulk + Templates + Workspaces

### Templates
- [ ] Save current container as template
- [ ] Apply template to new container
- [ ] Apply template overwrites with confirm
- [ ] Export template as JSON
- [ ] Import template from JSON
- [ ] Delete template

### Bulk create
- [ ] Bulk create 5 containers
- [ ] Bulk create 50 containers (perf < 5s)
- [ ] Naming pattern with `{n}` token
- [ ] Naming pattern with `{n:03}` zero-padding
- [ ] Cancel mid-creation cleans up partials
- [ ] Bulk create assigns workspace correctly

### Bulk open
- [ ] Open URL across 5 containers simultaneously
- [ ] Stagger delay respected (visible in network)
- [ ] New window mode vs same window mode

### Workspaces
- [ ] Create workspace with name, color, icon
- [ ] Drag container into workspace
- [ ] Drag container between workspaces
- [ ] Drag container out → goes to Orphaned
- [ ] Open all containers in workspace
- [ ] Hibernate workspace closes all tabs
- [ ] Delete workspace with containers → prompt to move or orphan

---

## M3 — Search, Palette, UX Polish

- [ ] Sidebar search filters by name
- [ ] Sidebar search filters by tag
- [ ] Sidebar search filters by URL (if container has open tab with matching URL)
- [ ] `Cmd+K` opens command palette
- [ ] Palette fuzzy match works
- [ ] Palette executes container open
- [ ] Palette executes action (e.g., "New container")
- [ ] Recent actions appear at top
- [ ] Onboarding wizard shows on first run
- [ ] MAC import: detects existing MAC containers
- [ ] MAC import: migrates with names/colors preserved
- [ ] Virtual scroll handles 500 containers (perf < 200ms paint)
- [ ] Popup shows current tab's container
- [ ] Popup "reopen in container" works

---

## M4 — Proxy Engine

### Functional
- [ ] HTTP proxy assignment routes traffic (verify via httpbin/ip)
- [ ] HTTPS proxy assignment
- [ ] SOCKS5 proxy with auth
- [ ] SOCKS5 proxy without auth
- [ ] No proxy = direct connection (regression check)
- [ ] Proxy applies immediately (no browser restart)
- [ ] Proxy survives browser restart
- [ ] Two containers on different proxies show different IPs simultaneously

### Pools
- [ ] Round-robin rotates as expected
- [ ] Random rotation visibly varies
- [ ] Sticky-per-session keeps same proxy until cookies cleared
- [ ] Cooldown prevents reuse within window

### Health check
- [ ] Manual health check button shows result
- [ ] Scheduled health check runs at interval
- [ ] Unhealthy proxy auto-disables after 3 fails
- [ ] Health endpoint configurable

### Leak protection
- [ ] WebRTC leak test passes with `webrtcMode: 'proxy'`
- [ ] WebRTC disabled mode blocks RTC entirely
- [ ] DNS leak check (via dnsleaktest.com or similar)

### Vault
- [ ] Master password sets vault key
- [ ] Wrong password rejected
- [ ] Lockout after 5 fails
- [ ] Proxy credential encrypts at rest
- [ ] Vault locks after idle timer

---

## M5 — Fingerprint Engine

### Per-surface verification
For each container with custom FP, verify via creepjs.com and pixelscan.net:

- [ ] User-Agent matches preset
- [ ] `navigator.platform` matches
- [ ] `navigator.language` matches
- [ ] `Accept-Language` header matches (Network tab check)
- [ ] `screen.width` / `screen.height` match
- [ ] `screen.colorDepth` matches
- [ ] `navigator.hardwareConcurrency` matches
- [ ] `navigator.deviceMemory` matches
- [ ] Canvas hash differs between containers (creepjs)
- [ ] WebGL vendor/renderer matches preset
- [ ] AudioContext hash differs between containers
- [ ] Timezone matches (`new Date().getTimezoneOffset()`)
- [ ] `Intl.DateTimeFormat().resolvedOptions().timeZone` matches
- [ ] Font enumeration matches allowlist (within browser limits)

### Cross-container isolation
- [ ] Two containers with same preset → identical fingerprint (preset is deterministic)
- [ ] Two containers with Random preset → different fingerprints
- [ ] Container without FP profile → real fingerprint (no leakage from neighbor)

### Pages don't break
- [ ] Google search loads, results render
- [ ] YouTube plays video
- [ ] GitHub renders normally
- [ ] Banking site (visual check) loads without JS errors in console
- [ ] WebGL demo (e.g., Three.js example) still renders

---

## M6 — Snapshots, Cookie Editor, Auto-Rules

### Snapshots
- [ ] Manual snapshot saves
- [ ] Snapshot includes cookies
- [ ] Snapshot includes localStorage
- [ ] Snapshot includes sessionStorage
- [ ] Snapshot includes IndexedDB (when opt-in)
- [ ] Restore brings back logged-in state on GitHub
- [ ] Restore brings back logged-in state on Notion
- [ ] Auto-snapshot on close fires
- [ ] Retention policy deletes old auto-snapshots
- [ ] Diff viewer highlights changed cookies
- [ ] Diff viewer highlights changed localStorage keys
- [ ] Download snapshot produces encrypted blob
- [ ] Snapshot import on fresh install restores correctly

### Cookie editor
- [ ] List cookies per origin
- [ ] Edit cookie value
- [ ] Edit cookie expiry
- [ ] Delete cookie
- [ ] Import Netscape cookies.txt
- [ ] Import JSON
- [ ] Export Netscape format
- [ ] Export JSON format

### Auto-rules
- [ ] Substring pattern matches and routes
- [ ] Glob pattern matches
- [ ] Regex pattern matches
- [ ] Conflicting rules resolve by priority
- [ ] Rule disabled toggle works
- [ ] Live test in editor shows match preview

---

## M7 — Vault Expansion + 2FA + Lock

### Vault
- [ ] Add password entry
- [ ] Add note entry
- [ ] Add TOTP entry
- [ ] Autofill triggers on matching origin + container
- [ ] Autofill does NOT trigger on wrong container
- [ ] Autofill does NOT trigger on wrong origin
- [ ] Vault search from palette works

### TOTP
- [ ] Add TOTP by manual secret
- [ ] Add TOTP by QR scan
- [ ] OTP rotates every 30s
- [ ] OTP auto-fills focused 6-digit input
- [ ] OTP correct on real site (test with own GitHub 2FA)

### Container lock
- [ ] Lock individual container
- [ ] Locked container's tabs hidden in sidebar
- [ ] Cannot open locked container until unlock
- [ ] Unlock with master password
- [ ] Unlock with PIN (if configured)
- [ ] Auto-lock timer triggers
- [ ] Locked state persists across browser restart

---

## M8 — Beta Release

### Performance
- [ ] Sidebar first paint < 200ms with 100 containers
- [ ] Sidebar first paint < 500ms with 500 containers
- [ ] Bulk create 50 < 5s
- [ ] Snapshot capture (10MB origin) < 1s
- [ ] Memory < 50MB idle with 100 containers
- [ ] Cold start < 500ms

### Accessibility
- [ ] All controls keyboard-reachable
- [ ] All icons have aria-label
- [ ] Screen reader announces sidebar tree changes
- [ ] Contrast passes WCAG 2.1 AA (test with axe DevTools)
- [ ] `prefers-reduced-motion` disables transitions
- [ ] Focus rings visible everywhere

### Security
- [ ] CSP allows extension origins only
- [ ] No `eval` or `new Function` in bundle (verify in build output)
- [ ] No remote scripts loaded (verify in network panel)
- [ ] Vault key never written to disk
- [ ] Vault export prompts and warns
- [ ] Encrypted at rest verified by inspecting IndexedDB

### Privacy
- [ ] No telemetry sent by default (network log empty after operations)
- [ ] Opt-in telemetry sends only counters, no URLs/cookies
- [ ] User data export produces complete JSON
- [ ] Uninstall removes all data

### AMO submission
- [ ] `web-ext lint` passes with no errors
- [ ] Manifest fields complete (description, homepage, support)
- [ ] Screenshots prepared (1280x800 × 5)
- [ ] Source code link (if AGPL/MIT)
- [ ] Privacy policy URL

---

## Anti-Detect Quality (Recurring, Pre-Release)

Run against each fingerprint preset, record results in `qa-results/fp-YYYY-MM-DD.json`:

- [ ] pixelscan.net — "Identity consistent with claimed OS/browser"
- [ ] creepjs.com — Trust score ≥ 70%
- [ ] fingerprintjs.com — Different visitorId per container
- [ ] amiunique.org — "Different fingerprints across containers"
- [ ] browserleaks.com/canvas — Different hashes
- [ ] browserleaks.com/webgl — Different vendor/renderer per preset

Acceptable thresholds:
- 3+ presets should pass pixelscan consistency
- Trust score regression > 10% from baseline = blocker

---

## Regression Suite (run on every PR)

- [ ] Existing containers preserved across version upgrade
- [ ] Database migration runs without data loss
- [ ] Settings preserved across upgrade
- [ ] Vault preserved across upgrade (re-prompt for password OK)
- [ ] Templates preserved
- [ ] Workspaces preserved

---

## Known Limitations to Document

Note in user docs when these are confirmed:

- HTTP/2 client hints not spoofed by content script (some sites may detect mismatch)
- Some fingerprint surfaces (AudioContext on certain platforms) have limited spoofing
- Firefox Android: container API has reduced functionality
- Snapshot does NOT include browser cache, history, bookmarks
- Restore does NOT close existing tabs (user must do manually)
