# UX Specification — Contabox

**Version:** 0.1
**Last updated:** 2026-05-25

---

## Design Principles

1. **Sidebar is home.** Persistent left/right dock; user lives here.
2. **Keyboard-first.** Every action reachable without mouse via shortcut or palette.
3. **Progressive disclosure.** Default view is simple. Power features (proxy, fingerprint, snapshots) behind clear entry points.
4. **Visual identity per container.** Color + icon + tab badge color makes 50 containers distinguishable at a glance.
5. **No surprise destruction.** Destructive ops require typed confirmation when irreversible (delete workspace with 10+ containers). Single-action delete uses undo toast for 5 seconds.

---

## Sidebar Layout

```
┌─ Sidebar (320px default, resizable) ────────────────┐
│ ┌─────────────────────────────────────────────────┐ │
│ │  [🔍 Search containers…]            [⚙] [≡]    │ │ ← header
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ ▼ 🏢 Work                              [+] [▶ open] │ ← workspace
│   ┌─────────────────────────────────────────────┐  │
│   │ 🟦 acme-prod      🔒 🌐 3 tabs    [⋮]      │  │ ← container
│   │ 🟦 acme-staging      🌐 1 tab     [⋮]      │  │
│   │ 🟦 acme-dev          🌐 0 tabs    [⋮]      │  │
│   └─────────────────────────────────────────────┘  │
│                                                      │
│ ▶ 🎨 Design                            [+] [▶]      │ ← collapsed
│                                                      │
│ ▼ 🧪 Testing                           [+] [▶]      │
│   ┌─────────────────────────────────────────────┐  │
│   │ 🟧 tenant-1          🌐 2 tabs    [⋮]      │  │
│   │ 🟧 tenant-2          🌐 1 tab     [⋮]      │  │
│   └─────────────────────────────────────────────┘  │
│                                                      │
│ ▶ 📥 Orphaned (5)                                   │ ← uncategorized
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │  [+ New container]    [⚡ Bulk create]  [⌘K]   │ │ ← footer
│ └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Status Icon Legend (per container row)

| Icon | Meaning |
|---|---|
| 🔒 | Locked |
| 🛰 | Proxy enabled |
| 🎭 | Custom fingerprint |
| 📸 | Recent snapshot (< 24h) |
| 🟢 | Currently has active tabs |
| 🌐 | Tab count badge |
| 🏷 | Has tags |

---

## Primary Interactions

### Open container default URL
- Single click container row → opens default URL in new tab (or focus existing)
- `Cmd+Click` → opens in new window
- `Shift+Click` → opens in background tab

### Rename
- Double click container name → inline edit
- `Enter` saves, `Esc` cancels

### Quick menu
- `[⋮]` button or right-click → context menu
  - Open in new tab
  - Open in new window
  - Edit details…
  - Apply template…
  - Take snapshot…
  - Manage proxy…
  - Manage fingerprint…
  - Manage cookies…
  - Lock / Unlock
  - Duplicate
  - Move to workspace…
  - Add tag…
  - Delete

### Drag-and-drop
- Drag container row vertically → reorder within workspace
- Drag container row to another workspace header → move
- Drag container row outside any workspace → move to Orphaned

### Multi-select
- `Cmd+Click` or `Shift+Click` rows → multi-select
- Multi-select toolbar appears at top:
  - Bulk open URL
  - Bulk move to workspace
  - Bulk apply template
  - Bulk delete
  - Bulk tag

---

## Command Palette (`Cmd+K`)

```
┌─────────────────────────────────────────────────────┐
│  [⌘K]  Search anything…                       [Esc] │
├─────────────────────────────────────────────────────┤
│  ⏱ RECENT                                            │
│    Open acme-prod                                   │
│    Snapshot tenant-1                                │
│                                                      │
│  📦 CONTAINERS                                       │
│    🟦 acme-prod         Work • 3 tabs              │
│    🟦 acme-staging      Work • 1 tab               │
│                                                      │
│  🏢 WORKSPACES                                       │
│    Open all in Work                                 │
│    Hibernate Testing                                │
│                                                      │
│  ⚡ ACTIONS                                          │
│    New container                                    │
│    Bulk create from template…                       │
│    Take snapshot of current container               │
│    Lock all containers                              │
│                                                      │
│  📋 TEMPLATES                                        │
│    Create from "Affiliate Network A"                │
│    Create from "QA Tenant"                          │
└─────────────────────────────────────────────────────┘
```

- Fuzzy match across all sections
- Arrow keys navigate, `Enter` executes
- `Tab` cycles section filter (palette acts as section-filter)
- Recent actions stored locally, capped at 10

---

## Container Detail Panel

Opens as a right-side drawer (or modal in narrow viewport) when "Edit details…" selected.

Tabs:
1. **General** — name, color, icon, tags, notes, default URL
2. **Proxy** — assign proxy, pool, test connection
3. **Fingerprint** — assign profile, edit overrides, self-test
4. **Cookies** — origin list, edit per origin
5. **Snapshots** — timeline, create, restore, diff
6. **Vault** — credentials scoped to this container
7. **Rules** — auto-assign URL patterns
8. **Activity** — event log (if enabled)

---

## Bulk Create Flow

```
Step 1 — Source
  [ ] From template:  [Affiliate Network A ▾]
  [ ] From scratch:   color [▼]  icon [▼]

