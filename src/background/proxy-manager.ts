/**
 * ProxyManager — CRUD over `Proxy` and `ProxyPool` rows in IndexedDB.
 *
 * Wraps password storage through the Vault: when a proxy is saved with a
 * password, the password goes into a vault entry and the proxy row holds
 * only `passwordRef` (vault entry id).
 */
import { getDb } from '@shared/db';
import type { ProxyImportLineInput, ProxyInput, ProxyPoolInput } from '@shared/schemas';
import type { Proxy, ProxyPool, ProxyType } from '@shared/types';
import { now, uuid } from '@shared/utils';
import { proxyEngine } from './proxy-engine';
import { vault } from './vault';

export class ProxyManager {
  list(): Promise<Proxy[]> {
    return getDb().proxies.toArray();
  }

  listPools(): Promise<ProxyPool[]> {
    return getDb().proxyPools.toArray();
  }

  async create(input: ProxyInput): Promise<Proxy> {
    let passwordRef: string | undefined;
    if (input.password && input.username && vault.isUnlocked()) {
      passwordRef = await vault.addEntry({
        scope: 'global',
        origin: `${input.type}://${input.host}:${input.port}`,
        kind: 'proxy-credential',
        label: `${input.label} (${input.username})`,
        secret: input.password,
      });
    }

    const row: Proxy = {
      id: uuid(),
      label: input.label,
      type: input.type,
      host: input.host,
      port: input.port,
      username: input.username,
      passwordRef,
      poolId: input.poolId,
      createdAt: now(),
    };
    await getDb().proxies.put(row);
    proxyEngine.invalidate();
    return row;
  }

  async update(id: string, patch: Partial<ProxyInput>): Promise<Proxy> {
    const existing = await getDb().proxies.get(id);
    if (!existing) throw new Error('proxy not found');

    let passwordRef = existing.passwordRef;
    if (patch.password !== undefined) {
      if (vault.isUnlocked() && patch.password) {
        if (passwordRef) {
          await vault.updateEntry(passwordRef, patch.password);
        } else {
          passwordRef = await vault.addEntry({
            scope: 'global',
            origin: `${existing.type}://${existing.host}:${existing.port}`,
            kind: 'proxy-credential',
            label: `${existing.label}`,
            secret: patch.password,
          });
        }
      } else if (!patch.password && passwordRef) {
        await vault.deleteEntry(passwordRef);
        passwordRef = undefined;
      }
    }

    const next: Proxy = {
      ...existing,
      label: patch.label ?? existing.label,
      type: (patch.type ?? existing.type) as ProxyType,
      host: patch.host ?? existing.host,
      port: patch.port ?? existing.port,
      username: patch.username ?? existing.username,
      poolId: patch.poolId ?? existing.poolId,
      passwordRef,
    };
    await getDb().proxies.put(next);
    proxyEngine.invalidate();
    return next;
  }

  async delete(id: string): Promise<{ id: string }> {
    const existing = await getDb().proxies.get(id);
    if (existing?.passwordRef) {
      try {
        await vault.deleteEntry(existing.passwordRef);
      } catch {
        /* ignore */
      }
    }
    await getDb().proxies.delete(id);

    // Also unassign from any container that pointed here.
    await getDb()
      .containers.where('templateId')
      .equals(id)
      .modify((c) => {
        if (c.proxyId === id) c.proxyId = undefined;
      });

    proxyEngine.invalidate();
    return { id };
  }

  async createPool(input: ProxyPoolInput): Promise<ProxyPool> {
    const pool: ProxyPool = {
      id: uuid(),
      name: input.name,
      proxyIds: input.proxyIds,
      rotation: input.rotation,
      cooldownSec: input.cooldownSec,
      createdAt: now(),
    };
    await getDb().proxyPools.put(pool);
    return pool;
  }

  async updatePool(id: string, patch: Partial<ProxyPoolInput>): Promise<ProxyPool> {
    const existing = await getDb().proxyPools.get(id);
    if (!existing) throw new Error('pool not found');
    const next: ProxyPool = {
      ...existing,
      name: patch.name ?? existing.name,
      proxyIds: patch.proxyIds ?? existing.proxyIds,
      rotation: patch.rotation ?? existing.rotation,
      cooldownSec: patch.cooldownSec ?? existing.cooldownSec,
    };
    await getDb().proxyPools.put(next);
    return next;
  }

  async deletePool(id: string): Promise<{ id: string }> {
    await getDb().proxyPools.delete(id);
    return { id };
  }

  /**
   * Bulk import from `host:port[:user:pass]` lines, one per row.
   * Lines starting with `#` are ignored.
   */
  async bulkImport(input: ProxyImportLineInput): Promise<{ imported: number; errors: string[] }> {
    const lines = input.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    const errors: string[] = [];
    let imported = 0;

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length < 2) {
        errors.push(`malformed: ${line}`);
        continue;
      }
      const [host, portStr, username, password] = parts;
      const port = Number(portStr);
      if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
        errors.push(`malformed: ${line}`);
        continue;
      }
      try {
        await this.create({
          label: `${host}:${port}`,
          type: input.defaultType,
          host,
          port,
          username: username || undefined,
          password: password || undefined,
        });
        imported++;
      } catch (err) {
        errors.push(`${line}: ${String(err)}`);
      }
    }
    return { imported, errors };
  }
}

export const proxyManager = new ProxyManager();
