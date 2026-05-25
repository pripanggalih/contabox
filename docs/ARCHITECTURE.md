# Architecture — Contabox

**Version:** 0.1
**Last updated:** 2026-05-25

---

## 1. High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Firefox Browser Process                       │
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐   ┌─────────────────┐ │
│  │   Sidebar UI     │    │   Popup (mini)   │   │  Options Page   │ │
│  │  (React+Vite)    │    │     (React)      │   │    (React)      │ │
│  └────────┬─────────┘    └────────┬─────────┘   └────────┬────────┘ │
│           │                       │                       │          │
│           └───────────────────────┴───────────────────────┘          │
│                              │ (browser.runtime.sendMessage)         │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Background Service Worker / Page                │    │
│  │                                                              │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐             │    │
│  │  │ Container  │  │ Workspace  │  │  Template  │             │    │
│  │  │  Manager   │  │  Manager   │  │  Manager   │             │    │
│  │  └────────────┘  └────────────┘  └────────────┘             │    │
│  │                                                              │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐             │    │
│  │  │   Proxy    │  │Fingerprint │  │  Snapshot  │             │    │
│  │  │   Engine   │  │   Engine   │  │   Engine   │             │    │
│  │  └────────────┘  └────────────┘  └────────────┘             │    │
│  │                                                              │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐             │    │
│  │  │   Vault    │  │  Auto-rule │  │  Command   │             │    │
│  │  │ (Crypto)   │  │   Engine   │  │  Router    │             │    │
│  │  └────────────┘  └────────────┘  └────────────┘             │    │
│  │                                                              │    │
│  │           ▼ (browser.contextualIdentities)                   │    │
│  │           ▼ (browser.proxy.onRequest)                        │    │
│  │           ▼ (browser.webRequest.onBeforeSendHeaders)         │    │
│  │           ▼ (browser.cookies.*)                              │    │
│  │           ▼ (browser.storage.local / IndexedDB via Dexie)    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │           Content Scripts (per matching tab)                 │    │
│  │  - Fingerprint injection (canvas/WebGL/audio/screen/fonts)   │    │
│  │  - Snapshot capture/restore                                  │    │
│  │  - Autofill (vault clients)                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (optional, v2+)
                  ┌───────────────────────┐
                  │   Native Messaging    │
                  │   Host (Rust/Go CLI)  │
                  └───────────────────────┘
```

## 2. Module Catalog

### 2.1 Background Modules

| Module | Responsibility | Key APIs |
|---|---|---|
| `ContainerManager` | CRUD over containers, sync extended attrs to IndexedDB | `contextualIdentities` |
| `WorkspaceManager` | Group containers, persist hierarchy | IndexedDB |
| `TemplateManager` | Reusable presets, clone logic | IndexedDB |
| `ProxyEngine` | Per-container proxy, rotation, health check | `proxy.onRequest` |
| `FingerprintEngine` | Inject spoofing config to matching tabs | `tabs.onUpdated` + content script |
| `SnapshotEngine` | Capture/restore origin storage | `cookies.*`, content script eval |
| `Vault` | Encrypted credential + sensitive data store | Web Crypto API |
| `AutoRuleEngine` | URL pattern → container routing | `webRequest.onBeforeRequest` (redirect) |
| `CommandRouter` | Single message bus for all UI ↔ BG comms | `runtime.onMessage` |
| `Analytics` | Local-only counters, opt-in ping | IndexedDB |

### 2.2 UI Surfaces

| Surface | Tech | Purpose |
|---|---|---|
| Sidebar | React + Tailwind | Primary UI: tree, search, drag-drop |
| Popup | React + Tailwind | Quick switcher, current-tab info |
| Options | React + Tailwind | Settings, proxy pool, templates, vault unlock |
| Onboarding | React + Tailwind | First-run wizard, import from MAC |
| Command Palette | React (overlay) | Cmd+K, mounted from sidebar |

### 2.3 Content Scripts

| Script | Inject when | Purpose |
|---|---|---|
| `fingerprint.js` | Container has custom FP | Override JS APIs (Canvas.toDataURL, WebGL params, etc.) at `document_start` |
| `snapshot-bridge.js` | On snapshot/restore command | Read/write localStorage, sessionStorage, IndexedDB |
| `autofill.js` | Vault unlocked + matching origin | Fill credential forms |

## 3. Data Model

### 3.1 Container (extended)

```typescript
// Browser-native fields come from contextualIdentities.ContextualIdentity
// Extended fields stored in IndexedDB keyed by cookieStoreId
interface ContainerExt {
  cookieStoreId: string;           // PK, matches browser API
  workspaceId?: string;            // FK → Workspace.id
  templateId?: string;             // FK → Template.id (source template)
  tags: string[];
  notes: string;
  proxyId?: string;                // FK → Proxy.id
  fingerprintId?: string;          // FK → FingerprintProfile.id
  isLocked: boolean;
  autoSnapshot: boolean;
  retentionDays?: number;
  createdAt: number;
  lastUsedAt: number;
}
```

### 3.2 Workspace

```typescript
interface Workspace {
  id: string;                      // UUID
  name: string;
  color: string;                   // hex
  icon: string;                    // emoji or icon key
  defaultUrls: string[];           // opened on "Open workspace"
  order: number;
  collapsed: boolean;
}
```

### 3.3 Template

```typescript
interface Template {
  id: string;
  name: string;
  containerSeed: {
    namePattern: string;           // e.g., "acme-{n}"
    color: string;
    icon: string;
  };
  proxyId?: string;
  fingerprintId?: string;
  initialCookies?: CookieSeed[];
  initialLocalStorage?: Record<string, string>;
  notes: string;
  createdAt: number;
}
```

### 3.4 Proxy

```typescript
interface Proxy {
  id: string;
  label: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  passwordRef?: string;            // points to Vault entry
  poolId?: string;                 // FK → ProxyPool.id (optional)
  lastHealthCheck?: number;
  lastHealthStatus?: 'ok' | 'fail';
}

