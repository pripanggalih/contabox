#!/usr/bin/env node
/**
 * Build a Firefox `updates.json` for our self-hosted add-on channel.
 *
 * Inputs (env):
 *   ADDON_ID    e.g. contabox@galih.dev
 *   VERSION     e.g. 0.1.1
 *   UPDATE_LINK URL of the signed XPI
 *
 * Reads `existing.json` from cwd (previous live updates.json fetched from
 * Pages) so older versions stay listed. Writes the merged JSON to stdout.
 */
import { readFileSync } from 'node:fs';

const id = process.env.ADDON_ID;
const version = process.env.VERSION;
const updateLink = process.env.UPDATE_LINK;

if (!id || !version || !updateLink) {
  console.error('Missing one of ADDON_ID / VERSION / UPDATE_LINK');
  process.exit(1);
}

let existing = {};
try {
  existing = JSON.parse(readFileSync('existing.json', 'utf8'));
} catch {
  /* first publish: no prior updates.json */
}

const previous = existing.addons?.[id]?.updates ?? [];
const filtered = previous.filter((u) => u.version !== version);
const merged = [...filtered, { version, update_link: updateLink }].sort((a, b) =>
  a.version.localeCompare(b.version, undefined, { numeric: true }),
);

process.stdout.write(JSON.stringify({ addons: { [id]: { updates: merged } } }, null, 2));
