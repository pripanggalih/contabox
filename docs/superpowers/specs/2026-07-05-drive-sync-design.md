# Design: Cross-Device Sync via Google Drive

**Date:** 2026-07-05
**Status:** Approved (pending spec review)
**Topic:** Manual, zero-knowledge cross-device sync of Contabox data through the
user's own Google Drive.

## Problem

A user runs Contabox on Firefox across multiple PCs. Changes made on device A
(add/edit a container, vault entry, proxy, rule, etc.) should be transferable to
device B without manual file juggling, while preserving Contabox's core posture:
local-first, zero-knowledge, no telemetry, vault key never leaves background.

The existing `BackupManager` already produces an AES-GCM-encrypted bundle of all
Dexie tables keyed off the master password. The gap is: (1) getting that bundle
to another device automatically, and (2) merging rather than wholesale-replacing
so two devices can each make changes without data loss.

## Decisions (locked during brainstorming)

- **Transport:** the user's own Google Drive (`appDataFolder`). No self-hosted
  backend, no monthly cost, no maintenance. Google only ever sees ciphertext.
- **Trigger:** manual **Sync** button. No auto-debounce, no polling. A `dirty`
  flag drives a UI badge only.
- **Conflict handling:** per-item merge by `updatedAt` + tombstones. No wholesale
  last-write-wins — a two-device concurrent edit must not lose data.
- **Snapshots:** user toggle (include/exclude) in settings, default **OFF**,
  with a full explanation of the tradeoff.
- **UI:** a new "Sync" panel in Options (onboarding, connected-account info, blob
  size, snapshot toggle, Sync now, Disconnect) plus a Sync button in the sidebar
  ActionBar with a dirty badge.

## Non-goals (YAGNI)

- Auto debounce / polling / realtime push.
- Team sharing / RSA per-member key wrapping.
- Multi-file / chunked blob (single file until proven too large).
- Other providers (Dropbox / WebDAV) — Drive only; a transport abstraction can
  come later if a second provider is ever requested.

## Architecture

### New modules

| Module | Layer | Responsibility |
|---|---|---|
| `src/background/drive-client.ts` | bg | OAuth (`browser.identity.launchWebAuthFlow`) + Google Drive REST: create/read/update/metadata for a single file in `appDataFolder`. Dumb transport — never sees plaintext, never touches Dexie. |
| `src/background/sync-engine.ts` | bg | Orchestration: collect state → encrypt (reuse crypto) → download remote → merge → upload; manages `dirty` flag and `lastRevision`. Enforces vault-unlocked + `lock-manager`. |
| `src/shared/sync-merge.ts` | shared (pure) | Deterministic per-item merge of two bundles + tombstones. No I/O, fully unit-testable. |

### Reuse

- `BackupManager.collect()` / crypto (`deriveKey`, `encryptString`,
  `decryptString`, PBKDF2 600k, AES-GCM) — unchanged.
- The encrypted blob format is the existing `exportEncrypted` output, extended so
  every record carries `updatedAt` and tombstones ride alongside.

### New commands (`command-router.ts`, all Zod-validated)

- `sync.connect` — run OAuth, locate/create the Drive file, persist token.
- `sync.disconnect` — revoke/forget token + file id.
- `sync.push` — the Sync button. Two-way: collect → download remote → merge →
  upload → update revision → clear dirty.
- `sync.pull` — download + merge only (used internally; `push` calls the same
  merge path first). Exposed for a future "check for remote changes".
- `sync.status` — connected account, blob size, last-synced time, dirty flag,
  snapshot-toggle state.

## Data model

### Blob on Drive

`contabox-vault.enc` in Drive `appDataFolder` (hidden from the user's Drive UI,
inaccessible to other apps). Contents = existing encrypted bundle, with:

- Every synced record carries `updatedAt: number`.
- A `tombstones` array: `{ table, id, deletedAt }`.
- Snapshots included only when the snapshot toggle is ON.

