# Contabox

> Advanced Firefox container manager. Multi-Account Containers + SessionBox killer.

Contabox is a Firefox WebExtension that turns Firefox's native container API (`contextualIdentities`) into a power-user platform for managing many isolated browsing identities at once — with proxy-per-container, fingerprint spoofing, workspace grouping, snapshots, templates, and bulk operations.

## Why

| Pain point | Existing tools | Contabox |
|---|---|---|
| Open same URL across N accounts | Manual, tab-by-tab | One click, N tabs |
| Container with custom proxy | SessionBox (paid) | Built-in, free |
| Container with custom fingerprint | None | Built-in |
| Manage 50+ containers | Unusable | Workspaces + search |
| Save/restore session state | None / paid | Snapshot system |
| Reusable container presets | None | Templates |

## Status

Pre-alpha. Spec phase. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for milestones.

## Stack

- Firefox WebExtension (Manifest V2/V3 hybrid — see `docs/TECH_STACK.md`)
- TypeScript + Vite
- Sidebar UI (Firefox `sidebar_action`)
- TailwindCSS v4
- IndexedDB (Dexie) for state
- Web Crypto API for vault encryption

## Documentation

| Doc | Purpose |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, personas, success metrics |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, modules, data flow |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Detailed feature spec per tier |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones M0–M8 |
| [`docs/TECH_STACK.md`](docs/TECH_STACK.md) | Library choices and rationale |
| [`docs/UX_SPEC.md`](docs/UX_SPEC.md) | Sidebar layout, interaction flows |

## Quick Start (after M0)

```bash
pnpm install
pnpm dev          # Watch mode, auto-reload extension
pnpm build        # Production bundle → dist/
pnpm package      # Build .xpi for distribution
```

Load `dist/` as temporary extension via `about:debugging` → "This Firefox" → "Load Temporary Add-on".

## License

TBD (likely MIT or AGPL-3.0).
