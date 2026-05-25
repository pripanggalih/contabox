/**
 * Color/icon palettes mirroring Firefox's `contextualIdentities` enums.
 *
 * Firefox accepts only 9 named colors at the API level. To give users richer
 * choice without losing the native tab-strip indicator, we expose:
 *   - NATIVE_COLORS  → the 9 names + their hex values
 *   - EXTENDED_HEXES → 24 curated hex swatches for sidebar/popup display
 *   - randomHex()    → uniformly random hex
 *   - closestNative()→ snap any hex to the nearest native enum so the tab-strip
 *                      indicator still looks reasonable
 */
import type { ContainerColor, ContainerIcon } from '@shared/types';
import {
  Briefcase,
  CircleDollarSign,
  Citrus,
  Cat,
  Coffee,
  Cookie,
  Fence,
  Fingerprint,
  Gift,
  HelpCircle,
  Palmtree,
  ShoppingCart,
  TreeDeciduous,
  type LucideIcon,
} from 'lucide-react';

export const CONTAINER_COLORS: ContainerColor[] = [
  'blue',
  'turquoise',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'toolbar',
];

export const CONTAINER_ICONS: ContainerIcon[] = [
  'fingerprint',
  'briefcase',
  'dollar',
  'cart',
  'circle',
  'gift',
  'vacation',
  'food',
  'fruit',
  'pet',
  'tree',
  'chill',
  'fence',
];

/** Native color → hex used by Firefox itself, mirrored here for picker UI. */
export const NATIVE_HEXES: Record<ContainerColor, string> = {
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

/** 24 curated hexes for the extended picker. Includes the 9 natives so the row
 * doubles as a "click for instant native" pad. */
export const EXTENDED_HEXES: string[] = [
  // natives
  '#37adff',
  '#00c79a',
  '#51cd00',
  '#ffcb00',
  '#ff9f00',
  '#ff613d',
  '#ff4bda',
  '#af51f5',
  '#7c7c7d',
  // extended
  '#1e3a8a', // navy
  '#0ea5e9', // sky
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#84cc16', // lime
  '#eab308', // gold
  '#f97316', // tangerine
  '#dc2626', // crimson
  '#be185d', // magenta
  '#a855f7', // violet
  '#6366f1', // indigo
  '#0891b2', // teal-deep
  '#65a30d', // moss
  '#a16207', // amber
  '#7f1d1d', // maroon
  '#374151', // graphite
];

export function colorVar(c: ContainerColor): string {
  return `var(--color-container-${c})`;
}

/** Pick the right display color for a container row. Custom hex wins. */
export function displayHex(view: { color: ContainerColor; ext: { customColor?: string } }): string {
  return view.ext.customColor ?? NATIVE_HEXES[view.color];
}

/** Cryptographically random 6-digit hex (#RRGGBB). */
export function randomHex(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  // Bias away from very-dark / very-light extremes so icons stay legible.
  for (let i = 0; i < 3; i++) {
    const v = bytes[i] ?? 0;
    bytes[i] = 40 + Math.floor((v / 255) * 200);
  }
  return (
    '#' +
    [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  );
}

/** Snap an arbitrary hex to the nearest native ContainerColor by RGB distance. */
export function closestNative(hex: string): ContainerColor {
  const target = parseHex(hex);
  let best: ContainerColor = 'toolbar';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [name, native] of Object.entries(NATIVE_HEXES) as Array<[ContainerColor, string]>) {
    const n = parseHex(native);
    const d =
      (target.r - n.r) ** 2 + (target.g - n.g) ** 2 + (target.b - n.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

const ICON_MAP: Record<ContainerIcon, LucideIcon> = {
  fingerprint: Fingerprint,
  briefcase: Briefcase,
  dollar: CircleDollarSign,
  cart: ShoppingCart,
  circle: HelpCircle,
  gift: Gift,
  vacation: Palmtree,
  food: Cookie,
  fruit: Citrus,
  pet: Cat,
  tree: TreeDeciduous,
  chill: Coffee,
  fence: Fence,
};

export function iconComponent(name: ContainerIcon): LucideIcon {
  return ICON_MAP[name];
}
