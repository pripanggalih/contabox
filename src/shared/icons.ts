/**
 * Curated names of Lucide icons exposed to users as "custom icons".
 *
 * The icon **components** live in `src/sidebar/lib/palette.ts` (which can pull
 * lucide-react). This module is the trust-boundary-safe list of *names* —
 * importable from background, shared validators, and tests without dragging
 * lucide-react into background bundles.
 *
 * Keep this list in sync with the imports + CUSTOM_ICON_CATALOG in palette.ts
 * so esbuild can tree-shake lucide-react down to just these icons.
 */

export const CUSTOM_ICON_NAMES: readonly string[] = [
  // People & social
  'User',
  'Users',
  'Heart',
  'ThumbsUp',
  'Smile',
  'MessageCircle',
  'Mail',
  'Send',
  'Phone',
  'Bell',

  // Work & productivity
  'Building2',
  'Home',
  'School',
  'Hospital',
  'Store',
  'Calendar',
  'Clock',
  'ClipboardList',
  'FileText',
  'Folder',
  'Notebook',
  'BookOpen',
  'Pencil',
  'Bookmark',
  'Tag',
  'Pin',
  'Flag',
  'Target',
  'TrendingUp',
  'Award',
  'Trophy',
  'Crown',
  'GraduationCap',
  'Newspaper',

  // Money & shopping
  'Banknote',
  'Coins',
  'CreditCard',
  'Wallet',
  'PiggyBank',
  'ShoppingBag',
  'Package',
  'Truck',

  // Tech & dev
  'Code',
  'Terminal',
  'Cpu',
  'Server',
  'Database',
  'HardDrive',
  'Laptop',
  'Monitor',
  'Cloud',
  'Globe',
  'Key',
  'Lock',
  'Unlock',
  'Shield',
  'Eye',
  'Zap',
  'Bug',
  'Wrench',

  // Media & creativity
  'Camera',
  'Image',
  'Video',
  'Film',
  'Music',
  'Headphones',
  'Mic',
  'Gamepad2',
  'Palette',
  'Brush',
  'Sparkles',
  'Lightbulb',
  'Star',
  'Gem',
  'Diamond',

  // Travel & place
  'Plane',
  'Car',
  'Train',
  'Rocket',
  'Anchor',
  'Compass',
  'Map',
  'MapPin',

  // Food & life
  'Apple',
  'Pizza',
  'Utensils',
  'Beer',
  'Wine',

  // Nature & animals
  'Sun',
  'Moon',
  'Flame',
  'Leaf',
  'Sprout',
  'Flower',
  'Bird',
  'Dog',
  'Fish',
];

/** Pick a random icon name from the curated catalog. */
export function randomLucideIcon(): string {
  const i = Math.floor(Math.random() * CUSTOM_ICON_NAMES.length);
  return CUSTOM_ICON_NAMES[i] as string;
}
