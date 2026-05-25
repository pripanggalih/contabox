/**
 * Color helpers shared between BG and UI.
 *
 * Firefox `contextualIdentities` only accepts 9 named colors. To let users pick
 * any hex while keeping the native tab-strip indicator working, we snap any
 * arbitrary hex to the nearest native by RGB distance for the API call, and
 * persist the original hex in `ContainerExt.customColor` for sidebar/popup
 * rendering.
 */
import type { ContainerColor } from './types';

export const NATIVE_COLOR_HEXES: Record<ContainerColor, string> = {
  blue: '#37adff',
  turquoise: '#00c79a',
  green: '#51cd00',
  yellow: '#ffcb00',
  orange: '#ff9f00',
  red: '#ff613d',
  pink: '#ff4bda',
  purple: '#af51f5',
  toolbar: '#7c7c7d',
};

/** Snap any `#RRGGBB` to the nearest native ContainerColor by squared RGB distance. */
export function closestNativeColor(hex: string): ContainerColor {
  const target = parseHex(hex);
  let best: ContainerColor = 'toolbar';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [name, native] of Object.entries(NATIVE_COLOR_HEXES) as Array<
    [ContainerColor, string]
  >) {
    const n = parseHex(native);
    const d = (target.r - n.r) ** 2 + (target.g - n.g) ** 2 + (target.b - n.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

/** Cryptographically random `#RRGGBB`, biased away from extremes for legibility. */
export function randomHexColor(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 3; i++) {
    const v = bytes[i] ?? 0;
    bytes[i] = 40 + Math.floor((v / 255) * 200);
  }
  return `#${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}
