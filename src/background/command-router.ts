/**
 * CommandRouter — single `runtime.onMessage` handler dispatching to managers.
 *
 * Validates payloads with Zod schemas before invoking handlers. Returns a
 * uniform `CommandResult` shape so UI callers always know the failure mode.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import {
  type Command,
  type CommandResult,
  type CommandType,
  type ErrorCode,
  broadcast,
} from '@shared/messaging';
import {
  autoRuleInputSchema,
  bulkCreateInputSchema,
  bulkOpenUrlInputSchema,
  createContainerInputSchema,
  proxyImportLineSchema,
  proxyInputSchema,
  proxyPoolInputSchema,
  templateInputSchema,
  updateContainerInputSchema,
  workspaceInputSchema,
} from '@shared/schemas';
import { totp } from '@shared/totp';
import { autoRuleEngine } from './auto-rule-engine';
import { autoSnapshotEngine } from './auto-snapshot';
import { autofillResolver } from './autofill-resolver';
import { backupManager } from './backup-manager';
import { containerManager } from './container-manager';
import { cookieManager } from './cookie-manager';
import { fingerprintManager } from './fingerprint-engine';
import { lockManager } from './lock-manager';
import { macImporter } from './mac-importer';
import { privacy } from './privacy';
import { proxyEngine } from './proxy-engine';
import { proxyManager } from './proxy-manager';
import { snapshotEngine } from './snapshot-engine';
import { templateManager } from './template-manager';
import { type VaultExport, vault } from './vault';
import { webRtcEngine } from './webrtc-engine';
import { workspaceManager } from './workspace-manager';

type Handler<T extends CommandType> = (
  cmd: Extract<Command, { type: T }>,
  sender: MessageSender,
) => Promise<CommandResult<T>['ok'] extends true ? unknown : never> | Promise<unknown>;

interface MessageSender {
  tab?: { id?: number; cookieStoreId?: string; url?: string };
  url?: string;
  origin?: string;
}

export class CommandRouter {
  private readonly handlers = new Map<CommandType, Handler<CommandType>>();

  constructor() {
    this.register();
  }

  attach(): void {
    browser.runtime.onMessage.addListener((msg: unknown, sender: unknown) => {
      // Ignore broadcasts (those have __broadcast: true) — UI-side only.
      if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).__broadcast) {
        return undefined;
      }
      if (!isCommand(msg)) return undefined;
      return this.dispatch(msg, sender as MessageSender);
    });
  }

  private register(): void {
    // Containers
    this.add('container.list', async () => containerManager.list());
    this.add('container.create', async (cmd) => {
      const input = createContainerInputSchema.parse(cmd.payload);
      const view = await containerManager.create(input);
      void broadcast({ type: 'state.containers' });
      return view;
    });
    this.add('container.update', async (cmd) => {
      const input = updateContainerInputSchema.parse(cmd.payload);
      const view = await containerManager.update(input);
      void broadcast({ type: 'state.containers' });
      return view;
    });
    this.add('container.delete', async (cmd) => {
      const result = await containerManager.delete(cmd.payload.cookieStoreId);
      void broadcast({ type: 'state.containers' });
      return result;
    });
    this.add('container.deleteRestore', async (cmd) => {
      const view = await containerManager.restoreDeleted(cmd.payload.cookieStoreId);
      void broadcast({ type: 'state.containers' });
      return view;
    });
    this.add('container.bulkCreate', async (cmd) => {
      const input = bulkCreateInputSchema.parse(cmd.payload);
      const views = await containerManager.bulkCreate(input);
      void broadcast({ type: 'state.containers' });
      return views;
    });
    this.add('container.bulkOpenUrl', async (cmd) => {
      const input = bulkOpenUrlInputSchema.parse(cmd.payload);
      return containerManager.bulkOpenUrl(input);
    });
    this.add('container.openDefault', async (cmd) => {
      return containerManager.openDefault(cmd.payload.cookieStoreId, {
        newWindow: cmd.payload.newWindow,
      });
    });
    this.add('container.setLocked', async (cmd) => {
      const view = await containerManager.setLocked(cmd.payload.cookieStoreId, cmd.payload.locked);
      void broadcast({ type: 'state.containers' });
      return view;
    });
    this.add('container.lockAll', async () => {
      const r = await containerManager.lockAll();
      void broadcast({ type: 'state.containers' });
      return r;
    });
    this.add('container.bulkDelete', async (cmd) => {
      const r = await containerManager.bulkDelete(cmd.payload.ids);
      void broadcast({ type: 'state.containers' });
      return r;
    });
    this.add('container.bulkSetLocked', async (cmd) => {
      const r = await containerManager.bulkSetLocked(cmd.payload.ids, cmd.payload.locked);
      void broadcast({ type: 'state.containers' });
      return r;
    });
    this.add('container.bulkSetWorkspace', async (cmd) => {
      const r = await containerManager.bulkSetWorkspace(cmd.payload.ids, cmd.payload.workspaceId);
      void broadcast({ type: 'state.containers' });
      return r;
    });
    this.add('container.bulkAddTags', async (cmd) => {
      const r = await containerManager.bulkAddTags(cmd.payload.ids, cmd.payload.tags);
      void broadcast({ type: 'state.containers' });
      return r;
    });
    this.add('container.bulkRemoveTags', async (cmd) => {
      const r = await containerManager.bulkRemoveTags(cmd.payload.ids, cmd.payload.tags);
      void broadcast({ type: 'state.containers' });
      return r;
    });
    this.add('container.bulkSetProxy', async (cmd) => {
      const r = await containerManager.bulkSetProxy(cmd.payload.ids, cmd.payload.proxyId);
      void broadcast({ type: 'state.containers' });
      return r;
    });
    this.add('container.bulkSetFingerprint', async (cmd) => {
      const r = await containerManager.bulkSetFingerprint(
        cmd.payload.ids,
        cmd.payload.fingerprintId,
      );
      void broadcast({ type: 'state.containers' });
      return r;
    });
    this.add('container.bulkHibernate', async (cmd) =>
      containerManager.bulkHibernate(cmd.payload.ids),
    );
    this.add('container.bulkOpenDefault', async (cmd) =>
      containerManager.bulkOpenDefault(cmd.payload.ids, {
        newWindow: cmd.payload.newWindow,
        staggerMs: cmd.payload.staggerMs,
      }),
    );

    // Workspaces
    this.add('workspace.list', async () => workspaceManager.list());
    this.add('workspace.create', async (cmd) => {
      const input = workspaceInputSchema.parse(cmd.payload);
      const ws = await workspaceManager.create(input);
      void broadcast({ type: 'state.workspaces' });
      return ws;
    });
    this.add('workspace.update', async (cmd) => {
      const { id, ...patch } = cmd.payload;
      const ws = await workspaceManager.update(id, patch);
      void broadcast({ type: 'state.workspaces' });
      return ws;
    });
    this.add('workspace.delete', async (cmd) => {
      const result = await workspaceManager.delete(cmd.payload.id, cmd.payload.orphanContainers);
      void broadcast({ type: 'state.workspaces' });
      void broadcast({ type: 'state.containers' });
      return result;
    });
    this.add('workspace.openAll', async (cmd) => workspaceManager.openAll(cmd.payload.id));
    this.add('workspace.hibernate', async (cmd) => workspaceManager.hibernate(cmd.payload.id));

    // Templates
    this.add('template.list', async () => templateManager.list());
    this.add('template.create', async (cmd) => {
      const input = templateInputSchema.parse(cmd.payload);
      const tpl = await templateManager.create(input);
      void broadcast({ type: 'state.templates' });
      return tpl;
    });
    this.add('template.update', async (cmd) => {
      const { id, ...patch } = cmd.payload;
      const tpl = await templateManager.update(id, patch);
      void broadcast({ type: 'state.templates' });
      return tpl;
    });
    this.add('template.delete', async (cmd) => {
      const result = await templateManager.delete(cmd.payload.id);
      void broadcast({ type: 'state.templates' });
      return result;
    });
    this.add('template.apply', async (cmd) => {
      const view = await templateManager.apply(cmd.payload.id, cmd.payload.cookieStoreId);
      void broadcast({ type: 'state.containers' });
      return view;
    });

    // Meta KV (settings, onboarding flags, etc.)
    this.add('meta.get', async (cmd) => {
      const row = await getDb().meta.get(cmd.payload.key);
      return row?.value ?? null;
    });
    this.add('meta.set', async (cmd) => {
      await getDb().meta.put({ key: cmd.payload.key, value: cmd.payload.value });
      return { key: cmd.payload.key };
    });

    // MAC migration
    this.add('mac.detect', async () => macImporter.detect());
    this.add('mac.import', async () => {
      const r = await macImporter.import();
      void broadcast({ type: 'state.containers' });
      void broadcast({ type: 'state.workspaces' });
      return r;
    });

    // Proxy
    this.add('proxy.list', async () => proxyManager.list());
    this.add('proxy.create', async (cmd) => {
      const input = proxyInputSchema.parse(cmd.payload);
      const p = await proxyManager.create(input);
      void broadcast({ type: 'state.proxies' });
      return p;
    });
    this.add('proxy.update', async (cmd) => {
      const { id, ...patch } = cmd.payload;
      const p = await proxyManager.update(id, patch);
      void broadcast({ type: 'state.proxies' });
      return p;
    });
    this.add('proxy.delete', async (cmd) => {
      const r = await proxyManager.delete(cmd.payload.id);
      void broadcast({ type: 'state.proxies' });
      return r;
    });
    this.add('proxy.healthCheck', async (cmd) => {
      return proxyEngine.healthCheck(cmd.payload.id, cmd.payload.endpoint);
    });
    this.add('proxy.bulkImport', async (cmd) => {
      const input = proxyImportLineSchema.parse(cmd.payload);
      const r = await proxyManager.bulkImport(input);
      void broadcast({ type: 'state.proxies' });
      return r;
    });
    this.add('proxyPool.list', async () => proxyManager.listPools());
    this.add('proxyPool.create', async (cmd) => {
      const input = proxyPoolInputSchema.parse(cmd.payload);
      const p = await proxyManager.createPool(input);
      void broadcast({ type: 'state.proxies' });
      return p;
    });
    this.add('proxyPool.update', async (cmd) => {
      const { id, ...patch } = cmd.payload;
      const p = await proxyManager.updatePool(id, patch);
      void broadcast({ type: 'state.proxies' });
      return p;
    });
    this.add('proxyPool.delete', async (cmd) => {
      const r = await proxyManager.deletePool(cmd.payload.id);
      void broadcast({ type: 'state.proxies' });
      return r;
    });

    // Vault
    this.add('vault.status', async () => vault.status());
    this.add('vault.initialize', async (cmd) => {
      await vault.initialize(cmd.payload.password);
      await vault.syncUnlockedHint();
      void broadcast({ type: 'state.vault' });
      return { ok: true as const };
    });
    this.add('vault.unlock', async (cmd) => {
      await vault.unlock(cmd.payload.password);
      await vault.syncUnlockedHint();
      void broadcast({ type: 'state.vault' });
      return { ok: true as const };
    });
    this.add('vault.lock', async () => {
      vault.lock();
      proxyEngine.invalidate();
      await lockManager.relockAll();
      await vault.syncUnlockedHint();
      void broadcast({ type: 'state.vault' });
      void broadcast({ type: 'state.locks' });
      return { ok: true as const };
    });
    this.add('vault.changeMasterPassword', async (cmd) => {
      await vault.changeMasterPassword(cmd.payload.newPassword);
      void broadcast({ type: 'state.vault' });
      return { ok: true as const };
    });
    this.add('vault.export', async () => vault.export());
    this.add('vault.import', async (cmd) => {
      const r = await vault.import(cmd.payload.envelope as VaultExport, cmd.payload.password);
      void broadcast({ type: 'state.vault' });
      return r;
    });

    // Fingerprint
    this.add('fingerprint.list', async () => fingerprintManager.list());
    this.add('fingerprint.createCustom', async (cmd) => {
      const fp = await fingerprintManager.createCustom(cmd.payload);
      void broadcast({ type: 'state.fingerprints' });
      await webRtcEngine.apply();
      return fp;
    });
    this.add('fingerprint.randomFromPreset', async (cmd) => {
      const fp = await fingerprintManager.randomFromPreset(cmd.payload.presetKey);
      void broadcast({ type: 'state.fingerprints' });
      return fp;
    });
    this.add('fingerprint.update', async (cmd) => {
      const { id, ...patch } = cmd.payload;
      const fp = await fingerprintManager.update(id, patch);
      void broadcast({ type: 'state.fingerprints' });
      await webRtcEngine.apply();
      return fp;
    });
    this.add('fingerprint.delete', async (cmd) => {
      const r = await fingerprintManager.delete(cmd.payload.id);
      void broadcast({ type: 'state.fingerprints' });
      void broadcast({ type: 'state.containers' });
      await webRtcEngine.apply();
      return r;
    });

    // Snapshots
    this.add('snapshot.list', async (cmd) => snapshotEngine.list(cmd.payload?.containerId));
    this.add('snapshot.capture', async (cmd) => {
      const snap = await snapshotEngine.capture(cmd.payload.containerId, cmd.payload.label);
      void broadcast({ type: 'state.snapshots' });
      return snap;
    });
    this.add('snapshot.restore', async (cmd) => {
      const r = await snapshotEngine.restore(cmd.payload.snapshotId);
      return r;
    });
    this.add('snapshot.delete', async (cmd) => {
      const r = await snapshotEngine.delete(cmd.payload.id);
      void broadcast({ type: 'state.snapshots' });
      return r;
    });
    this.add('snapshot.diff', async (cmd) =>
      snapshotEngine.diff(cmd.payload.beforeId, cmd.payload.afterId),
    );

    // Cookies
    this.add('cookie.list', async (cmd) =>
      cookieManager.list(cmd.payload.storeId, cmd.payload.url),
    );
    this.add('cookie.set', async (cmd) => {
      await cookieManager.set(cmd.payload.storeId, cmd.payload.cookie);
      return { ok: true as const };
    });
    this.add('cookie.remove', async (cmd) => {
      await cookieManager.remove(
        cmd.payload.storeId,
        cmd.payload.name,
        cmd.payload.domain,
        cmd.payload.path,
        cmd.payload.secure,
      );
      return { ok: true as const };
    });
    this.add('cookie.importNetscape', async (cmd) =>
      cookieManager.importNetscape(cmd.payload.storeId, cmd.payload.text),
    );
    this.add('cookie.importJson', async (cmd) =>
      cookieManager.importJson(cmd.payload.storeId, cmd.payload.text),
    );
    this.add('cookie.exportNetscape', async (cmd) =>
      cookieManager.exportNetscape(cmd.payload.storeId, cmd.payload.url),
    );
    this.add('cookie.exportJson', async (cmd) =>
      cookieManager.exportJson(cmd.payload.storeId, cmd.payload.url),
    );

    // Auto-rules
    this.add('autoRule.list', async () => autoRuleEngine.list());
    this.add('autoRule.create', async (cmd) => {
      const input = autoRuleInputSchema.parse(cmd.payload);
      const r = await autoRuleEngine.create(input);
      void broadcast({ type: 'state.autoRules' });
      return r;
    });
    this.add('autoRule.update', async (cmd) => {
      const { id, ...patch } = cmd.payload;
      const r = await autoRuleEngine.update(id, patch);
      void broadcast({ type: 'state.autoRules' });
      return r;
    });
    this.add('autoRule.delete', async (cmd) => {
      const r = await autoRuleEngine.delete(cmd.payload.id);
      void broadcast({ type: 'state.autoRules' });
      return r;
    });
    this.add('autoRule.test', async (cmd) => {
      const input = autoRuleInputSchema.parse(cmd.payload);
      // Build a temporary AutoRule shape with placeholders for non-input fields.
      const tempRule = {
        ...input,
        id: 'temp',
        order: 0,
        createdAt: 0,
      };
      return { matches: autoRuleEngine.matchOne(tempRule, cmd.payload.url) };
    });

    // Vault entries (M7)
    this.add('vault.listEntries', async () => vault.list());
    this.add('vault.addEntry', async (cmd) => {
      const id = await vault.addEntry(cmd.payload);
      void broadcast({ type: 'state.vault' });
      return { id };
    });
    this.add('vault.deleteEntry', async (cmd) => {
      await vault.deleteEntry(cmd.payload.id);
      void broadcast({ type: 'state.vault' });
      return { id: cmd.payload.id };
    });
    this.add('vault.getSecret', async (cmd) => {
      const secret = await vault.getSecret(cmd.payload.id);
      return { secret };
    });
    this.add('vault.totpCode', async (cmd) => {
      const secret = await vault.getSecret(cmd.payload.id);
      const code = await totp(secret);
      return { code };
    });
    this.add('vault.setAutoLock', async (cmd) => {
      vault.setAutoLockMinutes(cmd.payload.minutes);
      return { ok: true as const };
    });

    // Lock manager (PIN + per-container session unlock)
    this.add('lock.unlock', async (cmd) => {
      await lockManager.unlock(cmd.payload.cookieStoreId, {
        pin: cmd.payload.pin,
        masterPassword: cmd.payload.masterPassword,
      });
      void broadcast({ type: 'state.locks' });
      return { ok: true as const };
    });
    this.add('lock.relock', async (cmd) => {
      await lockManager.relock(cmd.payload.cookieStoreId);
      void broadcast({ type: 'state.locks' });
      return { ok: true as const };
    });
    this.add('lock.setPin', async (cmd) => {
      await lockManager.setPin(cmd.payload.cookieStoreId, cmd.payload.pin);
      void broadcast({ type: 'state.containers' });
      return { ok: true as const };
    });
    this.add('lock.status', async (cmd) => {
      const ext = await getDb().containers.get(cmd.payload.cookieStoreId);
      return {
        isLocked: ext?.isLocked === true,
        isUnlockedThisSession: lockManager.isUnlockedInSession(cmd.payload.cookieStoreId),
        hasPin: !!ext?.lockPinHash,
      };
    });

    // Autofill (called by content script)
    this.add('autofill.match', async (cmd, sender) => {
      const cookieStoreId = sender.tab?.cookieStoreId ?? null;
      if (!cookieStoreId) return [];
      // Honor lock: a locked-but-not-unlocked container reveals nothing.
      const ext = await getDb().containers.get(cookieStoreId);
      if (lockManager.isEffectivelyLocked(ext)) return [];
      return autofillResolver.match(cookieStoreId, cmd.payload.origin);
    });
    this.add('autofill.getSecret', async (cmd, sender) => {
      const cookieStoreId = sender.tab?.cookieStoreId ?? '';
      if (!cookieStoreId) throw new Error('not a tab request');
      const ext = await getDb().containers.get(cookieStoreId);
      if (lockManager.isEffectivelyLocked(ext)) throw new Error('container is locked');
      const r = await autofillResolver.getSecretFor(
        cmd.payload.id,
        cookieStoreId,
        cmd.payload.origin,
      );
      // For TOTP we generate the current code so the script never sees the
      // long-term shared secret.
      if (r.kind === 'totp') {
        const code = await totp(r.secret);
        return { secret: code, kind: r.kind };
      }
      return r;
    });

    // Proxy scheduling + enable/disable
    this.add('proxy.scheduleHealth', async (cmd) => {
      await getDb().meta.put({
        key: 'proxy.healthIntervalMinutes',
        value: cmd.payload.minutes,
      });
      await proxyEngine.ensureScheduled();
      return { ok: true as const };
    });
    this.add('proxy.runScheduledHealth', async () => proxyEngine.runScheduledHealth());
    this.add('proxy.setEnabled', async (cmd) => {
      const fresh = await getDb().proxies.get(cmd.payload.id);
      if (!fresh) throw new Error('proxy not found');
      await getDb().proxies.update(cmd.payload.id, {
        disabled: !cmd.payload.enabled,
        consecutiveFails: cmd.payload.enabled ? 0 : fresh.consecutiveFails,
      });
      proxyEngine.invalidate();
      void broadcast({ type: 'state.proxies' });
      return { ok: true as const };
    });

    // Privacy / settings
    this.add('settings.getPrivacy', async () => privacy.get());
    this.add('settings.setTelemetryOptIn', async (cmd) => {
      await privacy.setTelemetry(cmd.payload.enabled);
      void broadcast({ type: 'state.privacy' });
      return { ok: true as const };
    });
    this.add('settings.exportDebugLogs', async () => privacy.exportDebugLogs());

    // Snapshot retention pruning
    this.add('snapshot.prune', async (cmd) => autoSnapshotEngine.prune(cmd.payload.containerId));
    this.add('snapshot.pruneAll', async () => autoSnapshotEngine.pruneAll());

    // Full-data backup
    this.add('backup.exportPlain', async () => backupManager.exportPlain());
    this.add('backup.exportEncrypted', async (cmd) =>
      backupManager.exportEncrypted(cmd.payload.password),
    );
    this.add('backup.import', async (cmd) => {
      const r = await backupManager.import(cmd.payload.bundle, cmd.payload.password);
      // Broadcast every store so the UI re-fetches.
      void broadcast({ type: 'state.containers' });
      void broadcast({ type: 'state.workspaces' });
      void broadcast({ type: 'state.templates' });
      void broadcast({ type: 'state.proxies' });
      void broadcast({ type: 'state.fingerprints' });
      void broadcast({ type: 'state.snapshots' });
      void broadcast({ type: 'state.autoRules' });
      void broadcast({ type: 'state.vault' });
      void broadcast({ type: 'state.locks' });
      return r;
    });
  }

  private add<T extends CommandType>(
    type: T,
    handler: (cmd: Extract<Command, { type: T }>, sender: MessageSender) => Promise<unknown>,
  ): void {
    this.handlers.set(type, handler as Handler<CommandType>);
  }

  private async dispatch(cmd: Command, sender: MessageSender): Promise<CommandResult<CommandType>> {
    const handler = this.handlers.get(cmd.type);
    if (!handler) {
      return { ok: false, error: `unknown command: ${cmd.type}`, code: 'INVALID_INPUT' };
    }
    try {
      const data = await handler(cmd, sender);
      return { ok: true, data: data as never };
    } catch (err) {
      const { message, code } = describeError(err);
      console.error(`[contabox] ${cmd.type} failed:`, err);
      return { ok: false, error: message, code };
    }
  }
}

function isCommand(value: unknown): value is Command {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function describeError(err: unknown): { message: string; code: ErrorCode } {
  if (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError') {
    return { message: (err as Error).message, code: 'INVALID_INPUT' };
  }
  if (err instanceof Error) {
    if (/not found/i.test(err.message)) return { message: err.message, code: 'NOT_FOUND' };
    return { message: err.message, code: 'INTERNAL' };
  }
  return { message: String(err), code: 'INTERNAL' };
}

export const commandRouter = new CommandRouter();
