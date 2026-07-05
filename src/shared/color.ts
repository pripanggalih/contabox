/**
 * Color helpers shared between BG and UI.
 *
 * Firefox `contextualIdentities` accepts only 9 named colors — Contabox uses
 * that native set exclusively.
 */
import type { ContainerColor } from './types';

export const NATIVE_COLORS: readonly ContainerColor[] = [
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

/** Pick a random native ContainerColor. */
export function randomNativeColor(): ContainerColor {
  return NATIVE_COLORS[Math.floor(Math.random() * NATIVE_COLORS.length)] as ContainerColor;
}