interface ProxyPool {
  id: string;
  name: string;
  proxyIds: string[];
  rotation: 'random' | 'round-robin' | 'sticky-per-session';
  cooldownSec: number;
}
```

### 3.5 FingerprintProfile

```typescript
interface FingerprintProfile {
  id: string;
  name: string;
  source: 'preset' | 'custom' | 'random';
  ua: string;
  canvas: { noise: number };       // 0–1
  webgl: { vendor: string; renderer: string };
  audio: { noise: number };
  screen: { width: number; height: number; colorDepth: number };
  fonts: string[];                 // allowlist
  timezone: string;                // IANA TZ
  language: string;                // BCP-47
  hardwareConcurrency: number;
  deviceMemory: number;
  webrtcMode: 'real' | 'proxy' | 'disabled';
}
```

### 3.6 Snapshot

```typescript
interface Snapshot {
  id: string;
  containerId: string;             // cookieStoreId
  label: string;
  createdAt: number;
  origins: SnapshotOrigin[];
  encrypted: boolean;
}

interface SnapshotOrigin {
  origin: string;                  // e.g., https://app.example.com
  cookies: Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDb?: IDBDump;             // optional, expensive
}
```

### 3.7 AutoRule

```typescript
interface AutoRule {
  id: string;
  pattern: string;                 // glob or /regex/
  containerId: string;
  enabled: boolean;
  order: number;
  action: 'open-in' | 'redirect';
}
```

### 3.8 Vault Entry

```typescript
interface VaultEntry {
  id: string;
  scope: 'global' | 'container';
  containerId?: string;
  origin: string;
  kind: 'password' | 'totp' | 'note' | 'proxy-credential';
  cipher: string;                  // base64 AES-GCM ciphertext
  iv: string;                      // base64 IV
  createdAt: number;
  updatedAt: number;
}
```

## 4. Storage Layout (Dexie / IndexedDB)

```typescript
class ContaboxDB extends Dexie {
  containers!: Table<ContainerExt, string>;
  workspaces!: Table<Workspace, string>;
  templates!: Table<Template, string>;
  proxies!: Table<Proxy, string>;
  proxyPools!: Table<ProxyPool, string>;
  fingerprints!: Table<FingerprintProfile, string>;
  snapshots!: Table<Snapshot, string>;
  rules!: Table<AutoRule, string>;
  vault!: Table<VaultEntry, string>;
  meta!: Table<{ key: string; value: any }, string>;

  constructor() {
    super('contabox');
    this.version(1).stores({
      containers: 'cookieStoreId, workspaceId, templateId',
      workspaces: 'id, order',
      templates: 'id, createdAt',
      proxies: 'id, poolId',
      proxyPools: 'id',
      fingerprints: 'id',
      snapshots: 'id, containerId, createdAt',
      rules: 'id, order, enabled',
      vault: 'id, containerId, origin, kind',
      meta: 'key',
    });
  }
}
```

## 5. Message Bus

Single `runtime.onMessage` handler in BG dispatches to module handlers via discriminated union:

```typescript
type Command =
  | { type: 'container.create'; payload: CreateContainerInput }
  | { type: 'container.bulkCreate'; payload: BulkCreateInput }
  | { type: 'container.delete'; payload: { id: string } }
  | { type: 'workspace.open'; payload: { id: string } }
  | { type: 'snapshot.capture'; payload: { containerId: string; label: string } }
  | { type: 'snapshot.restore'; payload: { snapshotId: string } }
  | { type: 'vault.unlock'; payload: { password: string } }
  | { type: 'proxy.test'; payload: { proxyId: string } }
  // ... etc
  ;

