/**
 * Tiny vanilla i18n for the landing page.
 *
 * Why this shape:
 *   - The page is static HTML, no React, so we can't lean on a framework.
 *   - The dictionary is inline (not fetched) so there's no "flash of fallback
 *     language" while a JSON request is in flight.
 *   - We default to Indonesian, persist user choice in localStorage, and fall
 *     back to whatever HTML ships if a key is missing — guarantees a working
 *     page even if a translator forgets a string.
 *
 * Markers used in HTML:
 *   data-i18n          → replace textContent
 *   data-i18n-html     → replace innerHTML (use sparingly; values are trusted
 *                        because they come from this file, not user input)
 *   data-i18n-meta     → replace `content` on a <meta> tag
 *   data-i18n-aria     → replace `aria-label`
 */

/** @type {{ id: Record<string, string>, en: Record<string, string> }} */
const DICTIONARY = {
  id: {
    'meta.title': 'Contabox — banyak akun, satu Firefox',
    'meta.description':
      'Pakai puluhan akun di Firefox tanpa repot. Container dengan proxy, fingerprint, dan vault sendiri-sendiri. Lokal di mesin kamu, gratis, dan open source.',
    'meta.ogTitle': 'Contabox — banyak akun, satu Firefox',
    'meta.ogDescription':
      'Container dengan proxy, fingerprint, dan vault sendiri-sendiri. Lokal di mesin kamu.',

    'a11y.skip': 'Lompat ke bagian pasang',
    'a11y.brand': 'Beranda Contabox',

    'brand.tagline': 'Container Firefox, dipakai serius',

    'nav.features': 'Fitur',
    'nav.privacy': 'Privasi',
    'nav.release': 'Update',

    'badge.signed': 'Build resmi tertandatangani',

    'hero.title': 'Banyak akun, satu Firefox.',
    'hero.body':
      'Bikin container baru sekaligus banyak, kasih masing-masing proxy dan fingerprint sendiri, simpan password di vault terenkripsi, lalu lanjutkan kerjaan kapan saja. Semuanya tinggal di mesin kamu — tanpa akun, server, atau langganan.',
    'hero.installCta': 'Pasang di Firefox',
    'hero.notesCta': 'Catatan rilis',
    'hero.warning':
      'Pertama kali pasang, Firefox bakal nampilin peringatan biasa untuk add-on di luar daftar AMO. Klik <strong class="text-ink">Continue to install</strong> → <strong class="text-ink">Add</strong>. Setelah itu update jalan sendiri.',

    'preview.contentArea': 'Tab terbuka di container terpilih',
    'preview.figcaption': 'Tampilan asli Contabox dipasang di Firefox.',

    'strip.local.label': 'Lokal',
    'strip.local.value': 'Datamu tidak ke mana-mana',
    'strip.updates.label': 'Update',
    'strip.updates.value': 'Otomatis lewat Firefox',
    'strip.license.label': 'Lisensi',
    'strip.license.value': 'MIT, gratis selamanya',

    'features.kicker': 'Yang sehari-hari kamu butuhkan',
    'features.title': 'Firefox kasih isolasi. Contabox kasih kontrolnya.',
    'features.body':
      'Buat, buka, kunci, atau kasih proxy ke puluhan container sekaligus. Bukan satu-satu lewat menu kanan klik.',

    'feature.bulk.title': 'Operasi massal',
    'feature.bulk.body':
      'Bikin <code class="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-sm">affiliate-{n:03}</code> sekaligus 100 biji, buka satu URL di semua container, beri tag, hibernasi, atau hapus pilihan — tanpa kerja tab demi tab.',
    'feature.proxy.title': 'Proxy & fingerprint per container',
    'feature.proxy.body':
      'Tiap container punya proxy dan fingerprint sendiri. Ada rotasi pool, health check terjadwal, plus override UA, canvas, WebGL, audio, dan timezone — semuanya per container.',
    'feature.vault.title': 'Vault & autofill',
    'feature.vault.body':
      'Password dan TOTP terenkripsi AES-GCM. Autofill cuma muncul di container yang sesuai. Halaman web tidak pernah lihat secret jangka panjang — yang sampai ke sana cuma satu kode sekali pakai.',
    'feature.snapshot.title': 'Snapshot & kunci',
    'feature.snapshot.body':
      'Tangkap cookies, storage, dan IndexedDB kalau perlu. Auto-snapshot pas container nganggur. Kunci container sensitif pakai PIN — tabnya hilang dari sidebar sampai dibuka lagi.',

    'surface.kicker': 'Plus yang lain',
    'surface.title': 'Dipakai untuk kerja, bukan untuk pajangan demo.',
    'surface.item1': 'Command palette · pencarian fuzzy · tag',
    'surface.item2': 'Workspace · template · bulk create',
    'surface.item3': 'Pool proxy · cooldown · auto-disable',
    'surface.item4': 'Preset fingerprint · header rewrite',
    'surface.item5': 'Vault terenkripsi: password, TOTP, catatan',
    'surface.item6': 'Editor cookie: impor & ekspor Netscape, JSON',
    'surface.item7': 'Auto-rules: substring, glob, regex',
    'surface.item8': 'Backup terenkripsi · update tanpa wipe data',

    'privacy.kicker': 'Soal privasi',
    'privacy.title': 'Tinggal di mesin kamu. Titik.',
    'privacy.body':
      'Tidak ada akun, tidak ada server backend, tidak ada telemetri default. Semua datanya — container, vault, snapshot — disimpan di IndexedDB Firefox. Uninstall extension-nya, semuanya ikut kebuang.',
    'privacy.bg.title': 'Master password tidak ke mana-mana',
    'privacy.bg.body':
      'Master password kamu tidak pernah masuk ke content script atau halaman web. Yang dikirim cuma kode sekali pakai untuk autofill.',
    'privacy.network.title': 'Tanpa koneksi diam-diam',
    'privacy.network.body':
      'Cuma health check proxy dan telemetri (kalau diaktifkan) yang menyentuh internet. Sisanya offline.',
    'privacy.migration.title': 'Update tidak menghapus data',
    'privacy.migration.body':
      'Patch dan minor update menambah skema, tidak pernah memotongnya. Perubahan besar wajib backup paksa dulu.',
    'privacy.mit.title': 'Open source MIT',
    'privacy.mit.body':
      'Kode terbuka, threat model didokumentasikan, build bisa direproduksi siapa pun.',

    'release.kicker': 'Pasang sekali',
    'release.title': 'Update jalan sendiri.',
    'release.step1': 'Pasang XPI dari halaman ini. Cukup sekali doang.',
    'release.step2':
      'Firefox simpan add-on dengan URL update <code class="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">updates.json</code>.',
    'release.step3': 'Setiap rilis baru, Firefox ambil sendiri dalam hitungan jam.',
    'release.current': 'Build saat ini',

    'footer.copy': '© 2026 Muhammad Wahyu Pripanggalih · Lisensi MIT',
    'footer.repo': 'Repository',
    'footer.security': 'Keamanan',
    'footer.release': 'Catatan rilis',
  },

  en: {
    'meta.title': 'Contabox — many accounts, one Firefox',
    'meta.description':
      'Run dozens of accounts in Firefox without the chaos. Each container gets its own proxy, fingerprint, and vault. Lives on your machine, free, open source.',
    'meta.ogTitle': 'Contabox — many accounts, one Firefox',
    'meta.ogDescription':
      'Each container with its own proxy, fingerprint, and vault. Lives on your machine.',

    'a11y.skip': 'Skip to install',
    'a11y.brand': 'Contabox home',

    'brand.tagline': 'Firefox containers, taken seriously',

    'nav.features': 'Features',
    'nav.privacy': 'Privacy',
    'nav.release': 'Updates',

    'badge.signed': 'Signed self-hosted build',

    'hero.title': 'Many accounts, one Firefox.',
    'hero.body':
      'Spin up containers in bulk, give each its own proxy and fingerprint, store passwords in an encrypted vault, then pick up exactly where you left off. Everything stays on your machine — no account, no server, no subscription.',
    'hero.installCta': 'Install in Firefox',
    'hero.notesCta': 'Release notes',
    'hero.warning':
      'On first install Firefox shows the standard warning for add-ons outside the AMO listing. Click <strong class="text-ink">Continue to install</strong> → <strong class="text-ink">Add</strong>. Updates roll in by themselves after that.',

    'preview.contentArea': 'Tabs open in the selected container',
    'preview.figcaption': 'Real Contabox sidebar running in Firefox.',

    'strip.local.label': 'Local',
    'strip.local.value': 'Your data stays put',
    'strip.updates.label': 'Updates',
    'strip.updates.value': 'Pulled by Firefox',
    'strip.license.label': 'License',
    'strip.license.value': 'MIT, free for good',

    'features.kicker': 'What you actually need day to day',
    'features.title': 'Firefox gives you isolation. Contabox gives you the controls.',
    'features.body':
      'Create, open, lock, or assign proxies to dozens of containers at once. Not one by one through right-click menus.',

    'feature.bulk.title': 'Bulk operations',
    'feature.bulk.body':
      'Generate <code class="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-sm">affiliate-{n:03}</code> a hundred at a time, open the same URL across every account, tag, hibernate, or delete selections — no tab-by-tab busywork.',
    'feature.proxy.title': 'Per-container proxy & fingerprint',
    'feature.proxy.body':
      'Every container can carry its own proxy and fingerprint. Pool rotation, scheduled health checks, plus UA / canvas / WebGL / audio / timezone overrides — all scoped per container.',
    'feature.vault.title': 'Vault & autofill',
    'feature.vault.body':
      'Passwords and TOTP, encrypted with AES-GCM. Autofill only shows up in the matching container. The page never sees long-term secrets — only a one-shot code at fill time.',
    'feature.snapshot.title': 'Snapshots & locks',
    'feature.snapshot.body':
      'Capture cookies, storage, and IndexedDB on demand. Auto-snapshot when a container goes idle. Lock sensitive containers behind a PIN — their tabs disappear from the sidebar until you unlock them.',

    'surface.kicker': 'And the rest',
    'surface.title': 'Built for real work, not demo reels.',
    'surface.item1': 'Command palette · fuzzy search · tags',
    'surface.item2': 'Workspaces · templates · bulk create',
    'surface.item3': 'Proxy pools · cooldown · auto-disable',
    'surface.item4': 'Fingerprint presets · header rewrite',
    'surface.item5': 'Encrypted vault: passwords, TOTP, notes',
    'surface.item6': 'Cookie editor: import / export Netscape, JSON',
    'surface.item7': 'Auto-rules: substring, glob, regex',
    'surface.item8': 'Encrypted backup · updates without wiping data',

    'privacy.kicker': 'On privacy',
    'privacy.title': 'Stays on your machine. Period.',
    'privacy.body':
      "No account, no backend server, no telemetry by default. Containers, vault, snapshots — all stored in Firefox's IndexedDB. Uninstall the extension and it all goes with it.",
    'privacy.bg.title': "The master password doesn't travel",
    'privacy.bg.body':
      'Your master password never reaches a content script or any web page. The only thing that gets shipped out is a one-shot fill code.',
    'privacy.network.title': 'No silent network calls',
    'privacy.network.body':
      'Only proxy health checks and (opt-in) telemetry touch the network. Everything else is offline.',
    'privacy.migration.title': "Updates don't wipe your data",
    'privacy.migration.body':
      'Patch and minor updates extend the schema; they never strip it. Breaking changes require a forced backup first.',
    'privacy.mit.title': 'MIT open source',
    'privacy.mit.body':
      'Source is open, the threat model is documented, and anyone can reproduce the build.',

    'release.kicker': 'Install once',
    'release.title': 'Updates handle themselves.',
    'release.step1': 'Install the XPI from this page. Just once.',
    'release.step2':
      'Firefox stores the add-on with the update URL <code class="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">updates.json</code>.',
    'release.step3': 'Each new release, Firefox pulls it down within hours.',
    'release.current': 'Current build',

    'footer.copy': '© 2026 Muhammad Wahyu Pripanggalih · MIT licensed',
    'footer.repo': 'Repository',
    'footer.security': 'Security',
    'footer.release': 'Release notes',
  },
};

