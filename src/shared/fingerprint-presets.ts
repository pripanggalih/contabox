/**
 * Built-in fingerprint presets.
 * Mirror common OS/browser combos for "Aldi the Affiliate" persona — sites
 * that anti-bot us see plausible identities, not bot-y leftovers.
 */
import type { FingerprintProfile } from './types';

type PresetSeed = Omit<FingerprintProfile, 'id' | 'createdAt' | 'source' | 'name'>;

export interface FingerprintPreset {
  key: string;
  name: string;
  seed: PresetSeed;
}

const COMMON_FONTS = [
  'Arial',
  'Arial Black',
  'Arial Narrow',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Courier',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Tahoma',
  'Times',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];

const MAC_FONTS = [
  ...COMMON_FONTS,
  'Apple Chancery',
  'Apple Color Emoji',
  'Avenir',
  'Avenir Next',
  'Helvetica Neue',
  'Menlo',
  'Monaco',
  'Optima',
  'San Francisco',
];

const LINUX_FONTS = [
  ...COMMON_FONTS,
  'DejaVu Sans',
  'DejaVu Serif',
  'Liberation Sans',
  'Liberation Serif',
  'Ubuntu',
  'Ubuntu Mono',
];

export const FINGERPRINT_PRESETS: FingerprintPreset[] = [
  {
    key: 'win-chrome-latest',
    name: 'Windows · Chrome',
    seed: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      canvas: { noise: 0.0008 },
      webgl: {
        vendor: 'Google Inc. (Intel)',
        renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0)',
      },
      audio: { noise: 0.0001 },
      screen: { width: 1920, height: 1080, colorDepth: 24 },
      fonts: COMMON_FONTS,
      timezone: 'America/New_York',
      language: 'en-US',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webrtcMode: 'proxy',
    },
  },
  {
    key: 'win-firefox-latest',
    name: 'Windows · Firefox',
    seed: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
      canvas: { noise: 0.0008 },
      webgl: { vendor: 'Mozilla', renderer: 'Mozilla' },
      audio: { noise: 0.0001 },
      screen: { width: 1920, height: 1080, colorDepth: 24 },
      fonts: COMMON_FONTS,
      timezone: 'America/New_York',
      language: 'en-US',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webrtcMode: 'proxy',
    },
  },
  {
    key: 'mac-safari-latest',
    name: 'macOS · Safari',
    seed: {
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
      canvas: { noise: 0.0008 },
      webgl: { vendor: 'Apple Inc.', renderer: 'Apple GPU' },
      audio: { noise: 0.0001 },
      screen: { width: 1728, height: 1117, colorDepth: 30 },
      fonts: MAC_FONTS,
      timezone: 'America/Los_Angeles',
      language: 'en-US',
      hardwareConcurrency: 10,
      deviceMemory: 8,
      webrtcMode: 'proxy',
    },
  },
  {
    key: 'mac-firefox-latest',
    name: 'macOS · Firefox',
    seed: {
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0',
      canvas: { noise: 0.0008 },
      webgl: { vendor: 'Mozilla', renderer: 'Mozilla' },
      audio: { noise: 0.0001 },
      screen: { width: 1728, height: 1117, colorDepth: 30 },
      fonts: MAC_FONTS,
      timezone: 'America/Los_Angeles',
      language: 'en-US',
      hardwareConcurrency: 10,
      deviceMemory: 8,
      webrtcMode: 'proxy',
    },
  },
  {
    key: 'linux-firefox-esr',
    name: 'Linux · Firefox ESR',
    seed: {
      ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
      canvas: { noise: 0.0008 },
      webgl: { vendor: 'Mozilla', renderer: 'Mozilla' },
      audio: { noise: 0.0001 },
      screen: { width: 1920, height: 1080, colorDepth: 24 },
      fonts: LINUX_FONTS,
      timezone: 'Europe/Berlin',
      language: 'en-GB',
      hardwareConcurrency: 4,
      deviceMemory: 8,
      webrtcMode: 'proxy',
    },
  },
  {
    key: 'android-chrome',
    name: 'Android · Chrome',
    seed: {
      ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      canvas: { noise: 0.001 },
      webgl: { vendor: 'Qualcomm', renderer: 'Adreno (TM) 740' },
      audio: { noise: 0.0001 },
      screen: { width: 412, height: 915, colorDepth: 24 },
      fonts: ['Roboto', 'Noto Sans', 'Noto Color Emoji'],
      timezone: 'Asia/Jakarta',
      language: 'en-US',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webrtcMode: 'proxy',
    },
  },
];

/** Generate a randomized profile by jittering a base preset. */
export function randomizeFromPreset(preset: FingerprintPreset): PresetSeed {
  const seed = preset.seed;
  const jitter = (n: number, magnitude: number) =>
    Math.max(0, Math.round(n + (Math.random() * 2 - 1) * magnitude));

  return {
    ...seed,
    canvas: { noise: seed.canvas.noise * (0.5 + Math.random()) },
    audio: { noise: seed.audio.noise * (0.5 + Math.random()) },
    screen: {
      width: jitter(seed.screen.width, 80),
      height: jitter(seed.screen.height, 60),
      colorDepth: seed.screen.colorDepth,
    },
    hardwareConcurrency: [4, 6, 8, 12, 16][Math.floor(Math.random() * 5)] ?? 8,
    deviceMemory: [4, 8, 16][Math.floor(Math.random() * 3)] ?? 8,
  };
}

export function presetByKey(key: string): FingerprintPreset | undefined {
  return FINGERPRINT_PRESETS.find((p) => p.key === key);
}
