/**
 * TemplateManager — reusable container presets.
 *
 * A template captures display defaults (name pattern + color + icon) plus
 * optional engine refs (proxy, fingerprint) and a default URL. Applying a
 * template overwrites those fields on a target container; bulk-create uses
 * the template as the seed for N new containers.
 */
import { getDb } from '@shared/db';
import type { TemplateInput } from '@shared/schemas';
import type { ContainerView, Template } from '@shared/types';
import { now, uuid } from '@shared/utils';
import { containerManager } from './container-manager';

export class TemplateManager {
  list(): Promise<Template[]> {
    return getDb().templates.orderBy('createdAt').toArray();
  }

  async create(input: TemplateInput): Promise<Template> {
    const tpl: Template = {
      id: uuid(),
      name: input.name,
      containerSeed: input.containerSeed,
      proxyId: input.proxyId,
      fingerprintId: input.fingerprintId,
      defaultUrl: input.defaultUrl,
      notes: input.notes ?? '',
      createdAt: now(),
    };
    await getDb().templates.put(tpl);
    return tpl;
  }

  async update(id: string, patch: Partial<TemplateInput>): Promise<Template> {
    const existing = await getDb().templates.get(id);
    if (!existing) throw new Error('template not found');
    const next: Template = {
      ...existing,
      name: patch.name ?? existing.name,
      containerSeed: patch.containerSeed ?? existing.containerSeed,
      proxyId: patch.proxyId ?? existing.proxyId,
      fingerprintId: patch.fingerprintId ?? existing.fingerprintId,
      defaultUrl: patch.defaultUrl ?? existing.defaultUrl,
      notes: patch.notes ?? existing.notes,
    };
    await getDb().templates.put(next);
    return next;
  }

  async delete(id: string): Promise<{ id: string }> {
    await getDb().templates.delete(id);
    return { id };
  }

  /**
   * Apply a template's display defaults + engine refs to an existing
   * container. Does NOT rename using the pattern (that's a bulk-create
   * concern); name updates are explicit only.
   */
  async apply(templateId: string, cookieStoreId: string): Promise<ContainerView> {
    const tpl = await getDb().templates.get(templateId);
    if (!tpl) throw new Error('template not found');

    return containerManager.update({
      cookieStoreId,
      color: tpl.containerSeed.color,
      icon: tpl.containerSeed.icon,
      proxyId: tpl.proxyId ?? null,
      fingerprintId: tpl.fingerprintId ?? null,
      defaultUrl: tpl.defaultUrl ?? null,
    });
  }
}

export const templateManager = new TemplateManager();