Step 2 — Quantity
  Count:        [20]
  Pattern:      [acme-{n:03}]
  Preview:      acme-001, acme-002, acme-003, ... acme-020

Step 3 — Assignments
  Workspace:    [Work ▾]
  Tags:         [+ marketing] [+ affiliate]
  Proxy pool:   [Pool A — round-robin ▾]

Step 4 — Confirm
  Create 20 containers
  Apply Affiliate Network A template
  Distribute proxies from Pool A
  Tags: marketing, affiliate
  Workspace: Work

  [Cancel]  [Create]
```

Progress bar during creation with cancel button. Result toast: "20 containers created" with "Open all" CTA.

---

## Snapshot Timeline

```
┌─ Snapshots — acme-prod ─────────────────────────────┐
│                                                      │
│  Today                                               │
│  ┌────────────────────────────────────────────────┐ │
│  │ 14:32  Auto: pre-close              [⟳] [⤓] [×]│ │
│  │ 09:15  Manual: "logged in fresh"   [⟳] [⤓] [×]│ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  Yesterday                                           │
│  ┌────────────────────────────────────────────────┐ │
│  │ 18:00  Auto: pre-close              [⟳] [⤓] [×]│ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  [+ Take snapshot now]                              │
└──────────────────────────────────────────────────────┘
```

Actions per snapshot:
- `[⟳]` Restore → confirm dialog
- `[⤓]` Download (encrypted blob)
- `[×]` Delete

Diff view opened by clicking a snapshot, showing cookie/storage deltas vs previous.

---

## Onboarding (First Run)

Three-screen wizard:

**Screen 1 — Welcome**
- Logo + tagline
- "Existing Multi-Account Containers detected — import?" (if applicable)
- Buttons: [Import] [Skip] [Continue]

**Screen 2 — Set up vault (optional)**
- Explain what vault is used for
- Master password input (with strength meter)
- "Skip for now" link

**Screen 3 — Quick tour**
- Animated GIF of sidebar
- Three tips: command palette, bulk create, templates
- "Get started" button → opens sidebar

---

## Theming

- Auto-detect OS dark mode
- Manual override in Settings: Light / Dark / System
- Accent color follows Firefox's theme accent if available
- High-contrast variant for accessibility

Color tokens (Tailwind v4 `@theme`):

```css
@theme {
  --color-bg-primary: hsl(0 0% 100%);        /* light */
  --color-bg-elevated: hsl(0 0% 98%);
  --color-text-primary: hsl(0 0% 10%);
  --color-text-muted: hsl(0 0% 45%);
  --color-accent: hsl(212 100% 50%);
  --color-danger: hsl(0 84% 60%);
  --color-success: hsl(142 71% 45%);
  /* dark variants via @media (prefers-color-scheme: dark) */
}
```

---

## Keyboard Shortcuts (Default)

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+K` | Command palette |
| `Cmd/Ctrl+Shift+C` | New container |
| `Cmd/Ctrl+Shift+B` | Bulk create dialog |
| `Cmd/Ctrl+Shift+L` | Lock all containers |
| `Cmd/Ctrl+/` | Toggle sidebar |
| `Cmd/Ctrl+F` | Focus sidebar search |
| `Esc` | Close palette / dialog |
| `Enter` | Open focused container |
| `Cmd/Ctrl+Enter` | Open in new window |
| `Delete` / `Backspace` | Delete selected (with confirm) |

All shortcuts configurable in Settings.

---

## Accessibility Checklist

- All interactive elements have visible focus rings
- All icons have `aria-label`
- Color is never sole indicator (paired with icon or text)
- Sidebar tree announces "Workspace, expanded/collapsed, N containers"
- Contrast: WCAG 2.1 AA (4.5:1 for body, 3:1 for large text and UI components)
- Reduced motion: respect `prefers-reduced-motion`, disable slide-in transitions
- Keyboard trap prevention: `Esc` always escapes the deepest overlay

---

## Empty States

| Surface | Empty state |
|---|---|
| Sidebar (no containers) | "No containers yet. [Create your first] or [Import from Multi-Account Containers]" |
| Workspace (empty) | "Drag containers here, or [+ New container in this workspace]" |
| Snapshots tab | "No snapshots yet. Snapshots capture cookies and storage so you can restore a session later. [Take snapshot]" |
| Vault locked | "Vault is locked. [Unlock] to access credentials." |
| Command palette (no results) | "No matches. Try a shorter query or [+ Create new container with this name]" |

---

## Error States

| Scenario | UX |
|---|---|
| Proxy connection fails | Toast: "Proxy ProxyName failed health check. Disabled until manual recheck." Link to proxy detail. |
| Snapshot restore conflict | Modal: "Some data couldn't be restored: [list]. Continue anyway?" |
| Container quota hit (if any) | Modal: "Firefox container limit reached. Delete unused containers or archive workspace." |
| Vault wrong password | Inline error, 5-attempt lockout for 5 min after 5 fails |
| Fingerprint script error | Silent log to Settings > Debug; do not break page |
