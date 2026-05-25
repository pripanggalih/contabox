# Product Requirements Document — Contabox

**Version:** 0.1 (Draft)
**Owner:** MW Pripanggalih
**Last updated:** 2026-05-25

---

## 1. Problem Statement

Users who need to operate multiple browser identities simultaneously — affiliate marketers, QA engineers testing multi-tenant SaaS, web scrapers, OSINT analysts, customer support agents juggling client accounts, privacy-conscious users — currently rely on:

1. **Firefox Multi-Account Containers (MAC)** — Free, native, but missing bulk ops, proxy, fingerprint, templates, automation.
2. **SessionBox** — Adds proxy, but limited to 2 sessions in free tier, no fingerprint, weak UX at scale.
3. **Anti-detect browsers (Multilogin, GoLogin, Dolphin{anty})** — Powerful but $80–500/month, separate browser binary, heavy.
4. **Chrome with profile hacks** — Brittle, requires OS-level workarounds (see existing `multi-session` project).

**Gap:** No free/open-source tool offers the *combination* of unlimited containers + proxy + fingerprint + bulk management on top of Firefox's native isolation primitives.

## 2. Vision

> The most powerful free container manager for Firefox — combining anti-detect browser features with the ergonomics of a tab manager, built on browser-native isolation so we never reinvent cookie jars.

## 3. Personas

### P1 — "Aldi the Affiliate" (Primary)
- Runs 15–40 affiliate accounts on 3–5 networks
- Needs different proxies per account, different fingerprints, persistent logins
- Pain: SessionBox limits + Multilogin price ($110/mo)
- Wins with: Templates, bulk create, proxy pool, workspace per network

### P2 — "QA Quinn" (Primary)
- Tests multi-tenant SaaS with 10 tenant roles
- Needs reproducible sessions, snapshot/restore, fast switching
- Pain: Manual cookie clearing, slow login cycles
- Wins with: Snapshots, quick switcher, auto-assign rules

### P3 — "OSINT Olive" (Secondary)
- Investigates targets, needs disposable identities
- Pain: Cross-contamination between research sessions
- Wins with: Container lock, ephemeral mode, fingerprint isolation

### P4 — "Support Sam" (Secondary)
- Logs into 8 client portals daily
- Needs labeled containers, 2FA, autofill
- Wins with: Credential vault per container, TOTP, color/icon system

### P5 — "Scrap Sammy" (Tertiary)
- Runs scripted scraping with rotating identities
- Pain: No programmatic control of MAC
- Wins with: Native Messaging API, CSV import, profile farm mode

## 4. Goals & Non-Goals

### Goals
- G1: Make 50+ containers feel as manageable as 5
- G2: Match anti-detect browsers on isolation quality at $0 cost
- G3: Sub-second container switching and tab opening
- G4: Zero-config defaults; power features behind progressive disclosure
- G5: Local-first; no required cloud sync, no telemetry

### Non-Goals (v1)
- ❌ Mobile Firefox support (Android desktop mode only, not iOS)
- ❌ Chrome/Edge port (separate `multi-session` project handles Chromium)
- ❌ Built-in VPN (proxy only)
- ❌ Account marketplace / sharing cookies
- ❌ Cloud-hosted browser farm (local extension only)

## 5. Success Metrics

| Metric | Target (6 mo post-launch) | Measurement |
|---|---|---|
| Daily Active Users | 5,000 | Optional opt-in ping (privacy-respecting) |
| AMO rating | ≥ 4.5 stars | Mozilla addons.mozilla.org |
| Container ops per session | ≥ 10 (vs 2 for MAC) | Local analytics |
| Retention (D30) | ≥ 40% | DAU/MAU |
| GitHub stars | 1,000 | github.com/.../contabox |
| Power-user adoption | 20% use templates+proxy | Local feature usage |

## 6. User Stories (MVP)

**As an affiliate marketer**, I want to bulk-create 20 containers from a template so I can onboard a new network in seconds, not 20 minutes.

**As a QA engineer**, I want to snapshot a logged-in session and restore it later so I can repeat test runs without re-logging in.

**As a power user**, I want to group containers into workspaces so I can switch between "Work" and "Personal" contexts with one click.

**As any user**, I want a Cmd+K command palette so I can jump to any container without scrolling a long list.

**As a privacy-conscious user**, I want to lock sensitive containers with a password so a casual onlooker can't open my banking session.

**As a scraper**, I want to assign a unique SOCKS5 proxy per container so my requests don't share IP.

**As an anti-detect user**, I want each container to have a unique fingerprint (canvas, WebGL, fonts, timezone) so sites can't link my containers.

## 7. Functional Requirements (MVP — Tier 1+2)

### FR1 — Container CRUD
- Create, rename, recolor, re-icon, delete containers
- Wraps `browser.contextualIdentities.*`
- Extended attributes stored locally (tags, notes, template ref, proxy ref, fingerprint ref)

### FR2 — Bulk Operations
- Bulk create from template (N containers, naming pattern e.g. `acme-{n}`)
- Bulk open URL across N containers
- Bulk delete with confirmation
- Bulk export/import (JSON)

### FR3 — Templates
- Save template: name + color + icon + proxy + UA + fingerprint preset + initial cookies
- Apply template to existing container
- Clone container (creates template implicitly)

