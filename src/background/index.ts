/**
 * Background entry point.
 *
 * Wires the command router and listens for shortcut / install events.
 * Keep this file thin — actual logic lives in per-engine modules.
 */
import { browser } from '@shared/browser';
import { broadcast } from '@shared/messaging';
import { autoRuleEngine } from './auto-rule-engine';
import { autoSnapshotEngine } from './auto-snapshot';
import { commandRouter } from './command-router';
import { containerManager } from './container-manager';
import { fingerprintEngine } from './fingerprint-engine';
import { lockManager } from './lock-manager';
import { macImporter } from './mac-importer';
import { installLogRing } from './privacy';
import { proxyEngine } from './proxy-engine';
import { vault } from './vault';
import { webRtcEngine } from './webrtc-engine';

// Capture early console output for the debug-logs export. Safe to install
// before everything else; failures are swallowed.
installLogRing();

// Attach the message router FIRST so the UI can talk to BG even if other
// engines fail to initialize. Anything below is best-effort.
commandRouter.attach();

// Wire the vault auto-lock so it performs the SAME teardown as a manual lock
// (invalidate proxy creds, relock per-container sessions, refresh the UI) and
// register its alarm listener synchronously (MV3 event-page requirement).
vault.setLockSideEffects(async () => {
  proxyEngine.invalidate();
  await lockManager.relockAll();
  void broadcast({ type: 'state.vault' });
  void broadcast({ type: 'state.locks' });
});
vault.attachAutoLock();

// Prune ext rows whose native container vanished (suspend during an undo
// window, cross-profile restore). Best-effort.
containerManager.reconcileOrphans().catch((err) => {
  console.warn('[contabox] reconcileOrphans failed', err);
});

// Idempotent — adopts any native container Contabox doesn't yet know into
// the "Firefox Default" workspace. Runs on every startup so containers
// created via about:preferences or Multi-Account Containers don't land in
// the orphan bucket.
macImporter.import().catch((err) => {
  console.warn('[contabox] macImporter.import failed', err);
});

try {
  proxyEngine.attach();
} catch (err) {
  console.warn('[contabox] proxyEngine.attach failed', err);
}
proxyEngine.ensureScheduled().catch((err) => {
  console.warn('[contabox] proxyEngine.ensureScheduled failed', err);
});
fingerprintEngine.attach().catch((err) => {
  console.warn('[contabox] fingerprintEngine.attach failed', err);
});
autoRuleEngine.attach().catch((err) => {
  console.warn('[contabox] autoRuleEngine.attach failed', err);
});
autoSnapshotEngine.attach().catch((err) => {
  console.warn('[contabox] autoSnapshotEngine.attach failed', err);
});
webRtcEngine.apply().catch((err) => {
  console.warn('[contabox] webRtcEngine.apply failed', err);
});

// Adopt newly-created native containers as they appear (e.g. user adds
// "Crypto" container in about:preferences#general while Contabox is running).
browser.contextualIdentities.onCreated.addListener(() => {
  void macImporter.import().catch(() => undefined);
});

browser.runtime.onInstalled.addListener((details) => {
  console.info('[contabox] onInstalled', details.reason);
});

browser.runtime.onStartup.addListener(() => {
  console.info('[contabox] onStartup');
});

// Keyboard command handler. _execute_sidebar_action is handled natively.
browser.commands.onCommand.addListener(async (name) => {
  if (name !== 'lock-all') return;
  try {
    const r = await containerManager.lockAll();
    await lockManager.relockAll();
    console.info('[contabox] lockAll:', r.count);
  } catch (err) {
    console.warn('[contabox] lockAll failed', err);
  }
});
