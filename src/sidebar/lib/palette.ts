/**
 * Color/icon palettes mirroring Firefox's `contextualIdentities` enums.
 *
 * Firefox accepts only 9 named colors and 13 named icons at the API level. To
 * give users richer choice without losing the native tab-strip indicator, we
 * expose:
 *   - NATIVE_COLORS   → the 9 names + their hex values
 *   - EXTENDED_HEXES  → 24 curated hex swatches for sidebar/popup display
 *   - randomHex()     → uniformly random hex
 *   - closestNative() → snap any hex to the nearest native enum so the
 *                       tab-strip indicator still looks reasonable
 *   - displayIcon()   → resolve any Lucide icon name override; falls back to
 *                       the native 13-value icon enum
 *   - lookupLucideIcon() → look up a Lucide icon component by PascalCase name
 */
import type { ContainerColor, ContainerIcon } from '@shared/types';
import { CUSTOM_ICON_NAMES, randomLucideIcon } from '@shared/icons';
import {
  // Native enum components (13).
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
  // Curated extras (~100). Pulling explicit names lets esbuild tree-shake the
  // ~1500-icon library down to only what we ship.
  Anchor,
  Apple,
  Award,
  Banknote,
  Beer,
  Bell,
  Bird,
  BookOpen,
  Bookmark,
  Brush,
  Bug,
  Building2,
  Calendar,
  Camera,
  Car,
  ClipboardList,
  Clock,
  Cloud,
  Code,
  Coins,
  Compass,
  Cpu,
  CreditCard,
  Crown,
  Database,
  Diamond,
  Dog,
  Eye,
  FileText,
  Film,
  Fish,
  Flag,
  Flame,
  Flower,
  Folder,
  Gamepad2,
  Gem,
  Globe,
  GraduationCap,
  HardDrive,
  Headphones,
  Heart,
  Home,
  Hospital,
  Image,
  Key,
  Laptop,
  Leaf,
  Lightbulb,
  Lock,
  Mail,
  Map,
  MapPin,
  MessageCircle,
  Mic,
  Monitor,
  Moon,
  Music,
  Newspaper,
  Notebook,
  Package,
  Palette,
  Pencil,
  Phone,
  PiggyBank,
  Pin,
  Pizza,
  Plane,
  Rocket,
  School,
  Send,
  Server,
  Shield,
  ShoppingBag,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Store,
  Sun,
  Tag,
  Target,
  Terminal,
  ThumbsUp,
  Train,
  TrendingUp,
  Trophy,
  Truck,
  Unlock,
  User,
  Users,
  Utensils,
  Video,
  Wallet,
  Wine,
  Wrench,
  Zap,
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

/**
 * Curated catalog of Lucide icons exposed to users as "custom icons".
 *
 * The list of *names* is the source of truth (`@shared/icons`), so background
 * code and validators can use it without pulling lucide-react. Here we map
 * each name to its component. Importing the components by name (rather than
 * a wildcard import) lets esbuild tree-shake the ~1500-icon library down to
 * just these.
 */
const COMPONENTS: Record<string, LucideIcon> = {
  // People & social
  User,
  Users,
  Heart,
  ThumbsUp,
  Smile,
  MessageCircle,
  Mail,
  Send,
  Phone,
  Bell,

  // Work & productivity
  Building2,
  Home,
  School,
  Hospital,
  Store,
  Calendar,
  Clock,
  ClipboardList,
  FileText,
  Folder,
  Notebook,
  BookOpen,
  Pencil,
  Bookmark,
  Tag,
  Pin,
  Flag,
  Target,
  TrendingUp,
  Award,
  Trophy,
  Crown,
  GraduationCap,
  Newspaper,

  // Money & shopping
  Banknote,
  Coins,
  CreditCard,
  Wallet,
  PiggyBank,
  ShoppingBag,
  Package,
  Truck,

  // Tech & dev
  Code,
  Terminal,
  Cpu,
  Server,
  Database,
  HardDrive,
  Laptop,
  Monitor,
  Cloud,
  Globe,
  Key,
  Lock,
  Unlock,
  Shield,
  Eye,
  Zap,
  Bug,
  Wrench,

  // Media & creativity
  Camera,
  Image,
  Video,
  Film,
  Music,
  Headphones,
  Mic,
  Gamepad2,
  Palette,
  Brush,
  Sparkles,
  Lightbulb,
  Star,
  Gem,
  Diamond,

  // Travel & place
  Plane,
  Car,
  Train,
  Rocket,
  Anchor,
  Compass,
  Map,
  MapPin,

  // Food & life
  Apple,
  Pizza,
  Utensils,
  Beer,
  Wine,

  // Nature & animals
  Sun,
  Moon,
  Flame,
  Leaf,
  Sprout,
  Flower,
  Bird,
  Dog,
  Fish,
};

/** Catalog ordered by `CUSTOM_ICON_NAMES` (the shared source of truth). */
export const CUSTOM_ICON_CATALOG: Record<string, LucideIcon> = Object.fromEntries(
  CUSTOM_ICON_NAMES.filter((n) => n in COMPONENTS).map((n) => [n, COMPONENTS[n] as LucideIcon]),
);

// Re-export so callers in the sidebar can keep importing icon helpers from
// one place (palette.ts) without reaching into @shared.
export { randomLucideIcon };

/** Resolve a Lucide icon by its PascalCase name from the curated catalog.
 *  Returns null when the name isn't in the catalog (caller falls back to the
 *  native `ContainerIcon` mapping). */
export function lookupLucideIcon(name: string): LucideIcon | null {
  return CUSTOM_ICON_CATALOG[name] ?? null;
}

/** Pick the right display icon for a container row. Custom Lucide name wins,
 *  falling back to the native enum mapping. Mirrors `displayHex`. */
export function displayIcon(view: {
  icon: ContainerIcon;
  ext: { customIcon?: string };
}): LucideIcon {
  if (view.ext.customIcon) {
    const found = lookupLucideIcon(view.ext.customIcon);
    if (found) return found;
  }
  return ICON_MAP[view.icon];
}
