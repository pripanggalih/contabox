# Technology Stack — Contabox

**Version:** 0.1
**Last updated:** 2026-05-25

---

## Summary Table

| Layer | Choice | Alternative considered | Why this |
|---|---|---|---|
| Language | TypeScript 5.x | JavaScript | Type safety across IPC boundaries |
| Build | Vite 5+ | Webpack, Parcel | Fastest dev loop, ESM native |
| Extension scaffolding | `@crxjs/vite-plugin` (Firefox fork) + `web-ext` | Plain Vite + manual manifest | HMR for content + background |
| UI framework | React 18 | Svelte 5, Solid | Largest ecosystem, team familiarity |
| Styling | TailwindCSS v4 | CSS Modules, vanilla-extract | Velocity, dark mode trivial, no PostCSS config |
| State (UI) | Zustand | Redux Toolkit, Jotai | Minimal boilerplate, BG-sync friendly |
| State (storage) | Dexie 4 (IndexedDB) | localStorage, IDB raw | Schema migrations, queries, observable |
| Crypto | Web Crypto API | libsodium-wrappers | Built-in, no bundle cost |
| Validation | Zod | Yup, io-ts | Type inference, runtime safe |
| Testing — unit | Vitest | Jest | Vite-native, fast |
| Testing — E2E | Playwright (Firefox) | Selenium, Puppeteer | Native Firefox extension loading |
| Linting | Biome | ESLint + Prettier | Single tool, fast |
| Package manager | pnpm | npm, Yarn | Disk efficiency, monorepo-ready |
| CI | GitHub Actions | CircleCI | Free for OSS, matrix builds |

---

## Detailed Rationale

### Language: TypeScript

Strict mode. `noUncheckedIndexedAccess: true`. Type contracts at every IPC boundary (BG ↔ UI ↔ content script) to catch shape drift early.

### Build: Vite + crxjs fork

Vite gives sub-200ms HMR. The `@crxjs/vite-plugin` has a Firefox fork that handles `sidebar_action` and Firefox MV3 quirks. Fallback to `web-ext` CLI for packaging XPI.

### UI: React 18

Concurrent rendering useful for virtual scrolling sidebar. Avoid Server Components (irrelevant for extension). Keep `@types/react` aligned.

### Styling: Tailwind v4

v4 is CSS-first config (no `tailwind.config.js` JS). Smaller, faster, simpler. Custom design tokens via `@theme` directive. Tree-shaken to ~10KB final.

Caveats:
- No CDN; bundle locally (CSP blocks remote scripts/styles in extensions)
- JIT mode mandatory

### UI State: Zustand

Each window context (sidebar, popup, options) gets its own store. Source of truth lives in BG; UI stores are projections kept in sync via `runtime.onMessage` broadcasts.

Pattern:
```typescript
// BG broadcasts on change
broadcast({ type: 'state.containersChanged', payload: containers });

// UI subscribes
useStore.getState().setContainers(payload);
```

Avoid React Context for cross-iframe state — message bus is the boundary.

### Storage: Dexie 4

Schema-versioned IndexedDB. Migrations declared inline:

```typescript
db.version(1).stores({ containers: 'cookieStoreId' });
db.version(2).stores({ containers: 'cookieStoreId, workspaceId' }); // adds index
```

Observable queries via `useLiveQuery` (React hook) for reactive UI without extra plumbing.

### Crypto: Web Crypto API

PBKDF2 + AES-GCM. No external crypto library — avoids supply-chain risk and bundle bloat. Sample:

```typescript
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
  passwordKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);
```

### Validation: Zod

Every message between BG and UI passes through a Zod schema. Catches malformed payloads from content scripts (untrusted boundary).

```typescript
const CreateContainer = z.object({
  name: z.string().min(1).max(50),
  color: z.enum([...containerColors]),
  icon: z.enum([...containerIcons]),
});
type CreateContainer = z.infer<typeof CreateContainer>;
```

### Testing

- **Vitest:** All modules. Mock `browser.*` APIs via `webextension-polyfill` + `jest-webextension-mock` style stubs.
- **Playwright:** Critical flows only. Firefox launched with `--load-extension` (or temporary add-on auto-load).
- **Manual QA:** Documented checklist (`docs/QA.md`) — fingerprint sites can't be automated cheaply.

### Linting: Biome

