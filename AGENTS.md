# AGENTS.md — Contabox

Project context for AI coding agents (Claude Code, OpenCode, Cursor, etc.)
working in this repo. Mirror of `CLAUDE.md` (kept identical via convention).

## What this project is

**Contabox** is a Firefox extension (Manifest V3) that supercharges Firefox's
native Multi-Account Containers with bulk operations, per-container proxy +
fingerprint, encrypted vault (passwords, TOTP, autofill), session snapshots,
and auto-rules. Think "SessionBox replacement" with a privacy-first, local-only
posture.

- **Distribution**: self-hosted unlisted XPI signed by AMO. Auto-update via
  GitHub Pages (`https://pripanggalih.github.io/contabox/updates.json`).
- **Target browser**: Firefox 115+ (`browser_specific_settings.gecko.strict_min_version`).
- **Add-on ID**: `contabox@galih.dev` (permanent — never change).

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 5 strict | Types crossing trust boundaries are validated with Zod |
| UI | React 18 + Tailwind v4 | Reusable components, modern utility CSS |
| State | Zustand | Per-surface stores (sidebar / options / popup) |
| Storage | Dexie (IndexedDB) | Versioned migrations live in `src/shared/db.ts` |
| Crypto | Web Crypto only | No third-party crypto libs |
| Bundler | Vite + `@vitejs/plugin-react` + `@tailwindcss/vite` | Fast dev, multi-entry build |
| Packaging | `web-ext` (Mozilla) | Build, lint, sign, run |
| Lint/format | Biome 1.9 | Single tool for both |
| Tests | Vitest + jsdom (unit), Playwright scaffold (e2e) | `pnpm test`, `pnpm test:e2e` |
| Pkg manager | pnpm 10.14 (set via `packageManager`) | Lockfile is committed |

## Repo layout

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
```

Path aliases (vite + tsconfig + vitest):
- `@/` → `src/`
- `@shared/` → `src/shared/`
- `@bg/` → `src/background/`
- `@ui/` → `src/ui/`

## Cardinal rules for agents

1. **Never change `browser_specific_settings.gecko.id`.** Permanent identity.
2. **Validate every cross-boundary message with Zod.** UI ↔ BG ↔ content.
   See `src/shared/schemas.ts`.
3. **No `eval`, no `new Function`, no inline `<script>`.** AMO will reject.
   CSP in manifest already forbids these.
4. **No third-party crypto.** Only Web Crypto API.
5. **No telemetry / network calls without explicit opt-in.** Local-first.
6. **Vault key never leaves background.** Content scripts get short-lived
   secrets per fill action, never the master key.
7. **Don't introduce sourcemaps in production builds.** `vite.config.ts`
   already gates them on `NODE_ENV`.
8. **Don't break `package.json` ↔ `manifest.json` version sync.** Use
   `pnpm version:bump`. CI fails when they drift.
9. **Don't bypass `lock-manager`.** Every code path that opens tabs / hands
   out cookies must respect `isEffectivelyLocked`.
10. **Don't commit secrets.** `.env` / `.env.local` are gitignored. AMO API
    creds live in GitHub Secrets only.

## Build, test, run

```bash
pnpm install                    # one-time (or after lockfile change)
pnpm dev                        # vite watch build → dist/
pnpm web-ext                    # launch Firefox with dist/ loaded as temp add-on
pnpm test                       # Vitest unit
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # biome check
pnpm format                     # biome format --write
pnpm build                      # dev build w/ sourcemaps
pnpm build:prod                 # production build (no sourcemaps)
pnpm package                    # build:prod + zip via web-ext
pnpm exec web-ext lint --source-dir=dist   # AMO compatibility check
```

Before any commit:
```bash
pnpm lint && pnpm typecheck && pnpm test
```
CI runs the same. PRs that don't pass locally won't pass in CI either.

## Release workflow (self-hosted unlisted)

This is THE release flow. AMO listed channel is reserved for a future public
push. See `docs/RELEASE.md` for full details + troubleshooting.

```bash
# 1. Bump version (syncs package.json + public/manifest.json)
pnpm version:bump patch        # 0.1.0 → 0.1.1
# (or:  minor / major / 0.5.2)