### FR4 — Workspaces
- Group containers into named workspaces
- A container can belong to ≤ 1 workspace
- Open workspace = open default URL in every container in group
- Hibernate workspace = discard all tabs of containers in group

### FR5 — Sidebar UI
- Tree view: Workspaces → Containers → Tabs
- Inline rename, drag to reorder, drag between workspaces
- Tab count badge per container
- Search input (filter by name, tag, URL)
- Status indicators (proxy on/off, locked, fingerprint custom)

### FR6 — Command Palette
- Trigger: `Cmd/Ctrl+K`
- Actions: open container, switch tab, create from template, run snapshot, lock/unlock
- Fuzzy search

### FR7 — Proxy per Container
- HTTP, HTTPS, SOCKS4, SOCKS5 with auth
- Pooled proxies with rotation strategy (random, round-robin, sticky-per-session)
- Cooldown timer (don't reuse proxy X for Y minutes)
- Health check (test endpoint configurable)
- Proxy assignment via `browser.proxy.onRequest` + `cookieStoreId` filter

### FR8 — Fingerprint per Container
- Spoofable surfaces (per container):
  - User-Agent
  - Canvas (noise injection)
  - WebGL (vendor, renderer, params)
  - Audio context
  - Screen resolution + color depth
  - Available fonts (allowlist subset)
  - Timezone (`Intl.DateTimeFormat`)
  - Language (`navigator.language`, `Accept-Language` header)
  - Hardware concurrency, deviceMemory
  - WebRTC IP leak protection (force proxy or disable)
- Presets: Windows-Chrome-Latest, macOS-Safari, Linux-Firefox-ESR, Random
- Implementation: content script injected per matching tab via `cookieStoreId` filter

### FR9 — Snapshots
- Capture: cookies, localStorage, sessionStorage, IndexedDB (per origin per container)
- Save to local IndexedDB with metadata (timestamp, label, container ref)
- Restore: clear current state, replay snapshot
- Diff viewer (which cookies/keys changed)
- Auto-snapshot on container close (configurable, with retention policy)

### FR10 — Auto-assign Rules
- URL pattern (glob or regex) → target container
- Optional: open in new tab or redirect existing
- Rule conflict resolution: first match wins, configurable order

## 8. Non-Functional Requirements

### Performance
- Sidebar render < 200ms with 100 containers
- Bulk open 20 tabs < 3s
- Snapshot save < 1s for typical site (≤10MB origin data)

### Security
- Vault (credentials, proxy auth, snapshot data) encrypted with PBKDF2-derived key
- Master password never persisted (in-memory only, cleared on browser close)
- Optional auto-lock timer
- No remote code execution; all logic local

### Privacy
- Zero telemetry by default
- Opt-in anonymous analytics: container count, feature usage flags (no URLs, no cookies)
- Export-anywhere: user owns all data, JSON dump on demand

### Compatibility
- Firefox 115+ ESR and Firefox Release
- Manifest V3 with V2 fallback shim (Firefox supports both as of 2026)
- Works in Strict Enhanced Tracking Protection mode
- Co-exists with Multi-Account Containers (offers migration importer, then suggests disabling)

### Accessibility
- Keyboard-first UI (every action reachable without mouse)
- WCAG 2.1 AA contrast
- Screen reader labels on all interactive elements
- Reduced-motion respect

## 9. Constraints & Assumptions

- **Constraint:** Firefox `contextualIdentities` API requires `"permissions": ["contextualIdentities", "cookies"]` and only works in Firefox (not Firefox for Android < 79).
- **Constraint:** Fingerprint spoofing in content scripts cannot intercept all surfaces (e.g., HTTP/2 client hints) — accept ~85% coverage vs anti-detect browsers' ~99%.
- **Assumption:** Users tolerate temporary-extension dev mode during beta. AMO signing post-MVP.
- **Assumption:** Mozilla won't deprecate `contextualIdentities` (low risk — it's a flagship privacy feature).

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Mozilla policy review rejects fingerprint spoofing | Block AMO listing | Side-load distribution + self-signed XPI; pursue AMO with clear use-case docs |
| Manifest V3 removes blocking webRequest | Breaks proxy/fingerprint headers | Firefox keeps blocking webRequest in MV3; document fallback if changed |
| `contextualIdentities` API limits (50 container cap?) | Power-user ceiling | Confirm limit via testing; if hit, document workaround |
| User browser data corruption from snapshot restore | Trust loss | Snapshot to ephemeral container first, validate, then commit |
| Performance with 100+ containers | Sidebar lag | Virtual scrolling, lazy-load workspace contents |

## 11. Open Questions

- Q1: Charge for cloud sync, or fully free? → Likely free, donations + sponsor tier
- Q2: License: MIT (max adoption) vs AGPL-3.0 (prevent commercial fork)? → Decide before public beta
- Q3: Should snapshots include browser history? → Off by default, opt-in per snapshot
- Q4: 2FA TOTP — bundle or rely on Bitwarden/1Password integration? → Bundle minimal, integration later
- Q5: Native Messaging API — ship in v1 or v2? → v2; gate behind explicit user enable

## 12. Out of Scope (Explicitly)

- Anything that requires shipping a custom Firefox build
- Anti-detect features beyond what content scripts and webRequest can do
- Cookie selling / account marketplace
- Server-side state (everything local)
- iOS Firefox (no WebExtension API)
