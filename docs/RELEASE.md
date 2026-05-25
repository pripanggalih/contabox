# Release & Deploy

How Contabox ships. Default flow is **unlisted self-hosted** with auto-update
via GitHub Pages — fast, no AMO listing review, fully automated. The pipeline
also supports the AMO `listed` channel for a future public release.

## Default flow (unlisted, self-hosted)

```
git tag v0.1.1 && git push origin main --tags
        ↓
GitHub Actions:
  1. lint + typecheck + test
  2. vite build:prod (no sourcemaps)
  3. web-ext sign --channel=unlisted   (~1–5 min, no human review)
  4. GitHub Release with signed XPI attached
  5. Deploy updates.json + landing page to GitHub Pages
        ↓
Installed Firefox checks updates.json every ~24h → silent auto-update
```

| | Unlisted (this) | Listed (AMO) |
|---|---|---|
| Review | Automated, ~minutes | 5–14 days first time, hours for updates |
| Distribution | Share an XPI URL | Searchable on AMO |
| Auto-update | `update_url` → our Pages site | AMO native |
| First-install UX | Firefox warns "this file may be unsafe" once | One-click |
| Best for | Personal use, beta testers, internal | Public stable |

## One-time setup

### AMO API credentials
1. Sign up at https://addons.mozilla.org/developers/ and enable 2FA.
2. Generate creds at https://addons.mozilla.org/developers/addon/api/key/.
3. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `AMO_JWT_ISSUER`
   - `AMO_JWT_SECRET`

### GitHub Pages
Enabled for this repo via API: `gh api -X POST /repos/<owner>/<repo>/pages -f build_type=workflow`.
The release workflow handles deploy via `actions/deploy-pages`. URL:
`https://pripanggalih.github.io/contabox/`.

### Manifest update_url
`public/manifest.json` declares `update_url: https://pripanggalih.github.io/contabox/updates.json`
inside `browser_specific_settings.gecko`. Firefox polls that URL after every
browser start and roughly every 24h thereafter; bumping a tag auto-publishes
a new entry there.

> If you ever want to publish to AMO listed, **drop `update_url` in a
> per-channel manifest**. AMO rejects manifests that bring their own
> update channel. Easiest: keep two manifest files, swap before sign.

## Cutting a release

```bash
pnpm version:bump patch        # 0.1.0 → 0.1.1
git commit -am "chore: release v0.1.1"
git tag v0.1.1
git push origin main --tags
```

Push triggers `.github/workflows/release.yml`. The default channel is
`unlisted`. Released XPI lands at:

```
https://github.com/pripanggalih/contabox/releases/download/v0.1.1/contabox-0.1.1-an+fx.xpi
```

The Pages site shows a styled install page with a single button:
`https://pripanggalih.github.io/contabox/`.

### Switching channels per release

For a manual run on AMO listed:

1. Repo → **Actions → Release → Run workflow**
2. Channel: `listed` → Run

For listed, **the first listing must be created manually** in the AMO web UI
(metadata, screenshots, categories). Subsequent updates flow through the
same workflow.

## Manual signing (without GH Actions)

```bash
export AMO_JWT_ISSUER='user:xxxxxxx:yy'
export AMO_JWT_SECRET='...64chars...'

pnpm sign:unlisted     # signed, no review queue
pnpm sign:listed       # public AMO submission
```

Both produce a signed `.xpi` in `web-ext-artifacts/`.

## Local-only install (no signing)

For dev / debugging:

```bash
pnpm build
```

Then in Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary
Add-on** → pick `dist/manifest.json`. Lasts until Firefox restarts.

## Version rules

- Dotted numeric, max 4 segments: `0.1.0`, `0.2.1.42`.
- No pre-release suffixes (Firefox's update comparator doesn't understand
  them). For betas, use a 4th segment: `0.2.0.1`, `0.2.0.2`, …
- Don't reuse versions, even after a rejected upload. Bump again.

## Troubleshooting

**"Add-on ID does not match registered ID"**
You changed `browser_specific_settings.gecko.id`. Don't — once published,
the ID is permanent. To rebrand, you need a fresh listing.

**`Verify version sync` step fails in CI**
`package.json` and `public/manifest.json` got out of sync. Run
`pnpm version:bump <version>` to fix both, then re-tag.

**`web-ext sign` returns "Your add-on failed validation"**
Check the AMO validation report URL in the workflow log. We don't use
`eval` anywhere; common cause is a corrupt build. Rerun the workflow.

**Firefox installed the XPI but won't update**
- Verify `update_url` resolves: `curl https://pripanggalih.github.io/contabox/updates.json`
- Confirm the XPI version inside the JSON is higher than the installed one.
- Force a check: `about:addons` → gear icon → **Check for Updates**.

**First-install "this file may be unsafe" popup**
Expected for unlisted XPIs. Firefox marks every non-AMO-listed add-on this
way regardless of signing. Click **Allow** on the popup; only shown once
per machine.
