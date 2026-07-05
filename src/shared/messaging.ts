/**
 * Cross-context message bus.
 *
 * UI surfaces (sidebar/popup/options) and content scripts call `invoke(cmd)`.
 * Background `commandRouter` dispatches on `cmd.type`, validates payloads
 * with Zod, and returns a typed `CommandResult`.
 *
 * Adding a new command:
 *   1. Add to `Command` union here
 *   2. Add a Zod schema in `schemas.ts` (or inline if trivial)
 *   3. Register a handler in `background/command-router.ts`
 */
import { browser } from './browser';
import type {
  AutoRuleInput,
  BulkCreateInput,
  BulkOpenUrlInput,
  CreateContainerInput,
  ProxyImportLineInput,
  ProxyInput,
  ProxyPoolInput,
  TemplateInput,
  UpdateContainerInput,
  WorkspaceInput,
} from './schemas';
import type {
  AutoRule,
  ContainerView,
  FingerprintProfile,
  Proxy,
  ProxyPool,
  Snapshot,
  SnapshotCookie,
  Template,
  Workspace,
} from './types';

export type Command =
  // containers
  | { type: 'container.list' }
  | { type: 'container.create'; payload: CreateContainerInput }
  | { type: 'container.update'; payload: UpdateContainerInput }
  | { type: 'container.delete'; payload: { cookieStoreId: string } }
  | { type: 'container.deleteRestore'; payload: { cookieStoreId: string } }
  | { type: 'container.bulkCreate'; payload: BulkCreateInput }
  | { type: 'container.bulkOpenUrl'; payload: BulkOpenUrlInput }
  | { type: 'container.openDefault'; payload: { cookieStoreId: string; newWindow?: boolean } }
  | { type: 'container.setLocked'; payload: { cookieStoreId: string; locked: boolean } }
  | { type: 'container.lockAll' }
  | { type: 'container.bulkDelete'; payload: { ids: string[] } }
  | { type: 'container.bulkSetLocked'; payload: { ids: string[]; locked: boolean } }
  | { type: 'container.bulkSetWorkspace'; payload: { ids: string[]; workspaceId: string | null } }
  | { type: 'container.bulkAddTags'; payload: { ids: string[]; tags: string[] } }
  | { type: 'container.bulkRemoveTags'; payload: { ids: string[]; tags: string[] } }
  | { type: 'container.bulkSetProxy'; payload: { ids: string[]; proxyId: string | null } }
  | {
      type: 'container.bulkSetFingerprint';
      payload: { ids: string[]; fingerprintId: string | null };
    }
  | { type: 'container.bulkHibernate'; payload: { ids: string[] } }
  | {
      type: 'container.bulkOpenDefault';
      payload: { ids: string[]; newWindow?: boolean; staggerMs?: number };
    }
  // workspaces
  | { type: 'workspace.list' }
  | { type: 'workspace.create'; payload: WorkspaceInput }
  | {
      type: 'workspace.update';
      payload: { id: string } & Partial<WorkspaceInput> & { collapsed?: boolean; order?: number };
    }
  | { type: 'workspace.delete'; payload: { id: string; orphanContainers?: boolean } }
  | { type: 'workspace.openAll'; payload: { id: string } }
  | { type: 'workspace.hibernate'; payload: { id: string } }
  // templates
  | { type: 'template.list' }
  | { type: 'template.create'; payload: TemplateInput }
  | { type: 'template.update'; payload: { id: string } & Partial<TemplateInput> }
  | { type: 'template.delete'; payload: { id: string } }
  | { type: 'template.apply'; payload: { id: string; cookieStoreId: string } }
  // misc
  | { type: 'meta.get'; payload: { key: string } }
  | { type: 'meta.set'; payload: { key: string; value: unknown } }
  | { type: 'mac.detect' }
  | { type: 'mac.import' }
  // proxy
  | { type: 'proxy.list' }
  | { type: 'proxy.create'; payload: ProxyInput }
  | { type: 'proxy.update'; payload: { id: string } & Partial<ProxyInput> }
  | { type: 'proxy.delete'; payload: { id: string } }
  | { type: 'proxy.healthCheck'; payload: { id: string; endpoint?: string } }
  | { type: 'proxy.bulkImport'; payload: ProxyImportLineInput }
  | { type: 'proxyPool.list' }
  | { type: 'proxyPool.create'; payload: ProxyPoolInput }
  | { type: 'proxyPool.update'; payload: { id: string } & Partial<ProxyPoolInput> }
  | { type: 'proxyPool.delete'; payload: { id: string } }
  // vault
  | { type: 'vault.status' }
  | { type: 'vault.initialize'; payload: { password: string } }
  | { type: 'vault.unlock'; payload: { password: string } }
  | { type: 'vault.lock' }
  | { type: 'vault.changeMasterPassword'; payload: { newPassword: string } }
  | { type: 'vault.export' }
  | { type: 'vault.import'; payload: { envelope: unknown; password: string } }
  // fingerprint
  | { type: 'fingerprint.list' }
  | { type: 'fingerprint.createCustom'; payload: Omit<FingerprintProfile, 'id' | 'createdAt'> }
  | { type: 'fingerprint.randomFromPreset'; payload: { presetKey: string } }
  | { type: 'fingerprint.update'; payload: { id: string } & Partial<FingerprintProfile> }
  | { type: 'fingerprint.delete'; payload: { id: string } }
  // snapshots
  | { type: 'snapshot.list'; payload?: { containerId?: string } }
  | { type: 'snapshot.capture'; payload: { containerId: string; label: string } }
  | { type: 'snapshot.restore'; payload: { snapshotId: string } }
  | { type: 'snapshot.delete'; payload: { id: string } }
  | { type: 'snapshot.diff'; payload: { beforeId: string; afterId: string } }
  // cookies
  | { type: 'cookie.list'; payload: { storeId: string; url?: string } }
  | { type: 'cookie.set'; payload: { storeId: string; cookie: SnapshotCookie } }
  | {
      type: 'cookie.remove';
      payload: { storeId: string; name: string; domain: string; path: string; secure: boolean };
    }
  | { type: 'cookie.importNetscape'; payload: { storeId: string; text: string } }
  | { type: 'cookie.importJson'; payload: { storeId: string; text: string } }
  | { type: 'cookie.exportNetscape'; payload: { storeId: string; url?: string } }
  | { type: 'cookie.exportJson'; payload: { storeId: string; url?: string } }
  // auto-rules
  | { type: 'autoRule.list' }
  | { type: 'autoRule.create'; payload: AutoRuleInput }
  | {
      type: 'autoRule.update';
      payload: { id: string } & Partial<AutoRuleInput> & { enabled?: boolean; order?: number };
    }
  | { type: 'autoRule.delete'; payload: { id: string } }
  | { type: 'autoRule.test'; payload: { rule: AutoRuleInput; url: string } }
  // vault entries
  | {
      type: 'vault.addEntry';
      payload: {
        scope: 'global' | 'container';
        containerId?: string;
        origin: string;
        kind: 'password' | 'totp' | 'note' | 'proxy-credential';
        label: string;
        secret: string;
        totp?: { period: number; digits: number; algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512' };
      };
    }
  | { type: 'vault.listEntries' }
  | { type: 'vault.deleteEntry'; payload: { id: string } }
  | { type: 'vault.getSecret'; payload: { id: string } }
  | { type: 'vault.totpCode'; payload: { id: string } }
  | { type: 'vault.setAutoLock'; payload: { minutes: number } }
  // lock manager
  | {
      type: 'lock.unlock';
      payload: { cookieStoreId: string; pin?: string; masterPassword?: string };
    }
  | { type: 'lock.relock'; payload: { cookieStoreId: string } }
  | { type: 'lock.setPin'; payload: { cookieStoreId: string; pin: string | null } }
  | { type: 'lock.status'; payload: { cookieStoreId: string } }
  // autofill (called from content script)
  | { type: 'autofill.match'; payload: { origin: string } }
  | { type: 'autofill.getSecret'; payload: { id: string; origin: string } }
  // proxy scheduler
  | { type: 'proxy.scheduleHealth'; payload: { minutes: number } }
  | { type: 'proxy.runScheduledHealth' }
  | { type: 'proxy.setEnabled'; payload: { id: string; enabled: boolean } }
  // privacy / settings
  | { type: 'settings.getPrivacy' }
  | { type: 'settings.setTelemetryOptIn'; payload: { enabled: boolean } }
  | { type: 'settings.exportDebugLogs' }
  // snapshots: prune
  | { type: 'snapshot.prune'; payload: { containerId: string } }
  | { type: 'snapshot.pruneAll' }
  // backup
  | { type: 'backup.exportPlain' }
  | { type: 'backup.exportEncrypted'; payload: { password: string } }
  | { type: 'backup.import'; payload: { bundle: unknown; password?: string } }
  // drive sync
  | { type: 'sync.status' }
  | { type: 'sync.connect' }
  | { type: 'sync.disconnect' }
  | { type: 'sync.now'; payload: { password: string } }
  | { type: 'sync.setIncludeSnapshots'; payload: { on: boolean } }
  | {
      type: 'sync.resolveConflict';
      payload: { choice: 'use-remote' | 'push-local'; password: string };
    };

export type CommandType = Command['type'];

export type ResultMap = {
  'container.list': ContainerView[];
  'container.create': ContainerView;
  'container.update': ContainerView;
  'container.delete': { cookieStoreId: string; restorable: boolean };
  'container.deleteRestore': ContainerView;
  'container.bulkCreate': ContainerView[];
  'container.bulkOpenUrl': { opened: number };
  'container.openDefault': { tabId: number };
  'container.setLocked': ContainerView;
  'container.lockAll': { count: number };
  'container.bulkDelete': { deleted: number };
  'container.bulkSetLocked': { count: number };
  'container.bulkSetWorkspace': { count: number };
  'container.bulkAddTags': { count: number };
  'container.bulkRemoveTags': { count: number };
  'container.bulkSetProxy': { count: number };
  'container.bulkSetFingerprint': { count: number };
  'container.bulkHibernate': { closed: number };
  'container.bulkOpenDefault': { opened: number };
  'workspace.list': Workspace[];
  'workspace.create': Workspace;
  'workspace.update': Workspace;
  'workspace.delete': { id: string };
  'workspace.openAll': { opened: number };
  'workspace.hibernate': { closed: number };
  'template.list': Template[];
  'template.create': Template;
  'template.update': Template;
  'template.delete': { id: string };
  'template.apply': ContainerView;
  'meta.get': unknown;
  'meta.set': { key: string };
  'mac.detect': { count: number; native: ContainerView[] };
  'mac.import': { imported: number; workspaceId: string };
  'proxy.list': Proxy[];
  'proxy.create': Proxy;
  'proxy.update': Proxy;
  'proxy.delete': { id: string };
  'proxy.healthCheck': { ok: boolean; latencyMs?: number; ip?: string; error?: string };
  'proxy.bulkImport': { imported: number; errors: string[] };
  'proxyPool.list': ProxyPool[];
  'proxyPool.create': ProxyPool;
  'proxyPool.update': ProxyPool;
  'proxyPool.delete': { id: string };
  'vault.status': { initialized: boolean; unlocked: boolean; autoLockMinutes: number };
  'vault.initialize': { ok: true };
  'vault.unlock': { ok: true };
  'vault.lock': { ok: true };
  'vault.changeMasterPassword': { ok: true };
  'vault.export': import('../background/vault').VaultExport;
  'vault.import': { imported: number };
  'fingerprint.list': FingerprintProfile[];
  'fingerprint.createCustom': FingerprintProfile;
  'fingerprint.randomFromPreset': FingerprintProfile;
  'fingerprint.update': FingerprintProfile;
  'fingerprint.delete': { id: string };
  'snapshot.list': Snapshot[];
  'snapshot.capture': Snapshot;
  'snapshot.restore': { origins: number };
  'snapshot.delete': { id: string };
  'snapshot.diff': import('../background/snapshot-engine').SnapshotDiff;
  'cookie.list': Array<SnapshotCookie & { storeId: string }>;
  'cookie.set': { ok: true };
  'cookie.remove': { ok: true };
  'cookie.importNetscape': { imported: number; errors: string[] };
  'cookie.importJson': { imported: number; errors: string[] };
  'cookie.exportNetscape': string;
  'cookie.exportJson': string;
  'autoRule.list': AutoRule[];
  'autoRule.create': AutoRule;
  'autoRule.update': AutoRule;
  'autoRule.delete': { id: string };
  'autoRule.test': { matches: boolean };
  'vault.listEntries': Array<Omit<import('./types').VaultEntry, 'cipher' | 'iv'>>;
  'vault.addEntry': { id: string };
  'vault.deleteEntry': { id: string };
  'vault.getSecret': { secret: string };
  'vault.totpCode': { code: string };
  'vault.setAutoLock': { ok: true };
  'lock.unlock': { ok: true };
  'lock.relock': { ok: true };
  'lock.setPin': { ok: true };
  'lock.status': { isLocked: boolean; isUnlockedThisSession: boolean; hasPin: boolean };
  'autofill.match': Array<{
    id: string;
    kind: 'password' | 'totp';
    label: string;
    origin: string;
    scope: 'global' | 'container';
  }>;
  'autofill.getSecret': { secret: string; kind: 'password' | 'totp' | 'note' | 'proxy-credential' };
  'proxy.scheduleHealth': { ok: true };
  'proxy.runScheduledHealth': { checked: number; failed: number; disabled: number };
  'proxy.setEnabled': { ok: true };
  'settings.getPrivacy': { telemetryOptIn: boolean };
  'settings.setTelemetryOptIn': { ok: true };
  'settings.exportDebugLogs': string;
  'snapshot.prune': { deleted: number };
  'snapshot.pruneAll': { deleted: number };
  'backup.exportPlain': import('../background/backup-manager').BackupBundle;
  'backup.exportEncrypted': import('../background/backup-manager').BackupBundle;
  'backup.import': { restored: number };
  'sync.status': import('../background/sync-engine').SyncStatus;
  'sync.connect': { connected: true };
  'sync.disconnect': { ok: true };
  'sync.now': { merged: number; conflict?: 'password-mismatch' };
  'sync.setIncludeSnapshots': { ok: true };
  'sync.resolveConflict': { ok: true };
};

export type CommandResult<T extends CommandType> =
  | { ok: true; data: ResultMap[T] }
  | { ok: false; error: string; code: ErrorCode };

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERMISSION_DENIED'
  | 'BROWSER_ERROR'
  | 'INTERNAL';

/** UI helper. Throws on `ok: false`; callers can wrap in try/catch or use `tryInvoke`. */
export async function invoke<C extends Command>(cmd: C): Promise<ResultMap[C['type']]> {
  const res = (await browser.runtime.sendMessage(cmd)) as CommandResult<C['type']>;
  if (!res || typeof res !== 'object') {
    throw new Error(`Empty response for ${cmd.type}`);
  }
  if (!res.ok) throw new InvokeError(cmd.type, res.code, res.error);
  return res.data;
}

export async function tryInvoke<C extends Command>(cmd: C): Promise<CommandResult<C['type']>> {
  try {
    const data = await invoke(cmd);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof InvokeError) {
      return { ok: false, error: err.message, code: err.code };
    }
    return { ok: false, error: String(err), code: 'INTERNAL' };
  }
}

