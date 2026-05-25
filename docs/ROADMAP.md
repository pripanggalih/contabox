# Roadmap — Contabox

**Version:** 0.1
**Last updated:** 2026-05-25

Milestones are vertical slices: each ships a working extension with the listed features. Times assume single-developer pace.

---

## M0 — Project Scaffold (Week 1)

**Goal:** Build pipeline + first sidebar pixel on screen.

**Deliverables:**
- Vite + TypeScript + React + Tailwind v4 project
- `manifest.json` (Firefox MV3 with V2 fallback)
- Sidebar HTML loaded via `sidebar_action`
- Background page entry stub
- `web-ext` for live reload
- GitHub Actions CI: lint, typecheck, build
- Dexie schema for `containers`, `workspaces`, `templates` (empty)

**Exit criteria:**
- `pnpm dev` → load as temp add-on → sidebar opens and renders "Contabox" heading

---

## M1 — Container CRUD (Week 2)

**Goal:** Replace Firefox's container UI for basic ops.

**Deliverables:**
- `ContainerManager` module (create, list, rename, recolor, re-icon, delete)
- Sidebar tree: flat container list
- Inline rename, color picker, icon picker
- Confirm delete with undo toast

**Exit criteria:**
- Can fully manage containers from sidebar without touching Firefox preferences

---

## M2 — Bulk + Templates + Workspaces (Weeks 3–4)

**Goal:** First "wow" capabilities that beat Multi-Account Containers.

**Deliverables:**
- `TemplateManager` + UI (save template, apply template)
- Bulk create dialog: count, naming pattern, template selection
- Bulk open URL dialog: URL, target containers, stagger
- `WorkspaceManager` + tree UI
- Drag-and-drop reorder + cross-workspace move
- Workspace actions: Open all, Hibernate, Rename

**Exit criteria:**
- Create 20 containers from template in < 5 seconds
- Move container between workspaces via drag

---

## M3 — Search, Palette, UX Polish (Week 5)

**Goal:** Make 100 containers feel manageable.

**Deliverables:**
- Sidebar filter input (fuzzy)
- Command palette overlay (`Cmd+K`)
- Tag system (apply, filter)
- Virtual scrolling
- Onboarding wizard (first-run)
- MAC migration importer
- Settings/Options page (shell)
- Popup (current-tab info, "reopen in container")

**Exit criteria:**
- All sidebar interactions reachable by keyboard
- Sidebar renders 200 containers in < 200ms

---

## M4 — Proxy Engine (Weeks 6–7)

**Goal:** Per-container proxy with rotation.

**Deliverables:**
- `ProxyEngine` module + `proxy.onRequest` hook
- Proxy CRUD UI (Options page tab)
- Proxy pool CRUD with rotation strategy
- Per-container proxy assignment in container detail
- Health check (manual + scheduled)
- WebRTC leak mode toggle
- Vault MVP (proxy credentials only): master password, AES-GCM

**Exit criteria:**
- WebRTC leak test passes with `webrtcMode: 'proxy'`
- Proxy rotation observable across requests in network panel
- Bulk import `host:port:user:pass` list

---

## M5 — Fingerprint Engine (Weeks 8–9)

**Goal:** Per-container fingerprint spoofing.

**Deliverables:**
- `FingerprintEngine` module
- Content script injection scoped by `cookieStoreId`
- Spoof surfaces: UA, language, screen, hardwareConcurrency, deviceMemory, timezone, Canvas, WebGL, Audio
- Header rewrite: `User-Agent`, `Accept-Language` via `webRequest`
- 6 built-in presets + Random
- Custom profile editor
- Self-test panel (shows spoofed values reading themselves back)

**Exit criteria:**
- creepjs.com reports different fingerprint per container
- pixelscan.net shows expected OS/browser per preset
- No console errors in target pages

---

## M6 — Snapshots + Cookie Editor + Auto-Rules (Weeks 10–11)

**Goal:** Reproducible sessions.

**Deliverables:**
- `SnapshotEngine`: capture/restore cookies + localStorage + sessionStorage
- IndexedDB capture (opt-in per snapshot)
- Snapshot timeline UI per container
- Diff viewer
- Auto-snapshot on container close (configurable retention)
- Cookie editor (per-origin) with Netscape/JSON import-export
- `AutoRuleEngine`: pattern → container routing
- Rule editor UI with live test

