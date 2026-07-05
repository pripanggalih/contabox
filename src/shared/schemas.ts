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

/** Lucide icon names are PascalCase identifiers, e.g. "Briefcase", "Plane". */
const customIconSchema = z
  .string()
  .regex(/^[A-Z][a-zA-Z0-9]*$/, 'must be a Lucide icon name')
  .max(64);

export const createContainerInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: containerColorSchema,
  icon: containerIconSchema,
  customColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'must be #RRGGBB')
    .optional(),
  customIcon: customIconSchema.optional(),
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
  customIcon: customIconSchema.nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  defaultUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
  isLocked: z.boolean().optional(),
  proxyId: z.string().nullable().optional(),
  fingerprintId: z.string().nullable().optional(),
  autoSnapshot: z.boolean().optional(),
  retentionDays: z.number().int().min(0).max(3650).nullable().optional(),
  snapshotIncludeIdb: z.boolean().optional(),
  proxyFailClosed: z.boolean().optional(),
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
  customIcon: customIconSchema.optional(),
  /** When true, every spawned container gets a fresh random hex color. */
  randomColor: z.boolean().default(false),
  /** When true, every spawned container gets a fresh random Lucide icon. */
  randomIcon: z.boolean().default(false),
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
  patternType: z.enum(['domain', 'substring', 'glob', 'regex']),
  containerId: z.string().min(1),
  enabled: z.boolean().default(true),
  action: z.enum(['open-in', 'redirect']).default('open-in'),
});
export type AutoRuleInput = z.infer<typeof autoRuleInputSchema>;

/* ---------- bounded primitives reused across mutating commands ---------- */

/** A selection of container/entity ids. Bounded to prevent CPU/storage DoS. */
export const idListSchema = z.array(z.string().min(1).max(200)).max(1000);
/** Free-form tags. Bounded count + length. */
export const tagListSchema = z.array(z.string().trim().min(1).max(64)).max(200);

/* ---------- vault ---------- */

const masterPasswordSchema = z.string().min(8).max(1024);
export const vaultPasswordSchema = z.object({ password: masterPasswordSchema });
export const vaultChangePasswordSchema = z.object({ newPassword: masterPasswordSchema });

export const vaultAddEntrySchema = z.object({
  scope: z.enum(['global', 'container']),
  containerId: z.string().max(200).optional(),
  origin: z.string().max(2000),
  kind: z.enum(['password', 'totp', 'note', 'proxy-credential']),
  label: z.string().max(200),
  secret: z.string().max(8192),
  totp: z
    .object({
      period: z.number().int().min(1).max(600),
      digits: z.number().int().min(4).max(10),
      algorithm: z.enum(['SHA-1', 'SHA-256', 'SHA-512']),
    })
    .optional(),
});
export type VaultAddEntryInput = z.infer<typeof vaultAddEntrySchema>;

/** Encrypted vault export envelope — validated before it touches the DB. */
const encryptedBlobSchema = z.object({ cipher: z.string().max(1_000_000), iv: z.string().max(64) });
const vaultEntrySchema = z.object({
  id: z.string().max(200),
  scope: z.enum(['global', 'container']),
  containerId: z.string().max(200).optional(),
  origin: z.string().max(2000),
  kind: z.enum(['password', 'totp', 'note', 'proxy-credential']),
  label: z.string().max(200),
  cipher: z.string().max(1_000_000),
  iv: z.string().max(64),
  totp: z
    .object({
      period: z.number().int().min(1).max(600),
      digits: z.number().int().min(4).max(10),
      algorithm: z.enum(['SHA-1', 'SHA-256', 'SHA-512']),
    })
    .optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export const vaultExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number(),
  salt: z.string().max(64),
  verifier: encryptedBlobSchema,
  entries: z.array(vaultEntrySchema).max(100_000),
});

/* ---------- meta KV ---------- */

/** Keys the UI is allowed to write via the generic `meta.set` command. Vault /
 *  lock keys are managed by dedicated commands and must never be settable
 *  through this path (overwriting `vault.verifier` would brick the vault). */
export const metaSetSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(128)
    .refine((k) => !/^(vault|lock)\./.test(k), 'protected meta namespace'),
  // Bound the serialized size to keep the store from being flooded.
  value: z.unknown().refine((v) => JSON.stringify(v ?? null).length <= 64_000, 'value too large'),
});

/* ---------- cookies ---------- */

export const cookieSchema = z.object({
  name: z.string().max(4096),
  value: z.string().max(8192),
  domain: z.string().max(253),
  path: z.string().max(2048),
  secure: z.boolean(),
  httpOnly: z.boolean(),
  sameSite: z.enum(['no_restriction', 'lax', 'strict']),
  expirationDate: z.number().optional(),
});

/* ---------- fingerprint ---------- */

const webRtcModeSchema = z.enum(['real', 'proxy', 'disabled']);
export const fingerprintProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.enum(['preset', 'custom', 'random']),
  ua: z.string().max(1024),
  canvas: z.object({ noise: z.number() }),
  webgl: z.object({ vendor: z.string().max(256), renderer: z.string().max(256) }),
  audio: z.object({ noise: z.number() }),
  screen: z.object({
    width: z.number().int().min(0).max(16384),
    height: z.number().int().min(0).max(16384),
    colorDepth: z.number().int().min(1).max(48),
  }),
  fonts: z.array(z.string().max(128)).max(500),
  timezone: z.string().max(64),
  language: z.string().max(64),
  hardwareConcurrency: z.number().int().min(1).max(1024),
  deviceMemory: z.number().min(0).max(1024),
  webrtcMode: webRtcModeSchema,
});
/** Partial patch for `fingerprint.update`. */
export const fingerprintProfilePatchSchema = fingerprintProfileInputSchema.partial();

/* ---------- full-data backup bundle ---------- */

// Rows are re-validated structurally (bounded arrays, object shapes) before a
// restore wipes and repopulates the DB. We keep per-row schemas permissive on
// non-security fields so a legitimate backup from a slightly different build
// still restores, but strict on vault rows and meta values.
const metaRowSchema = z.object({
  key: z.string().max(256),
  value: z.unknown().refine((v) => JSON.stringify(v ?? null).length <= 5_000_000, 'meta too large'),
});
const looseRow = z.object({}).passthrough();
const backupDataSchema = z.object({
  containers: z.array(looseRow).max(100_000),
  workspaces: z.array(looseRow).max(100_000),
  templates: z.array(looseRow).max(100_000),
  proxies: z.array(looseRow).max(100_000),
  proxyPools: z.array(looseRow).max(100_000),
  fingerprints: z.array(looseRow).max(100_000),
  snapshots: z.array(looseRow).max(100_000),
  rules: z.array(looseRow).max(100_000),
  vault: z.array(vaultEntrySchema).max(100_000),
  meta: z.array(metaRowSchema).max(100_000),
});
export type BackupData = z.infer<typeof backupDataSchema>;

export const backupBundleSchema = z.discriminatedUnion('encrypted', [
  backupDataSchema.extend({
    version: z.literal(1),
    exportedAt: z.number(),
    encrypted: z.literal(false),
  }),
  z.object({
    version: z.literal(1),
    exportedAt: z.number(),
    encrypted: z.literal(true),
    salt: z.string().max(64),
    payload: encryptedBlobSchema,
  }),
]);
/** Validate the decrypted inner payload of an encrypted bundle. */
export const backupDataSchemaExport = backupDataSchema;