Single tool replaces ESLint + Prettier + import-sort. Fast (Rust-based). Pre-commit hook + CI gate.

### Package manager: pnpm

Workspaces ready for future Native Messaging Host monorepo. Strict node_modules layout catches phantom deps.

---

## Browser API Inventory

| API | Permission | Purpose |
|---|---|---|
| `contextualIdentities` | `contextualIdentities` | Container CRUD |
| `cookies` | `cookies`, `<all_urls>` | Snapshot capture, cookie editor |
| `proxy.onRequest` | `proxy` | Per-container proxy |
| `webRequest.onBeforeSendHeaders` | `webRequest`, `webRequestBlocking` | Header rewrite (UA, Accept-Language) |
| `webRequest.onCompleted` | `webRequest` | Bandwidth analytics |
| `scripting.registerContentScripts` | `scripting` | Per-container content script (FP injection) |
| `storage.local` / `storage.session` | `storage` | Misc state + session-only vault key |
| `tabs.*` | `tabs` | Tab info, move, query |
| `sidebar_action` | (no permission) | Sidebar UI |
| `commands` | (declared) | Keyboard shortcuts |
| `runtime.onMessage` | (no permission) | Message bus |

---

## Dependencies (Initial)

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0",
    "dexie": "^4.0.0",
    "dexie-react-hooks": "^1.1.0",
    "zod": "^3.23.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "lucide-react": "^0.400.0",
    "cmdk": "^1.0.0",
    "@dnd-kit/core": "^6.1.0",
    "react-virtuoso": "^4.7.0",
    "totp-generator": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@crxjs/vite-plugin": "^2.0.0-beta",
    "web-ext": "^8.0.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.46.0",
    "@biomejs/biome": "^1.8.0",
    "@types/firefox-webext-browser": "^120.0.0",
    "webextension-polyfill": "^0.12.0"
  }
}
```

---

## Folder Structure

```
contabox/
├─ manifest.json
├─ vite.config.ts
├─ biome.json
├─ tsconfig.json
├─ package.json
├─ docs/
│   ├─ PRD.md
│   ├─ ARCHITECTURE.md
│   ├─ FEATURES.md
│   ├─ ROADMAP.md
│   ├─ TECH_STACK.md
│   ├─ UX_SPEC.md
│   └─ QA.md
├─ public/
│   ├─ icons/
│   └─ fingerprint-presets/
├─ src/
│   ├─ background/
│   │   ├─ index.ts
│   │   ├─ command-router.ts
│   │   ├─ container-manager.ts
│   │   ├─ workspace-manager.ts
│   │   ├─ template-manager.ts
│   │   ├─ proxy-engine.ts
│   │   ├─ fingerprint-engine.ts
│   │   ├─ snapshot-engine.ts
│   │   ├─ auto-rule-engine.ts
│   │   ├─ vault.ts
│   │   └─ analytics.ts
│   ├─ sidebar/
│   │   ├─ index.html
│   │   ├─ main.tsx
│   │   ├─ App.tsx
│   │   ├─ components/
│   │   └─ hooks/
│   ├─ popup/
│   │   ├─ index.html
│   │   └─ main.tsx
│   ├─ options/
│   │   ├─ index.html
│   │   └─ main.tsx
│   ├─ content/
│   │   ├─ fingerprint.ts
│   │   ├─ snapshot-bridge.ts
│   │   └─ autofill.ts
│   ├─ shared/
│   │   ├─ types.ts
│   │   ├─ schemas.ts            (Zod)
│   │   ├─ db.ts                 (Dexie)
│   │   ├─ messaging.ts
│   │   ├─ crypto.ts
│   │   └─ utils.ts
│   └─ test/
│       ├─ unit/
│       └─ e2e/
└─ .github/
    └─ workflows/
        └─ ci.yml
```

---

## Performance Targets (Locked)

| Op | Target | Stretch |
|---|---|---|
| Sidebar first paint (100 containers) | < 200ms | < 100ms |
| Bulk create 50 containers | < 5s | < 3s |
| Snapshot capture (10MB origin) | < 1s | < 500ms |
| Snapshot restore | < 2s | < 1s |
| Command palette open | < 50ms | < 20ms |
| Background memory (100 containers idle) | < 50MB | < 30MB |
| Cold start (sidebar open) | < 500ms | < 300ms |

Measured via Vite-built production bundle, Firefox Release on M1 MacBook Pro.