**Exit criteria:**
- Snapshot a logged-in GitHub session, restore it tomorrow, still logged in
- Diff viewer highlights changed cookies between two snapshots
- Auto-rule routes `*.figma.com` to Design workspace's container

---

## M7 — Vault Expansion + 2FA + Lock (Week 12)

**Goal:** Sensitive data handling complete.

**Deliverables:** ✓
- Vault expanded: passwords, notes, TOTP secrets
- Autofill content script (origin + container scoped)
- TOTP generator with auto-fill into focused 6-digit input
- Container lock (PIN per container, or global master password)
- Auto-lock timer (persisted)
- Vault export / import (encrypted envelope)
- Master password change (re-encrypts all entries)
- Privacy panel + telemetry opt-in toggle + debug log export
- Scheduled proxy health check + auto-disable after 3 fails

**Exit criteria:**
- Locked container's tabs hidden until unlock ✓ (Firefox `tabs.hide`)
- 2FA fills correctly on a real site ✓ (autofill content script)
- Vault export → reimport on fresh install preserves data ✓

---

## M8 — Beta Release (Week 13)

**Goal:** Public beta on AMO.

**Deliverables:**
- Polish pass on all UI surfaces
- Performance audit (sidebar < 200ms with 500 containers)
- Accessibility audit (WCAG 2.1 AA)
- Privacy doc, security threat model
- AMO submission package
- Landing page with docs
- Bug tracker public

**Exit criteria:**
- AMO approval (or self-hosted XPI signed)
- 100 external beta testers signed up

---

## Post-M8 — Future Milestones (Tier 3+)

| Milestone | Scope | Estimate |
|---|---|---|
| M9 | Activity log, bandwidth analytics | 1 week |
| M10 | Webhook on event | 3 days |
| M11 | Encrypted template sync (GitHub Gist) | 1.5 weeks |
| M12 | Native Messaging Host (Rust) — separate repo | 2 weeks |
| M13 | Profile farm mode + cookie aging | 2 weeks |
| M14 | Anti-detect score panel | 1 week |
| M15 | CSV bulk import | 3 days |
| M16 | Tor preset + hardened fingerprint pair | 3 days |
| M17 | Container clone-with-state | 1 week |
| M18 | i18n (id, en, zh-CN, ru, pt-BR) | 1 week |

---

## Cross-Cutting Tracks

These run in parallel with milestones.

### Track A — Testing
- Vitest unit tests added with each module
- Playwright E2E added at M3, M5, M7
- Manual QA checklist updated per milestone

### Track B — Documentation
- User docs (sidebar feature guide) updated at each milestone
- Developer docs (`CONTRIBUTING.md`, module READMEs) updated as modules land
- Architecture doc revised when data model changes

### Track C — Performance Budget
Track per milestone:
- Sidebar first paint (target < 200ms)
- Background memory (target < 50MB idle with 100 containers)
- Snapshot capture latency (target < 1s for 10MB origin)

### Track D — Security Reviews
- Threat model document by M4
- Vault crypto audit (self or external) by M7
- Content script CSP review by M5
- Pre-AMO security checklist at M8

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-25 | Build for Firefox not Chromium | Native `contextualIdentities` API; less hacky than Chrome profile workarounds |
| 2026-05-25 | TypeScript + React + Vite + Tailwind v4 | Mirror existing project stack; reuse FingerprintEngine code |
| 2026-05-25 | Local-first, no required cloud | Privacy ethos; matches target audience |
| 2026-05-25 | License TBD until M8 | Lock decision when public release nears (MIT vs AGPL-3.0) |
| 2026-05-25 | Pre-delete auto-snapshot lives in `containerManager.delete`, not `contextualIdentities.onRemoved` | The native event fires after the cookie store is invalidated, making capture impossible. |
| 2026-05-25 | Container PINs use PBKDF2 100k (vs vault's 600k) | PIN entropy is intrinsically low; UX matters on every container open; extra rounds don't change attacker's worst case much past 100k. |
| 2026-05-25 | Autofill UI in closed shadow DOM | Mitigate T1 (page-script reach into extension overlay). |
| 2026-05-25 | IndexedDB capture is opt-in per container | Some sites store >100MB in IDB; default-on would blow snapshot size. |
