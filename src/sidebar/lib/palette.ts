/**
 * Color/icon palettes mirroring Firefox's `contextualIdentities` enums.
 *
 * Firefox accepts only 9 named colors and 13 named icons at the API level, and
 * Contabox exposes exactly those — no custom hex or extra icons.
 *   - NATIVE_HEXES   → the 9 native colors → hex, for picker/preview UI
 *   - colorVar()     → CSS var for a native color
 *   - iconComponent()/displayIcon() → native icon name → Lucide component
 *   - displayHex()   → native color → hex
 */
import type { ContainerColor, ContainerIcon } from '@shared/types';
import {
  Briefcase,
  Cat,
  CircleDollarSign,
  Citrus,
  Coffee,
  Cookie,
  Fence,
  Fingerprint,
  Gift,
  HelpCircle,
  type LucideIcon,
  Palmtree,
  ShoppingCart,
  TreeDeciduous,
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

export function colorVar(c: ContainerColor): string {
  return `var(--color-container-${c})`;
}

/** Display hex for a native container color. */
export function displayHex(view: { color: ContainerColor }): string {
  return NATIVE_HEXES[view.color];
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

/** Resolve the Lucide component for a native container icon. */
export function displayIcon(view: { icon: ContainerIcon }): LucideIcon {
  return ICON_MAP[view.icon];
}
