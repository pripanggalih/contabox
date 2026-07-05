/**
 * Domain types — extended attributes layered over Firefox's native
 * `contextualIdentities` API. Persisted via Dexie.
 *
 * Keep this file free of runtime imports. Schemas and validators live in
 * `schemas.ts`; this file is the single source of truth for shapes only.
 */

export type ContainerColor =
  | 'blue'
  | 'turquoise'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple'
  | 'toolbar';

export type ContainerIcon =
  | 'fingerprint'
  | 'briefcase'
  | 'dollar'
  | 'cart'
  | 'circle'
  | 'gift'
  | 'vacation'
  | 'food'
  | 'fruit'
  | 'pet'
  | 'tree'
  | 'chill'
  | 'fence';

/** Mirror of `browser.contextualIdentities.ContextualIdentity` we care about. */
export interface NativeContainer {
  cookieStoreId: string;
  name: string;
  color: ContainerColor;
  colorCode: string;
  icon: ContainerIcon;
  iconUrl: string;
}

/** Extended attributes stored in IndexedDB, keyed by `cookieStoreId`. */
export interface ContainerExt {
  cookieStoreId: string;
  workspaceId?: string;
  templateId?: string;
  tags: string[];
  notes: string;
  proxyId?: string;
  fingerprintId?: string;
  isLocked: boolean;
  /**
   * Optional PIN gate for unlock. PBKDF2-SHA256 hashed (separate salt per
   * container). When unset, locked containers unlock with the global vault
   * master password instead.
   */
  lockPinHash?: string;
  lockPinSalt?: string;
  autoSnapshot: boolean;
  /**
   * Opt-in: when capturing a snapshot for this container, also capture each
   * origin's IndexedDB database content. Default false; sites with > 10MB IDB
   * (Notion, Linear, Figma) can blow past the 100MB-per-snapshot soft cap.
   */
  snapshotIncludeIdb?: boolean;
  retentionDays?: number;
  /**
   * When a proxy is assigned but currently unavailable (missing / disabled /
   * lookup error), ProxyEngine fails CLOSED — it blackholes the request rather
   * than silently falling back to the direct connection and leaking the real
   * IP. Set to `false` to opt a container out (fall back to direct). Default
   * (undefined) is treated as fail-closed.
   */
  proxyFailClosed?: boolean;
  defaultUrl?: string;
  order: number;
  createdAt: number;
  lastUsedAt: number;
}

/** Hydrated view: native container joined with its extended attrs. */
export interface ContainerView extends NativeContainer {
  ext: ContainerExt;
}

export interface Workspace {
  id: string;
  name: string;
  color: ContainerColor;
  icon: ContainerIcon;
  defaultUrls: string[];
  order: number;
  collapsed: boolean;
  /**
   * True for the auto-created "Firefox Default" workspace that holds Firefox's
   * built-in containers (Personal, Work, Banking, Shopping, …) and any other
   * pre-existing native container Contabox didn't create.
   * User-created containers never auto-join this workspace.
   */
  isNative?: boolean;
  createdAt: number;
}

export interface Template {
  id: string;
  name: string;
  containerSeed: {
    namePattern: string;
    color: ContainerColor;
    icon: ContainerIcon;
  };
  proxyId?: string;
  fingerprintId?: string;
  defaultUrl?: string;
  notes: string;
  createdAt: number;
}

export type ProxyType = 'http' | 'https' | 'socks4' | 'socks5';

export interface Proxy {
  id: string;
  label: string;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  passwordRef?: string;
  poolId?: string;
  lastHealthCheck?: number;
  lastHealthStatus?: 'ok' | 'fail';
  lastHealthLatencyMs?: number;
  /**
   * Number of consecutive failed health checks. Auto-disable triggers when
   * this reaches the threshold (default 3). Reset to 0 on a successful probe.
   */
  consecutiveFails?: number;
  /**
   * When true, ProxyEngine treats this proxy as unavailable and refuses to
   * route through it. User can re-enable from the proxy panel.
   */
  disabled?: boolean;
  createdAt: number;
}

export type RotationStrategy = 'random' | 'round-robin' | 'sticky-per-session';

export interface ProxyPool {
  id: string;
  name: string;
  proxyIds: string[];
  rotation: RotationStrategy;
  cooldownSec: number;
  createdAt: number;
}

export type WebRtcMode = 'real' | 'proxy' | 'disabled';

export interface FingerprintProfile {
  id: string;
  name: string;
  source: 'preset' | 'custom' | 'random';
  ua: string;
  canvas: { noise: number };
  webgl: { vendor: string; renderer: string };
  audio: { noise: number };
  screen: { width: number; height: number; colorDepth: number };
  fonts: string[];
  timezone: string;
  language: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  webrtcMode: WebRtcMode;
  createdAt: number;
}

export interface Snapshot {
  id: string;
  containerId: string;
  label: string;
  createdAt: number;
  /**
   * Plaintext origins. Populated only when `encrypted === false`. When the
   * snapshot is encrypted, this is an empty array and the real payload lives
   * in `cipher`/`iv` (AES-GCM of `JSON.stringify(SnapshotOrigin[])` under the
   * vault master key).
   */
  origins: SnapshotOrigin[];
  encrypted: boolean;
  /** AES-GCM ciphertext of the origins array. Present iff `encrypted`. */
  cipher?: string;
  /** AES-GCM IV for `cipher`. Present iff `encrypted`. */
  iv?: string;
}

export interface SnapshotOrigin {
  origin: string;
  cookies: SnapshotCookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  /**
   * Optional dump of the origin's IndexedDB databases. Captured only when the
   * container has `snapshotIncludeIdb: true`. Each db is structured-clone
   * serialized; binary types (Blob, File, ArrayBuffer) are best-effort.
   */
  indexedDb?: SnapshotIndexedDb[];
}

export interface SnapshotIndexedDb {
  name: string;
  version: number;
  stores: SnapshotIdbStore[];
}

export interface SnapshotIdbStore {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  /** Secondary indexes on the store, recreated verbatim on restore. */
  indexes?: Array<{
    name: string;
    keyPath: string | string[];
    unique: boolean;
    multiEntry: boolean;
  }>;
  /**
   * Records as `{ key, value }` pairs. `key` is `null` when keyPath is set
   * (Firefox derives the key from the value); explicit when out-of-line.
   * Both are encoded via `JSON.stringify` after a structured-clone pass for
   * cross-runtime portability.
   */
  records: Array<{ key: unknown; value: unknown }>;
}

export interface SnapshotCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'no_restriction' | 'lax' | 'strict';
  expirationDate?: number;
}

export interface AutoRule {
  id: string;
  pattern: string;
  patternType: 'domain' | 'substring' | 'glob' | 'regex';
  containerId: string;
  enabled: boolean;
  order: number;
  action: 'open-in' | 'redirect';
  createdAt: number;
}

export type VaultEntryKind = 'password' | 'totp' | 'note' | 'proxy-credential';

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export interface VaultEntry {
  id: string;
  scope: 'global' | 'container';
  containerId?: string;
  origin: string;
  kind: VaultEntryKind;
  label: string;
  cipher: string;
  iv: string;
  /**
   * TOTP parameters, present only for `kind === 'totp'`. Captured from the
   * `otpauth://` URI so issuers using non-default period/digits/algorithm
   * produce correct codes. Absent → RFC 6238 defaults (30s / 6 / SHA-1).
   */
  totp?: { period: number; digits: number; algorithm: TotpAlgorithm };
  createdAt: number;
  updatedAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