const STORAGE_KEY = 'contabox.lang';
const DEFAULT_LANG = 'id';
const SUPPORTED = /** @type {const} */ (['id', 'en']);

/** @returns {'id' | 'en'} */
function loadPreferred() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'id' || stored === 'en') return stored;
  } catch {
    /* localStorage may be unavailable in some contexts; fall through. */
  }
  return DEFAULT_LANG;
}

function persist(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* no-op */
  }
}

/** @param {'id' | 'en'} lang */
function applyLanguage(lang) {
  const dict = DICTIONARY[lang];
  if (!dict) return;

  document.documentElement.lang = lang;

  // textContent translations.
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (key && dict[key]) el.textContent = dict[key];
  }

  // innerHTML translations (for keys that intentionally include markup).
  for (const el of document.querySelectorAll('[data-i18n-html]')) {
    const key = el.getAttribute('data-i18n-html');
    if (key && dict[key]) el.innerHTML = dict[key];
  }

  // <meta name="..."> content swaps.
  for (const el of document.querySelectorAll('[data-i18n-meta]')) {
    const key = el.getAttribute('data-i18n-meta');
    if (key && dict[key]) el.setAttribute('content', dict[key]);
  }

  // aria-label swaps.
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    const key = el.getAttribute('data-i18n-aria');
    if (key && dict[key]) el.setAttribute('aria-label', dict[key]);
  }

  // <title> swap.
  if (dict['meta.title']) document.title = dict['meta.title'];

  // Update toggle pressed state + visuals.
  for (const btn of document.querySelectorAll('[data-lang-button]')) {
    const isActive = btn.getAttribute('data-lang-button') === lang;
    btn.setAttribute('aria-pressed', String(isActive));
    btn.classList.toggle('bg-blueprint', isActive);
    btn.classList.toggle('text-white', isActive);
    btn.classList.toggle('text-ink/55', !isActive);
  }
}

function bindToggle() {
  for (const btn of document.querySelectorAll('[data-lang-button]')) {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang-button');
      if (lang !== 'id' && lang !== 'en') return;
      persist(lang);
      applyLanguage(lang);
    });
  }
}

const initial = loadPreferred();
applyLanguage(initial);
bindToggle();

void SUPPORTED;
