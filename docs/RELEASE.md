# Release & Deploy

How to publish Contabox to Firefox users.

## Channels

| Channel | Distribution | Auto-update | Review | Use case |
|---|---|---|---|---|
| `listed` | AMO (addons.mozilla.org) | Yes (Firefox built-in) | 5–14 days first listing, hours after | Public stable releases |
| `unlisted` | Self-hosted XPI | Yes (via `update_url`) | 1–48 hours (signing only) | Beta channel, internal testing |

## One-time setup

### 1. AMO developer account
1. Sign up at https://addons.mozilla.org/developers/
2. Enable 2FA (required for publishing).
3. Generate API credentials at https://addons.mozilla.org/developers/addon/api/key/
   - Copy `JWT issuer` (e.g. `user:12345678:42`).
   - Copy `JWT secret` (~64 chars, shown once).

### 2. GitHub repo secrets
1. Repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Add:
   - `AMO_JWT_ISSUER` = your JWT issuer
   - `AMO_JWT_SECRET` = your JWT secret

### 3. First-time AMO listing (manual, one time only)
The first listing for a new add-on ID must be created in the AMO web UI so
Mozilla can collect listing metadata (description, screenshots, categories,
support URL). After the listing exists, `web-ext sign --channel=listed` will
push every subsequent version automatically.

1. Run `pnpm package` locally to produce `web-ext-artifacts/contabox-<version>.zip`.
2. Go to https://addons.mozilla.org/developers/addon/submit/distribution
3. Choose "On this site" (= listed channel).
4. Upload the zip; AMO validates and shows the source-code submission form.
5. Fill listing fields:
   - Categories: Privacy & Security, Other
   - Support email & URL
   - Privacy policy (we ship one — point to README/PRIVACY.md)
   - Screenshots (sidebar + popup + options)
6. Submit. Wait for review. After approval, AMO shows the add-on ID
   (`contabox@galih.dev` per current `manifest.json`).
7. From now on, releases happen via `git tag v...` (see below).

## Cutting a release

```bash
# 1. Bump version (syncs package.json + manifest.json)
pnpm version:bump patch     # 0.1.0 -> 0.1.1
pnpm version:bump minor     # 0.1.0 -> 0.2.0
pnpm version:bump 0.5.0     # explicit

# 2. Commit
git commit -am "chore: release v0.1.1"

# 3. Tag and push
git tag v0.1.1
git push origin main --tags
```

Pushing the tag triggers `.github/workflows/release.yml`:

1. Lint, typecheck, unit tests, build.
2. `web-ext lint dist/` for manifest sanity.
3. Build unsigned `.zip` and `.xpi`.
4. `web-ext sign --channel=listed` — uploads to AMO and waits for the
   signed XPI to come back.
5. Creates a GitHub Release with the signed XPI attached.

For listed releases the action exits as soon as AMO accepts the upload.
The signed XPI is downloaded and attached to the GitHub Release; meanwhile
the listing waits in the AMO review queue. Users on the previous version
update automatically once Mozilla approves.

## Beta channel (self-hosted)

Trigger manually:

1. Repo → **Actions → Release → Run workflow**.
2. Select `channel: unlisted`.
3. Workflow runs the same steps but signs against the unlisted channel —
   no AMO listing review involved.
4. Download the signed XPI from the workflow's artifact list.
5. Distribute via your own URL (e.g. `https://contabox.dev/beta/contabox-0.2.0.xpi`).

For unlisted auto-update, host an updates JSON at a stable URL and reference
it from `manifest.json`:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "contabox@galih.dev",
    "strict_min_version": "115.0",
    "update_url": "https://contabox.dev/beta/updates.json"
  }
}
```

`updates.json` shape:

```json
{
  "addons": {
    "contabox@galih.dev": {
      "updates": [
        { "version": "0.2.0", "update_link": "https://contabox.dev/beta/contabox-0.2.0.xpi" },
        { "version": "0.2.1", "update_link": "https://contabox.dev/beta/contabox-0.2.1.xpi" }
      ]
    }
  }
}
```

Firefox polls this URL roughly every 24 hours (or on browser startup) and
upgrades silently when a higher `version` is found. Order doesn't matter;
Firefox picks the highest by SemVer.

> The `update_url` field is **only allowed on unlisted/self-hosted builds**.
> AMO's listed channel rejects manifests that declare `update_url` because
> AMO is the update source there. Keep two manifests if you ship both
> channels (gitignore one, swap before sign).

## Manual signing without GitHub Actions

```bash
# Listed (production AMO upload):
pnpm sign:listed

# Unlisted (signing only, no review):
pnpm sign:unlisted
```

Both read `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` from your shell env. Don't
commit them — use `direnv` or 1Password CLI.

## Version rules

- Dotted numeric, max 4 segments: `0.1.0`, `0.2.1.42`.
- No pre-release suffixes (`0.2.0-beta.1` is rejected by Firefox's update
  comparator). For betas, use a 4th segment: `0.2.0.1`, `0.2.0.2`, …
- Each segment 0..999_999_999.
- Higher version always wins. Don't reuse a version even if AMO rejects it —
  you'll need to bump again.

## Troubleshooting

**`web-ext sign` returns "Your add-on failed validation"**
Check the AMO validation report URL printed in the log. Most common:
- Source-code submission missing for builds that include minified deps. The
  signing step uploads dist/ which is built with sourcemaps; AMO requires
  uploading the source archive separately on first listed submission.
- Use of `eval`/`Function` constructor anywhere in the bundle. We don't.

**"Add-on ID does not match registered ID"**
You changed `browser_specific_settings.gecko.id`. Don't — once published,
the ID is permanent. To rebrand, you need a fresh listing.

**GitHub Action fails at `Verify version sync`**
`package.json` and `public/manifest.json` got out of sync. Run
`pnpm version:bump <version>` to fix both, then re-tag.