# 2. Commit + tag
git commit -am "chore: release v0.1.1"
git tag v0.1.1
git push origin main --tags
```

The push triggers `.github/workflows/release.yml`:

1. Lint, typecheck, test, build production.
2. `web-ext lint dist/` (non-blocking sanity).
3. `web-ext sign --channel=unlisted` against AMO API. Returns signed XPI in
   ~1–5 min (no human review).
4. Creates GitHub Release `v0.1.1` with the signed XPI attached.
5. Builds `updates.json` merging the new entry with prior versions, plus
   a styled landing page, and deploys to GitHub Pages.
6. Firefox installations poll `https://pripanggalih.github.io/contabox/updates.json`
   every ~24 h and silently upgrade.

**Public install URL** to share: `https://pripanggalih.github.io/contabox/`

### Manual run

Repo → **Actions → Release → Run workflow**. Pick `unlisted` (default) or
`listed`. Useful when you want to retry without re-tagging or to push the
listed channel ad-hoc.

### Manual sign from a dev machine

```bash
export AMO_JWT_ISSUER='user:xxxxxxxx:yy'
export AMO_JWT_SECRET='...64chars...'
pnpm sign:unlisted              # writes web-ext-artifacts/*.xpi
```

### Required GitHub Secrets

| Secret | Where |
|---|---|
| `AMO_JWT_ISSUER` | https://addons.mozilla.org/developers/addon/api/key/ |
| `AMO_JWT_SECRET` | same page (shown once) |

Set in **Settings → Secrets and variables → Actions**.

### Version rules

- Dotted numeric, max 4 segments: `0.1.0`, `0.2.1.42`.
- No SemVer pre-release suffixes (`0.2.0-beta.1` — Firefox's update
  comparator can't handle them). For betas, use a 4th segment: `0.2.0.1`.
- Don't reuse a rejected version; bump again.

## Common task recipes

### Add a new background command

1. Add to the `Command` union in `src/shared/messaging.ts` and the matching
   `ResultMap` entry.
2. Implement handler in `src/background/command-router.ts` via `this.add(...)`.
3. Add Zod schema in `src/shared/schemas.ts` if the payload crosses trust
   boundary.
4. Use it from UI: `await invoke({ type: 'foo.bar', payload })`.

### Add a new persistent field on a container

1. Update `ContainerExt` in `src/shared/types.ts`.
2. Update `updateContainerInputSchema` in `src/shared/schemas.ts`.
3. Bump Dexie schema in `src/shared/db.ts` with an additive `.version(N+1)`
   block (never remove columns; Dexie migrations are forward-only).
4. Persist the field in `containerManager.update`.
5. Surface it in `ContainerDetailDrawer.tsx`.

### Wire a new content script

1. Add file under `src/content/`.
2. Register it in `vite.config.ts` `rollupOptions.input` AND in the
   `entryFileNames` output mapping.
3. Add a `content_scripts` entry in `public/manifest.json`.
4. Talk to BG via `browser.runtime.sendMessage` with a Zod-validated payload.

### Change icon

The single `public/icons/icon.svg` serves all sizes (Firefox MV3 supports
SVG icons). To replace, update the file in place and rebuild — no other
references.

## Where to look for context

| Question | File |
|---|---|
| What does the product do? | `docs/PRD.md`, `docs/FEATURES.md` |
| How is the code structured? | `docs/ARCHITECTURE.md` |
| What's the threat model? | `docs/SECURITY.md` |
| Which milestone are we in? | `docs/ROADMAP.md` |
| How do I ship a release? | `docs/RELEASE.md` (and §Release workflow above) |
| Manual QA scenarios? | `docs/QA.md` |
