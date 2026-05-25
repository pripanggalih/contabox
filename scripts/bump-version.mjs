#!/usr/bin/env node
/**
 * Bump version in both package.json and public/manifest.json so they never
 * drift. Also sets the same version inside the placeholder block at the top
 * of `Options.tsx` for the "you are running" string.
 *
 * Usage:
 *   node scripts/bump-version.mjs 0.2.0
 *   node scripts/bump-version.mjs patch       # 0.1.0 -> 0.1.1
 *   node scripts/bump-version.mjs minor       # 0.1.0 -> 0.2.0
 *   node scripts/bump-version.mjs major       # 0.1.0 -> 1.0.0
 *
 * AMO version rules: dotted, max 4 segments, each segment 0..999_999_999.
 * We don't allow pre-release suffixes ("0.2.0-beta.1") because Firefox's
 * native update flow treats them as same-version. Use a numeric scheme like
 * 0.2.0.1 for beta channels instead.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: bump-version.mjs <version|patch|minor|major>');
  process.exit(1);
}

const pkgPath = resolve(root, 'package.json');
const manifestPath = resolve(root, 'public/manifest.json');
const optionsPath = resolve(root, 'src/options/Options.tsx');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;

let next;
if (arg === 'patch' || arg === 'minor' || arg === 'major') {
  const [maj, min, pat] = oldVersion.split('.').map((n) => Number(n));
  if (arg === 'patch') next = `${maj}.${min}.${pat + 1}`;
  if (arg === 'minor') next = `${maj}.${min + 1}.0`;
  if (arg === 'major') next = `${maj + 1}.0.0`;
} else {
  next = arg;
}

if (!/^\d+(\.\d+){0,3}$/.test(next)) {
  console.error(`Invalid version: ${next} (expected dotted numeric, max 4 segments)`);
  process.exit(1);
}

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = next;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Best-effort: replace the version literal in Options.tsx if present.
try {
  const src = readFileSync(optionsPath, 'utf8');
  const replaced = src.replace(
    /(\bContabox\b\s*<\/strong>\s*<strong>)\s*[\d.]+\s*(<\/strong>)/g,
    '',
  );
  // Simpler regex (the one above is over-strict for current markup):
  const replaced2 = src.replace(/(running\s+Contabox\s*<\/?strong>?\s*)([\d.]+)/g, `$1${next}`);
  if (replaced2 !== src) writeFileSync(optionsPath, replaced2);
  void replaced;
} catch {
  /* optional */
}

console.log(`Bumped ${oldVersion} -> ${next}`);
console.log('Next steps:');
console.log(`  git commit -am "chore: release v${next}"`);
console.log(`  git tag v${next}`);
console.log('  git push origin main --tags');
