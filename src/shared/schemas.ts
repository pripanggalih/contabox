/**
 * Zod schemas — runtime validators for everything that crosses a trust
 * boundary (UI ↔ BG ↔ content scripts ↔ imports).
 *
 * Mirror types from `types.ts`; when types drift, schemas drift with them.
 */
import { z } from 'zod';

export const containerColorSchema = z.enum([
  'blue',
  'turquoise',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'toolbar',
]);

export const containerIconSchema = z.enum([
  'fingerprint',
  'briefcase',
  'dollar',
  'cart',
  'circle',
  'gift',
  'vacation',
  'food',
  'fruit',
  'pet',
  'tree',
  'chill',
  'fence',
]);

export const createContainerInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: containerColorSchema,
  icon: containerIconSchema,
  customColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'must be #RRGGBB')
    .optional(),
  workspaceId: z.string().optional(),
  templateId: z.string().optional(),
  defaultUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateContainerInput = z.infer<typeof createContainerInputSchema>;

export const updateContainerInputSchema = z.object({
  cookieStoreId: z.string(),
  name: z.string().trim().min(1).max(50).optional(),
  color: containerColorSchema.optional(),
  icon: containerIconSchema.optional(),
  customColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  workspaceId: z.string().nullable().optional(),
  defaultUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
  isLocked: z.boolean().optional(),
  proxyId: z.string().nullable().optional(),
  fingerprintId: z.string().nullable().optional(),
});
export type UpdateContainerInput = z.infer<typeof updateContainerInputSchema>;

export const bulkCreateInputSchema = z.object({
  count: z.number().int().min(1).max(500),
  namePattern: z.string().min(1).max(80),
  color: containerColorSchema,
  icon: containerIconSchema,
  customColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  /** When true, every spawned container gets a fresh random hex color. */
  randomColor: z.boolean().default(false),
  workspaceId: z.string().optional(),
  templateId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type BulkCreateInput = z.infer<typeof bulkCreateInputSchema>;

export const bulkOpenUrlInputSchema = z.object({
  url: z.string().url(),
  containerIds: z.array(z.string()).min(1),
  newWindow: z.boolean().default(false),
  staggerMs: z.number().int().min(0).max(60_000).default(0),
});
export type BulkOpenUrlInput = z.infer<typeof bulkOpenUrlInputSchema>;

export const workspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(8),
  defaultUrls: z.array(z.string().url()).optional(),
});
export type WorkspaceInput = z.infer<typeof workspaceInputSchema>;

export const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  containerSeed: z.object({
    namePattern: z.string().min(1).max(80),
    color: containerColorSchema,
    icon: containerIconSchema,
  }),
  proxyId: z.string().optional(),
  fingerprintId: z.string().optional(),
  defaultUrl: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

export const proxyTypeSchema = z.enum(['http', 'https', 'socks4', 'socks5']);

export const proxyInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  type: proxyTypeSchema,
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  poolId: z.string().optional(),
});
export type ProxyInput = z.infer<typeof proxyInputSchema>;

export const proxyPoolInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  proxyIds: z.array(z.string()).default([]),
  rotation: z.enum(['random', 'round-robin', 'sticky-per-session']),
  cooldownSec: z.number().int().min(0).max(86_400).default(0),
});
export type ProxyPoolInput = z.infer<typeof proxyPoolInputSchema>;

export const proxyImportLineSchema = z.object({
  text: z.string().min(1),
  defaultType: proxyTypeSchema.default('http'),
});
export type ProxyImportLineInput = z.infer<typeof proxyImportLineSchema>;

export const autoRuleInputSchema = z.object({
  pattern: z.string().min(1).max(2000),
  patternType: z.enum(['substring', 'glob', 'regex']),
  containerId: z.string().min(1),
  enabled: z.boolean().default(true),
  action: z.enum(['open-in', 'redirect']).default('open-in'),
});
export type AutoRuleInput = z.infer<typeof autoRuleInputSchema>;
