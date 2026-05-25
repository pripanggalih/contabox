/**
 * WebRTC leak protection.
 *
 * Firefox exposes `browser.privacy.network.peerConnectionEnabled` (global
 * boolean — not per-container). Per-container WebRTC mode is best-effort:
 *   - 'real'    → leave default
 *   - 'proxy'   → set `webRTCIPHandlingPolicy` to disable_non_proxied_udp
 *   - 'disabled'→ set `peerConnectionEnabled = false` (kills RTC for ALL tabs)
 *
 * Because Firefox lacks a per-container API for this, we apply the strictest
 * mode across all containers. UI surfaces this caveat.
 */
import { browser } from '@shared/browser';
import { getDb } from '@shared/db';
import type { WebRtcMode } from '@shared/types';

export class WebRtcEngine {
  /**
   * Compute the strictest mode in use, then apply it.
   * Order: disabled (strictest) > proxy > real (least strict).
   */
  async apply(): Promise<void> {
    const fingerprints = await getDb().fingerprints.toArray();
    const containers = await getDb().containers.toArray();
    const inUse = new Set<string>(
      containers.map((c) => c.fingerprintId).filter((id): id is string => !!id),
    );

    const modes = fingerprints.filter((f) => inUse.has(f.id)).map((f) => f.webrtcMode);

    const mode = pickStrictest(modes);
    await this.setMode(mode);
  }

  async setMode(mode: WebRtcMode): Promise<void> {
    try {
      const privacy = (browser as { privacy?: { network?: unknown } }).privacy?.network as
        | {
            peerConnectionEnabled?: { set: (v: { value: boolean }) => Promise<void> };
            webRTCIPHandlingPolicy?: { set: (v: { value: string }) => Promise<void> };
          }
        | undefined;
      if (!privacy) return;

      switch (mode) {
        case 'disabled':
          await privacy.peerConnectionEnabled?.set({ value: false });
          break;
        case 'proxy':
          await privacy.peerConnectionEnabled?.set({ value: true });
          await privacy.webRTCIPHandlingPolicy?.set({
            value: 'disable_non_proxied_udp',
          });
          break;
        case 'real':
        default:
          await privacy.peerConnectionEnabled?.set({ value: true });
          await privacy.webRTCIPHandlingPolicy?.set({ value: 'default' });
          break;
      }
    } catch (err) {
      console.warn('[contabox] webrtc.setMode failed (privacy permission missing?)', err);
    }
  }
}

function pickStrictest(modes: WebRtcMode[]): WebRtcMode {
  if (modes.includes('disabled')) return 'disabled';
  if (modes.includes('proxy')) return 'proxy';
  return 'real';
}

export const webRtcEngine = new WebRtcEngine();
