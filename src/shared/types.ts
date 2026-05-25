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
  autoSnapshot: boolean;
  retentionDays?: number;
  defaultUrl?: string;
  /** Optional hex override. When set, sidebar/popup render this instead of the
   *  9 native Firefox colors. The native `contextualIdentities` color is the
   *  closest match from the enum (used by Firefox's tab strip indicator). */
  customColor?: string;
  /** Optional Lucide icon name override (e.g. "Plane", "Database"). When set,
   *  sidebar/popup/palette render this instead of the 13-value native icon
   *  enum. The native `contextualIdentities` icon stays as-is — Firefox's tab
   *  strip indicator keeps showing one of its built-in glyphs. */
  customIcon?: string;
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
  color: string;
  icon: string;
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
  origins: SnapshotOrigin[];
  encrypted: boolean;
}

export interface SnapshotOrigin {
  origin: string;
  cookies: SnapshotCookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
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
  patternType: 'substring' | 'glob' | 'regex';
  containerId: string;
  enabled: boolean;
  order: number;
  action: 'open-in' | 'redirect';
  createdAt: number;
}

export type VaultEntryKind = 'password' | 'totp' | 'note' | 'proxy-credential';

export interface VaultEntry {
  id: string;
  scope: 'global' | 'container';
  containerId?: string;
  origin: string;
  kind: VaultEntryKind;
  label: string;
  cipher: string;
  iv: string;
  createdAt: number;
  updatedAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
