# Contabox

> Power-user container manager for Firefox. Bulk operations, per-container
> proxy + fingerprint, encrypted vault with autofill, session snapshots,
> auto-rules. Local-first, no cloud, no telemetry.

[![CI](https://github.com/pripanggalih/contabox/actions/workflows/ci.yml/badge.svg)](https://github.com/pripanggalih/contabox/actions/workflows/ci.yml)
[![Release](https://github.com/pripanggalih/contabox/actions/workflows/release.yml/badge.svg)](https://github.com/pripanggalih/contabox/actions/workflows/release.yml)
[![Latest XPI](https://img.shields.io/github/v/release/pripanggalih/contabox?label=download)](https://pripanggalih.github.io/contabox/)

Contabox is a Firefox WebExtension (Manifest V3) that turns Firefox's native
Multi-Account Containers into a workspace for managing dozens of isolated
browsing identities at once. It's what SessionBox/Containerise/Multi-Account
Containers leave on the table — built free, fully local, and signed for
self-hosted distribution.

```
┌─────────────────────────┐  ┌──────────────────────────────────────────┐
│ Sidebar                 │  │  Active container view                   │
│                         │  │                                          │
│ ⌗ Marketing             │  │  Affiliate-A1   Affiliate-A2   …         │
│ ⌗ Affiliate          ▾  │  │  proxy: SG-1    proxy: SG-1              │
│   Affiliate-A1   ⏵      │  │  ua: Chrome     ua: Chrome               │
│   Affiliate-A2   ⏵      │  │                                          │
│   Affiliate-A3   ⏵      │  │  Bulk: open URL · clone · proxy · tag    │
│ ⌗ Personal              │  │                                          │
│ ⌗ Crypto             ⏶  │  └──────────────────────────────────────────┘
│   Binance-Main          │
│   ByBit-Trade           │
└─────────────────────────┘
```

## Install (Firefox 115+)

The current build is self-hosted, signed by Mozilla under their AMO
unlisted channel. Auto-updates are wired through GitHub Pages — install
once, get every future release silently.

**One-click install:** https://pripanggalih.github.io/contabox/

On first install Firefox shows a generic "this file may be unsafe" prompt
because the add-on is not in the public AMO listing yet. Click **Continue
to install** → **Add**. After install, future versions arrive through
Firefox's normal update flow within ~24 hours of release (or sooner via
`about:addons` → ⚙ → **Check for Updates**).

To uninstall: `about:addons` → Contabox → **Remove**.

## Features

### Container management
- **Bulk create** with name patterns: `affiliate-{n:03}` → 100 containers in
  one click.
- **Bulk operations** — open same URL across many containers, hibernate,
  delete, retag, reassign workspace/proxy/fingerprint.
- **Workspaces** for grouping containers (Marketing, Affiliate, Crypto, …)
  with a single panel-level "open all" action.
- **Templates** to spin up new containers with the same defaults
  (proxy, fingerprint, default URL, notes).
- **Custom hex color + Lucide icon** per container, beyond Firefox's 9
  built-in colors.
- **Drag & drop** to reorder, multi-select with `Shift`/`Ctrl`/`Cmd`+click.
- **Command palette** (`Cmd/Ctrl+K`) over containers, workspaces, and
  templates. Fuzzy match.

### Privacy & isolation
- **Per-container proxy**. HTTP/HTTPS/SOCKS4/SOCKS5 with auth. Pools with
  random/round-robin/sticky-per-session rotation and cooldown.
- **Scheduled proxy health-check** with auto-disable after N consecutive
  failures.
- **Per-container fingerprint** override: User-Agent, canvas/WebGL/audio
  noise, screen, timezone, locale, hardware concurrency, device memory.
  Header rewrite at the `webRequest` layer.
- **WebRTC IP-handling policy** to keep proxied traffic from leaking via
  `RTCPeerConnection`.

### Vault, autofill, 2FA
- **Encrypted vault** (AES-GCM-256, PBKDF2-600k) for proxy creds, passwords,
  TOTP secrets, and free-form notes.
- **Autofill content script**, scoped to (origin × container). Closed shadow
  DOM — page scripts can't reach the picker.
- **TOTP** generator with auto-fill into focused 6-digit fields. The
  background generates the code; the page never sees the long-term secret.
- **Container lock** with optional 4–12-digit PIN per container, or fall
  back to the global vault master password. Locked containers' tabs are
  hidden via `tabs.hide`.
- **Encrypted vault export/import**, master-password change (re-encrypts
  every entry atomically).

### Snapshots & cookie editor
- **Capture/restore** cookies, localStorage, sessionStorage per container.
- **IndexedDB capture (opt-in per container)** for sites that store login
  state in IDB (Notion, Linear, Figma).
- **Auto-snapshot** on container idle (last tab closed) and pre-delete,
  with retention-days pruning.
- **Cookie editor** dialog (Netscape + JSON import/export).

### Auto-rules
- Open URLs matching `pattern` in container `X`. Substring / glob / regex.
- Or redirect into the container automatically.

### Diagnostics
- **Privacy panel**: telemetry opt-in toggle (default off), debug-log
  export (counts only, never URLs/cookies/vault).
- **No network calls** unless the user enables proxy or telemetry.

Full feature list with acceptance criteria: [`docs/FEATURES.md`](docs/FEATURES.md).

## Permissions

Justifications for each permission requested in `public/manifest.json`:

| Permission | Reason |
|---|---|
| `contextualIdentities` | Core: create/manage containers |
| `cookies` | Snapshot capture + cookie editor |
| `<all_urls>` | Proxy applies to all sites; user expects this for an isolation tool |
| `webRequest`, `webRequestBlocking` | Header rewrite for UA, Accept-Language |
| `webNavigation` | Auto-rule routing |
| `proxy` | Per-container proxy |
| `scripting` | Inject fingerprint script + snapshot capture/restore |
| `storage` | Local IndexedDB state |
| `tabs` | Read tab's container, move tabs |
| `tabHide` | Hide tabs of locked containers until unlocked |
| `alarms` | Scheduled proxy health probe + auto-snapshot retention pruner |
| `idle` | Reserved for auto-lock-on-idle (currently timer-based) |
| `privacy` | WebRTC IP-handling policy |
| `commands` | Keyboard shortcuts |

Every cross-boundary message is validated with Zod; the threat model lives
in [`docs/SECURITY.md`](docs/SECURITY.md).

## Privacy

Contabox is local-first.

- No servers. No analytics. No identifiers.
- The vault, snapshots, and container metadata live in Firefox's IndexedDB
  on your machine.
- Telemetry is opt-in and limited to anonymous, aggregate feature-usage
  counters (no URLs, no PII).
- Proxy passwords + TOTP secrets are encrypted at rest under your master
  password (PBKDF2-600k → AES-GCM-256). The derived key is held in memory
  only and cleared on auto-lock or browser close.
- Export everything as encrypted JSON, or remove the extension to delete
  it all.

## Versioning policy

The on-disk schema (Dexie / IndexedDB) follows a strict
"data-preserving by default" rule:

- **Patch (`0.1.0` → `0.1.1`)** — bug fixes, new features. Schema is
  unchanged or extended additively (new columns / indexes only). Auto-update
  preserves all data. **Always safe.**
- **Minor (`0.1.0` → `0.2.0`)** — feature work. May add new tables. Existing
  rows are never deleted or restructured. Auto-update preserves all data.
  **Always safe.**
- **Major (`0.x` → `1.0`)** — possibly breaking. Will be announced in the
  release notes with a migration path **and** a forced backup prompt before
  the upgrade applies. Triggered manually only.

Background: every code path that opens the database goes through Dexie
versioned migrations declared in `src/shared/db.ts`. They are forward-only
and additive — see [`AGENTS.md`](AGENTS.md) cardinal rules.

If you're paranoid before an update: **Options → Privacy → Backup &amp;
restore → Encrypted backup** dumps every container, workspace, snapshot,
proxy, rule, and vault entry into one AES-GCM-encrypted JSON file. Restore
is one click on a fresh install.

---

## For developers

### Stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5 strict (`noUncheckedIndexedAccess`) |
| UI | React 18 + Tailwind v4 |
| State | Zustand (per-surface stores) |
| Storage | Dexie / IndexedDB (versioned migrations) |
| Crypto | Web Crypto only |
| Validation | Zod at every trust boundary |
| Bundler | Vite + `@vitejs/plugin-react` + `@tailwindcss/vite` |
| Packaging | `web-ext` (Mozilla) |
| Lint/format | Biome 1.9 |
| Tests | Vitest + jsdom (unit), Playwright scaffold (e2e) |
| Pkg manager | pnpm 10.14 (set via `packageManager`) |

### Repo layout

```
src/
  background/       BG service-worker engines (router, container, vault, lock,
                    autofill, snapshot, fingerprint, proxy, autorules, …)
  content/          Content scripts (autofill UI in closed shadow DOM)
  options/          Options page (React)
  popup/            Toolbar popup (React)
  sidebar/          Sidebar panel (React)
  shared/           Pure modules: types, schemas, crypto, totp, origin, pin, db
  ui/               Cross-surface UI bits (theme, css)
  test/setup.ts     Vitest mocks for `browser.*`
public/             Static manifest + icons (copied verbatim)
docs/               PRD, ARCHITECTURE, FEATURES, ROADMAP, SECURITY, RELEASE, QA
scripts/            One-off tooling: bump-version, build-updates-json
.github/workflows/  ci.yml + release.yml
tests/e2e/          Playwright smoke tests (placeholder)
```

Path aliases (`vite.config.ts` + `tsconfig.json` + `vitest.config.ts`):
- `@/` → `src/`
- `@shared/` → `src/shared/`
- `@bg/` → `src/background/`
- `@ui/` → `src/ui/`

### Quick start

```bash
# 1. Install
git clone https://github.com/pripanggalih/contabox
cd contabox
pnpm install

# 2. Build (watch mode)
pnpm dev

# 3. Load in Firefox
# Either:
pnpm web-ext             # Spawns Firefox with dist/ as a temp add-on

# Or manually:
# about:debugging#/runtime/this-firefox → Load Temporary Add-on
# → pick dist/manifest.json
```

### Day-to-day commands

```bash
pnpm dev               # Vite watch build into dist/
pnpm web-ext           # Launch Firefox with the temp add-on
pnpm test              # Vitest unit tests
pnpm test:watch        # Vitest in watch mode
pnpm test:e2e          # Playwright smoke tests
pnpm typecheck         # tsc --noEmit
pnpm lint              # biome check
pnpm format            # biome format --write
pnpm check             # biome + tsc combined

pnpm build             # Dev build (with sourcemaps) → dist/
pnpm build:prod        # Production build (no sourcemaps) → dist/
pnpm package           # build:prod + zip via web-ext
pnpm exec web-ext lint --source-dir=dist   # AMO compatibility check
```

Pre-commit minimum: `pnpm lint && pnpm typecheck && pnpm test`. CI runs the
same on every push and PR.

### Architecture in 30 seconds

1. **Background** is the sole owner of state. Every UI surface (sidebar,
   options, popup, content scripts) talks to it via
   `browser.runtime.sendMessage` with a typed `Command` (defined in
   `shared/messaging.ts`).
2. **Engines** under `src/background/` each own one concern (containers,
   vault, proxy, fingerprint, snapshots, lock, autorules, autofill).
3. **Persistence** is a versioned Dexie schema in `shared/db.ts`. Migrations
   are forward-only; never remove columns.
4. **UI** mirrors BG state via Zustand stores that re-fetch on
   `state.<thing>` broadcasts.

Detailed: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Contributing

Pull requests welcome. Read [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)
first; the highlights:

- TypeScript strict + Biome — `pnpm check` before pushing.
- Conventional Commits: `feat(scope): …`, `fix(scope): …`, `chore: …`.
- Cross-context messages MUST be defined in `shared/messaging.ts` with a
  Zod schema in `shared/schemas.ts`.
- New permissions in `manifest.json` require justification in the PR
  description.
- New behavior gets a Vitest unit test. New user-facing surface gets a
  line in `docs/QA.md`.

For agents (Claude Code, OpenCode, Cursor, …) working in this repo, the
project primer is in [`AGENTS.md`](AGENTS.md) (mirror in
[`CLAUDE.md`](CLAUDE.md)).

### Releasing

Tag-driven, fully automated. See [`docs/RELEASE.md`](docs/RELEASE.md) for
the full flow + troubleshooting.

```bash
# 1. Bump version (syncs package.json + public/manifest.json)
pnpm version:bump patch         # 0.1.0 → 0.1.1
# (or:  minor / major / 0.5.2)

# 2. Commit + tag
git commit -am "chore: release v0.1.1"
git tag v0.1.1
git push origin main --tags
```

The push to `v*` triggers `.github/workflows/release.yml`:

1. Lint, typecheck, test, build production.
2. `web-ext sign --channel=unlisted` against AMO API (~1–5 min, no review).
3. Creates a GitHub Release with the signed XPI attached.
4. Builds `updates.json` (merging prior versions) plus a styled landing
   page, deploys to GitHub Pages.
5. Installed Firefox clients pull the new version on their next update poll.

Manual run: **Actions → Release → Run workflow** (channel `unlisted` or
`listed`).

Required GitHub Secrets: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`. Generate at
https://addons.mozilla.org/developers/addon/api/key/.

### Documentation

| Doc | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) | Project primer for AI coding agents |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, personas, success metrics |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, modules, data flow |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Detailed feature spec per tier |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones M0–M8 + decision log |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model, crypto choices, permissions |
| [`docs/TECH_STACK.md`](docs/TECH_STACK.md) | Library choices and rationale |
| [`docs/UX_SPEC.md`](docs/UX_SPEC.md) | Sidebar layout, interaction flows |
| [`docs/QA.md`](docs/QA.md) | Manual QA checklist |
| [`docs/RELEASE.md`](docs/RELEASE.md) | Deploy flow (this repo's release process) |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Branching, code style, PR process |

### Status

Active development. Milestones M0–M7 complete: container management, bulk
ops, proxy + fingerprint engines, encrypted vault with autofill + TOTP,
session snapshots, auto-rules, container locks. M8 (public AMO listing,
performance + a11y audit) is the next gate.

Track progress in [`docs/ROADMAP.md`](docs/ROADMAP.md).

### License

MIT — see [`LICENSE`](LICENSE). Use it, fork it, ship it. Just keep the
copyright notice.

### Acknowledgements

- Mozilla, for `contextualIdentities` and an honest extension platform.
- The Multi-Account Containers team — Contabox stands on their shoulders.
