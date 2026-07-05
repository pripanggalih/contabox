/**
 * Stable string keys for rows in the `meta` Dexie table. Centralised so we
 * don't drift between background, UI, and tests on string literals.
 */

/** Set of cookieStoreIds whose container is currently unlocked in this session. */
export const META_LOCK_SESSION = 'lock.session';

/** Per-install vault salt + verifier blob (legacy keys retained in vault.ts). */
export const META_VAULT_SALT = 'vault.salt';
export const META_VAULT_VERIFIER = 'vault.verifier';

/** User opt-in for telemetry counters. Default: false. */
export const META_TELEMETRY_OPT_IN = 'privacy.telemetryOptIn';

/** Onboarding completion flag (used by the wizard). */
export const META_ONBOARDED = 'onboarded';

/**
 * Default retention (days) for auto-snapshots when a container has no override.
 * 0 = keep forever.
 */
export const META_AUTO_SNAPSHOT_RETENTION = 'autosnapshot.retentionDays';

/** Auto-lock minutes for the master vault. Persisted so the BG can restore it. */
export const META_VAULT_AUTOLOCK_MIN = 'vault.autoLockMinutes';

/** Threshold of consecutive failed proxy probes before auto-disable (default 3). */
export const META_PROXY_FAIL_THRESHOLD = 'proxy.failThreshold';

/** Scheduled-health-check interval in minutes (0 = disabled). Default 0. */
export const META_PROXY_HEALTH_INTERVAL_MIN = 'proxy.healthIntervalMinutes';