Synced tables: containers, workspaces, templates, proxies, proxyPools,
fingerprints, rules, vault. Snapshots conditional. `meta` rows are **not** synced
as data except the vault identity rows needed to bootstrap (salt + verifier).

### Dexie migration v4 (additive, forward-only)

- Add `updatedAt: number` to `ContainerExt`, `Workspace`, `Template`, `Proxy`,
  `ProxyPool`, `FingerprintProfile`, `AutoRule`. Backfill `updatedAt = createdAt`
  in the `.upgrade()` block.
- `VaultEntry` already has `updatedAt` — no change.
- New table `tombstones` with keyPath `[table+id]` and index `deletedAt`.
- No columns removed, no keyPaths renamed, no store wiped — complies with the
  forward-only/additive migration rule.

### Delete becomes soft-tracked

Every code path that deletes a synced row must also write a tombstone
`{ table, id, deletedAt: now() }`. The row is still hard-deleted locally
(existing reads are unchanged — no `deletedAt` filtering needed on read paths);
the tombstone lives only in the separate `tombstones` table and is consulted
during merge. This keeps the blast radius off existing read/query code.

Writes (create/update) to synced tables must set `updatedAt = now()`. Centralize
in each manager's `create`/`update` rather than sprinkling call sites.

### New meta keys

- `sync.driveToken` — Google refresh token, **encrypted at rest** under the
  vault key (never stored plaintext).
- `sync.fileId` — Drive file id of the blob.
- `sync.lastRevision` — Drive `revisionId`/`headRevisionId` of the last blob this
  device successfully synced, to detect remote changes.
- `sync.includeSnapshots` — boolean toggle, default `false`.
- `sync.dirty` — boolean, set on any local write to a synced table, cleared on a
  successful push.

## Merge algorithm (`sync-merge.ts`)

Pure function: `merge(local: Bundle, remote: Bundle): Bundle`.

For each synced table:

1. Union all records from `local` and `remote` by `id`.
2. For an `id` present in both, keep the one with the greater `updatedAt`
   (ties → deterministic tiebreak on `id` to stay stable).
3. Union tombstones from both sides; for each `{table, id}` keep the greatest
   `deletedAt`.
4. Drop any record whose matching tombstone `deletedAt > record.updatedAt`
   (a delete newer than the latest edit wins; an edit newer than the delete
   resurrects the row — intentional).
