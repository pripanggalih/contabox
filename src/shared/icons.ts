/**
 * Native container icon names — the 13 glyphs Firefox's `contextualIdentities`
 * API accepts. Kept lucide-free so background/validators can use it without
 * dragging lucide-react in. The name→component mapping lives in
 * `src/sidebar/lib/palette.ts`.
 */
import type { ContainerIcon } from './types';

export const NATIVE_ICONS: readonly ContainerIcon[] = [
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

/** Pick a random native ContainerIcon. */
export function randomNativeIcon(): ContainerIcon {
  return NATIVE_ICONS[Math.floor(Math.random() * NATIVE_ICONS.length)] as ContainerIcon;
}
