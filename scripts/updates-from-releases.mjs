#!/usr/bin/env node
/**
 * Build a Firefox `updates.json` from the repo's GitHub Releases — the single
 * source of truth. Enumerates every release, picks its `.xpi` asset, and emits
 * one update entry per version.
 *
 * Why not fetch the live updates.json and merge? Two workflows (release.yml and
 * pages.yml) both deploy Pages on a push and race; the loser's fetch of the
 * live file could be stale, clobbering a just-published version. Deriving from
 * Releases makes both workflows produce the same output regardless of order.
 *
 * Input (env):
 *   ADDON_ID    e.g. contabox@galih.dev
 *   RELEASES    JSON array from `gh release list --json tagName` plus assets,
 *               OR set nothing and pipe `gh api` output — see pages.yml usage.
 *
 * Reads a releases JSON array on stdin: [{ tagName, assets: [{name, url}] }].
 * Writes the merged updates.json to stdout.
 */
import { readFileSync } from 'node:fs';

const id = process.env.ADDON_ID;
if (!id) {
  console.error('Missing ADDON_ID');
  process.exit(1);
}

const releases = JSON.parse(readFileSync(0, 'utf8'));
const updates = [];
for (const rel of releases) {
  const xpi = (rel.assets ?? []).find((a) => a.name?.endsWith('.xpi'));
  if (!xpi) continue;
  // Strip a leading "v" from the tag to get the dotted version.
  const version = String(rel.tagName ?? '').replace(/^v/, '');
  if (!version) continue;
  const entry = { version, update_link: xpi.url };
  // `digest` is already "sha256:…" — the exact shape Firefox's update_hash wants.
  if (typeof xpi.digest === 'string' && xpi.digest.startsWith('sha256:')) {
    entry.update_hash = xpi.digest;
  }
  updates.push(entry);
}

updates.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));

if (!updates.length) {
  console.error('No releases with an .xpi asset found — refusing to emit empty updates.json');
  process.exit(1);
}

process.stdout.write(JSON.stringify({ addons: { [id]: { updates } } }, null, 2));