type CommandResult<T extends Command> =
  | { ok: true; data: ResultFor<T> }
  | { ok: false; error: string; code: ErrorCode };
```

All UI surfaces use a thin `invoke(cmd)` helper that wraps `sendMessage` with type inference.

## 6. Proxy Engine — Per-Container Routing

```typescript
browser.proxy.onRequest.addListener(
  async (req) => {
    const tab = await browser.tabs.get(req.tabId);
    const containerId = tab.cookieStoreId;
    const proxy = await proxyEngine.resolve(containerId);
    if (!proxy) return { type: 'direct' };
    return {
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: await vault.decrypt(proxy.passwordRef),
    };
  },
  { urls: ['<all_urls>'] }
);
```

Rotation strategy logic lives in `proxyEngine.resolve()`.

## 7. Fingerprint Engine — Injection

Two-stage:
1. **Pre-navigation:** `webRequest.onBeforeSendHeaders` rewrites UA + `Accept-Language` per `cookieStoreId`.
2. **In-page:** Content script registered via `browser.scripting.registerContentScripts` with `cookieStoreIds: [...]` filter (Firefox-specific extension), injected at `document_start` with `world: 'MAIN'` to override `navigator.*`, `screen.*`, `Canvas.prototype.toDataURL`, `WebGLRenderingContext.prototype.getParameter`, `Intl.DateTimeFormat`, etc.

Config passed via `data-` attributes on a `<meta>` tag injected by extension before scripts run.

## 8. Snapshot Engine — Capture Flow

```
User → Sidebar: "Snapshot 'logged-in'"
  → BG: snapshot.capture
    → for each origin used by container:
        → inject content script
        → script reads cookies (via BG cookies API), localStorage, sessionStorage, IDB
        → returns serialized payload
    → BG aggregates, encrypts (if vault unlocked), saves to Dexie
  ← UI: success toast with snapshot ID
```

Restore is reverse: clear current state per origin, then write.

## 9. Vault — Crypto

- KDF: PBKDF2 SHA-256, 600,000 iterations, 16-byte salt (per-install)
- Cipher: AES-GCM 256-bit, 12-byte IV per record
- Master password held in `chrome.storage.session` (cleared on browser close) — or in-memory module variable if session storage unavailable
- Auto-lock: configurable idle timer (default 15 min)

## 10. Migration / Import

- **From Multi-Account Containers:** Read `contextualIdentities.query()`, mirror each into Contabox; offer to disable MAC after migration.
- **From SessionBox export:** Parse SessionBox JSON, map sessions to containers.
- **CSV bulk import:** Columns: name, color, icon, proxy_uri, ua, notes. One row = one container.

## 11. Manifest (sketch)

```json
{
  "manifest_version": 3,
  "name": "Contabox",
  "version": "0.1.0",
  "permissions": [
    "contextualIdentities",
    "cookies",
    "storage",
    "tabs",
    "webRequest",
    "webRequestBlocking",
    "proxy",
    "scripting",
    "<all_urls>"
  ],
  "background": { "scripts": ["background.js"] },
  "sidebar_action": {
    "default_panel": "sidebar.html",
    "default_title": "Contabox",
    "default_icon": "icons/icon-48.png"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "contabox@galih.dev",
      "strict_min_version": "115.0"
    }
  }
}
```

## 12. Build & Distribution

```
src/
  background/       ← BG entry + modules
  sidebar/          ← React app
  popup/            ← React app
  options/          ← React app
  content/          ← content scripts
  shared/           ← types, utils, db
  vendor/           ← third-party patches
manifest.json
vite.config.ts
```

- Build tool: Vite + `@crxjs/vite-plugin` (Firefox-compatible fork) or `web-ext` for packaging
- Output: `dist/` (load as temporary add-on) and `dist/contabox.xpi` (signed for AMO)
- CI: GitHub Actions → lint → typecheck → test → build → upload XPI artifact

## 13. Testing Strategy

| Layer | Tool | Coverage |
|---|---|---|
| Unit | Vitest | All engines, pure logic |
| Integration | Vitest + jsdom + `webextension-polyfill` mocks | Message bus, DB |
| E2E | Playwright (Firefox) with extension loaded | Critical user flows |
| Manual | Checklist in `docs/QA.md` | Fingerprint vs pixelscan/creepjs |

## 14. Open Architectural Questions

- A1: MV3 service worker lifecycle — Firefox keeps persistent BG pages as fallback, but plan for ephemeral SW behavior.
- A2: How to test fingerprint quality CI? → Headless Firefox + saved baseline JSON of expected `navigator` shape per profile.
- A3: When (if ever) to ship a Native Messaging Host? → v2 milestone, separate repo.
- A4: WASM for fingerprint randomization (better entropy + perf)? → Defer to post-MVP perf pass.