export class InvokeError extends Error {
  constructor(
    readonly cmdType: CommandType,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InvokeError';
  }
}

/* ---------- BG → UI broadcasts (state.* events) ---------- */

export type Broadcast =
  | { type: 'state.containers' }
  | { type: 'state.workspaces' }
  | { type: 'state.templates' }
  | { type: 'state.proxies' }
  | { type: 'state.fingerprints' }
  | { type: 'state.snapshots' }
  | { type: 'state.autoRules' }
  | { type: 'state.vault' }
  | { type: 'state.tabs' }
  | { type: 'state.locks' }
  | { type: 'state.privacy' }
  | { type: 'state.sync' };

export async function broadcast(event: Broadcast): Promise<void> {
  // sendMessage with no specific recipient reaches all extension pages.
  // Best-effort; ignore "no listeners" errors.
  try {
    await browser.runtime.sendMessage({ __broadcast: true, ...event });
  } catch {
    /* no listeners — fine */
  }
}

export function onBroadcast(handler: (event: Broadcast) => void): () => void {
  const listener = (msg: unknown) => {
    if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).__broadcast === true) {
      const { __broadcast: _drop, ...rest } = msg as { __broadcast: true } & Broadcast;
      void _drop;
      handler(rest as Broadcast);
    }
    return undefined;
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