5. Prune tombstones that are strictly older than the surviving record for the
   same id (housekeeping so tombstones don't grow unbounded).

The merged bundle is written back to Dexie (bulkPut survivors, delete tombstoned
ids) **and** re-uploaded so both sides converge to the same state.

## Flows

### Connect (per device)

1. User clicks "Connect Google Drive" in the Sync panel.
2. `browser.identity.launchWebAuthFlow` → Google OAuth consent (scope:
   `drive.appdata`).
3. Persist the refresh token, encrypted under the vault key, in
   `meta['sync.driveToken']`.
4. Look up an existing `contabox-vault.enc` in `appDataFolder`; create it if
   absent. Store its id in `meta['sync.fileId']`.

### Push (the Sync button)

Preconditions: Drive connected **and** vault unlocked (else the button is
disabled with a hint). Respect `lock-manager` throughout.

1. Collect local state, stamping `updatedAt`, gathering tombstones.
2. GET remote file metadata; if `revisionId === lastRevision`, the remote is
   unchanged — skip download and merge, just upload local (fast path). Otherwise
   download the remote blob and decrypt with the master password.
3. `merge(local, remote)`.
4. Write merged result back to Dexie.
5. Encrypt merged bundle, upload (PATCH) to Drive.
6. Store the new `revisionId` as `lastRevision`; clear `dirty`.

### Pull

Same as push steps 2–4 without the final upload. Internal for now; surfaced later
if a "remote changed" indicator is added.

### First-sync bootstrap (fresh device B)

The blob is AES-GCM-wrapped under device A's master password, and A's vault
entries use A's salt/verifier. So B must open the blob with the **same master
password** it was created under. On connect, B compares the blob's vault verifier
against its own local vault and lands in one of three cases:

1. **B's vault not yet initialized (fresh install):** adopt the blob's vault
   salt + verifier + entries. B becomes A's twin; the user unlocks with A's
   master password. No dialog beyond "enter the master password for this backup".

2. **B already initialized, same master password:** normal merge. Transparent.

3. **B already initialized, different master password:** the confusing case.
   Never show a raw "rejected" error. Instead present a plain-language
   **reconcile dialog** (see UI below) that names the situation and offers
   explicit, consequence-labelled choices. Nothing is overwritten until the user
   picks.

#### Reconcile dialog (case 3)

Title: *"This Google Drive already has Contabox data from another setup."*
Body: *"The backup on Drive uses a different master password than this device.
They can't be merged automatically because each is encrypted with its own
password. Choose how to continue:"*

- **Use the Drive data** *(recommended if this device is new-ish)* — "Enter the
  master password for the Drive backup. This device's current Contabox data will
  be replaced by the synced data." Before replacing, auto-offer an encrypted
  export of the local data (`backupManager.exportEncrypted`) so nothing is
  unrecoverable.
- **Push this device's data to Drive instead** — "Overwrite the Drive backup with
  this device's data. Other devices syncing from Drive will need to reconcile the
  same way." Confirm with a second explicit warning naming that it overwrites the
  other setup.
- **Cancel** — do nothing; leave both sides untouched. The device stays
  unconnected.

The dialog copy must spell out *what gets replaced* in each branch. No branch
loses data silently — the destructive branches either take a fresh export first
or require a second confirmation.

## UI

### Options — new "Sync" panel

- **Not connected:** "Connect Google Drive" button + short zero-knowledge
  explanation (Google stores only ciphertext; master password never leaves the
  device).
- **Connected:** account email, total blob size, "Last synced: <time>", a toggle
  **"Include snapshots (cookies)"** with the full tradeoff copy (moves live login
  sessions across devices, but the blob gets much larger and syncs slower;
  default off), **Sync now** button, **Disconnect** button.

### Sidebar — ActionBar

A Sync icon/button in the ActionBar footer. Shows a dot badge when `dirty`. Click
runs `sync.push`; a spinner shows while it runs. Disabled (with hint) when the
vault is locked or Drive is not connected.

## Security & edge cases

- Master password never reaches Drive; Google sees only ciphertext (zero
  knowledge preserved).
- Sync requires the vault unlocked; the button is disabled when locked. Every
  path respects `lock-manager` / `isEffectivelyLocked` — no cookie restore while
  locked.
- Drive refresh token stored encrypted under the vault key, never plaintext.
- Manifest additions: `identity` permission, host permission
  `https://www.googleapis.com/*`, and a Google OAuth client id (registered once
  by the maintainer in Google Cloud Console). No `eval` / remote code — AMO safe.
- Snapshot toggle defaults OFF to keep the blob small and avoid syncing large,
  lock-sensitive cookie data by surprise.
- All cross-boundary sync messages validated with Zod (`src/shared/schemas.ts`).
- Password mismatch can surface **mid-sync**, not only at connect: if the remote
  blob's vault verifier stops matching (e.g. the master password was reset on
  another device), a push/pull must not crash or silently clobber. It routes to
  the same reconcile dialog (case 3) instead of erroring out.

## Testing

- `sync-merge.ts` — pure unit tests (Vitest): concurrent edits, delete-vs-edit
  both orderings, tombstone pruning, ties, disjoint sets, empty sides.
- `drive-client.ts` — mock `fetch` + `browser.identity`; assert request shapes,
  not Google's servers.
- `sync-engine.ts` — integration with `fake-indexeddb`: push→pull round-trip
  converges; locked-vault rejection; first-sync bootstrap adopt vs reject.
- Migration v4 — a v3 DB upgrades and backfills `updatedAt = createdAt`.

## Open follow-ups (not this spec)

- Auto/background sync (debounce or polling) if manual proves tedious.
- Transport abstraction for a second provider.
- Chunked blob if single-file size becomes a problem.
