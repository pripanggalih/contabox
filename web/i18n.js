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
    'meta.title': 'Contabox — Container Firefox untuk yang menjalankan banyak identitas',
    'meta.description':
      'Contabox adalah pengelola container Firefox untuk multi-identitas: bulk operasi, proxy dan fingerprint per-container, vault terenkripsi, snapshot, serta auto-rules.',
    'a11y.skip': 'Lewati ke bagian instalasi',
    'a11y.brand': 'Beranda Contabox',

    'brand.tagline': 'Container Firefox, level operator',

    'nav.features': 'Fitur',
    'nav.privacy': 'Privasi',
    'nav.release': 'Update',

    'badge.signed': 'Build mandiri tertandatangani',

    'hero.title': 'Container Firefox untuk yang menjalankan banyak identitas sekaligus.',
    'hero.body':
      'Buat banyak profil terisolasi sekali jalan, ikat masing-masing ke proxy dan fingerprint, simpan kredensial di vault terenkripsi, snapshot sesi, lalu buka kembali workspace persis seperti sebelumnya. Tanpa akun, tanpa server, dan tanpa telemetri secara default.',
    'hero.installCta': 'Pasang di Firefox',
    'hero.notesCta': 'Lihat catatan rilis',
    'hero.warning':
      'Pada pemasangan pertama Firefox akan menampilkan peringatan generik untuk add-on signed-tetapi-unlisted. Klik <strong class="text-ink">Continue to install</strong> → <strong class="text-ink">Add</strong>. Setelah itu pembaruan berjalan otomatis.',

    'preview.workspaces': 'Workspaces',
    'preview.affiliate': 'Affiliate',
    'preview.research': 'Research',
    'preview.crypto': 'Crypto',
    'preview.selectedContainer': 'Container terpilih',
    'preview.unlocked': 'Terbuka',
    'preview.proxy': 'Proxy',
    'preview.fingerprint': 'Fingerprint',
    'preview.vault': 'Vault',
    'preview.vaultValue': '3 entri · TOTP',
    'preview.snapshot': 'Snapshot',
    'preview.snapshotValue': 'Otomatis · 30 hari',
    'preview.bulkAction': 'Aksi massal',
    'preview.bulkOpen': 'Buka URL di 38 container',
    'preview.bulkProxy': 'Pasang proxy',
    'preview.bulkSnapshot': 'Snapshot semua',

    'strip.signed.label': 'Tertandatangani',
    'strip.signed.value': 'Mozilla AMO · channel unlisted',
    'strip.updates.label': 'Pembaruan',
    'strip.updates.value': 'Channel via GitHub Pages',
    'strip.license.label': 'Lisensi',
    'strip.license.value': 'MIT · local-first',

    'features.kicker': 'Apa yang digantikan',
    'features.title': 'Alat container untuk yang sudah berhenti menghitung di akun ke lima.',
    'features.body':
      'Firefox memberi isolasi. Contabox menambahkan operasi: buat, buka, proxy, fingerprint, snapshot, dan kunci container sebagai grup.',

    'feature.bulk.title': 'Bulk container ops',
    'feature.bulk.body':
      'Buat <code class="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-sm">affiliate-{n:03}</code> sekaligus, buka satu URL di seluruh akun, beri tag, hibernasi, atau hapus pilihan tanpa kerja tab demi tab.',
    'feature.proxy.title': 'Proxy + fingerprint',
    'feature.proxy.body':
      'Ikat container ke proxy SOCKS atau HTTP, rotasi pool, periksa kesehatan endpoint, dan terapkan profil UA, canvas, WebGL, audio, serta timezone yang berbeda per container.',
    'feature.vault.title': 'Vault + autofill',
    'feature.vault.body':
      'Vault AES-GCM, generator TOTP, dan autofill di shadow DOM tertutup yang scoped per origin × container. Halaman tidak pernah melihat secret jangka panjang.',
    'feature.snapshot.title': 'Snapshot + lock',
    'feature.snapshot.body':
      'Tangkap cookies, storage, dan IndexedDB opsional. Auto-snapshot saat container idle atau sebelum dihapus. Sembunyikan tab yang dikunci hingga PIN atau master password dimasukkan.',

    'surface.kicker': 'Permukaan fitur',
    'surface.title': 'Dirancang untuk alur kerja, bukan demo coba-coba.',
    'surface.item1': 'Command palette · pencarian fuzzy · tag',
    'surface.item2': 'Workspaces · template · bulk create',
    'surface.item3': 'Proxy pool · cooldown · auto-disable',
    'surface.item4': 'Preset fingerprint · header rewrite',
    'surface.item5': 'Vault terenkripsi · entri password / TOTP / catatan',
    'surface.item6': 'Editor cookie · impor / ekspor Netscape dan JSON',
    'surface.item7': 'Auto-rules · routing substring / glob / regex',
    'surface.item8': 'Backup terenkripsi · update aman terhadap skema',

    'privacy.kicker': 'Sikap privasi',
    'privacy.title': 'Lokal sebagai default, eksplisit ketika tidak.',
    'privacy.body':
      'Tidak ada akun, tidak ada backend, tidak ada telemetri default. Status browsing dan vault tinggal di IndexedDB Firefox di mesinmu, di bawah ID add-on yang permanen.',
    'privacy.bg.title': 'Kunci vault tinggal di background',
    'privacy.bg.body':
      'Content script hanya menerima satu rahasia jangka pendek per fill, tidak pernah master key.',
    'privacy.network.title': 'Tanpa panggilan jaringan diam-diam',
    'privacy.network.body':
      'Hanya health-check proxy dan telemetri opt-in yang meninggalkan mesinmu.',
    'privacy.migration.title': 'Migrasi forward-only',
    'privacy.migration.body':
      'Update patch dan minor mempertahankan setiap baris yang sudah tersimpan. Perubahan breaking butuh major dan backup paksa.',
    'privacy.mit.title': 'Lisensi MIT',
    'privacy.mit.body':
      'Kode terbuka, threat model terdokumentasi, alur rilis yang dapat direproduksi.',

    'release.kicker': 'Pasang sekali',
    'release.title': 'Pembaruan sudah tersambung.',
    'release.step1': 'Pasang XPI tertandatangani dari halaman ini.',
    'release.step2':
      'Firefox menyimpan add-on dengan URL pembaruan <code class="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">updates.json</code>.',
    'release.step3':
      'Setiap tag baru di GitHub menandatangani XPI segar dan memperbarui feed otomatis.',
    'release.current': 'Build saat ini',

    'footer.copy': '© 2026 Muhammad Wahyu Pripanggalih. Lisensi MIT.',
    'footer.repo': 'Repository',
    'footer.security': 'Keamanan',
    'footer.release': 'Catatan rilis',
  },

  en: {
    'meta.title': 'Contabox — Firefox containers for people who run more than one identity',
    'meta.description':
      'Contabox is a Firefox container manager for bulk identities, per-container proxy and fingerprinting, encrypted vault, snapshots, and auto-rules.',
    'a11y.skip': 'Skip to install',
    'a11y.brand': 'Contabox home',

    'brand.tagline': 'Firefox containers, industrialized',

    'nav.features': 'Features',
    'nav.privacy': 'Privacy',
    'nav.release': 'Updates',

    'badge.signed': 'Signed self-hosted build',

    'hero.title': 'Firefox containers for people who run more than one identity.',
    'hero.body':
      'Bulk-create isolated profiles, bind each one to a proxy and fingerprint, keep secrets in an encrypted vault, snapshot sessions, then reopen the exact workspace later. No account, no server, no telemetry by default.',
    'hero.installCta': 'Install in Firefox',
    'hero.notesCta': 'View release notes',
    'hero.warning':
      'Firefox shows a generic warning for signed-but-unlisted add-ons on first install. Click <strong class="text-ink">Continue to install</strong> → <strong class="text-ink">Add</strong>. Updates are automatic after that.',

    'preview.workspaces': 'Workspaces',
    'preview.affiliate': 'Affiliate',
    'preview.research': 'Research',
    'preview.crypto': 'Crypto',
    'preview.selectedContainer': 'Selected container',
    'preview.unlocked': 'Unlocked',
    'preview.proxy': 'Proxy',
    'preview.fingerprint': 'Fingerprint',
    'preview.vault': 'Vault',
    'preview.vaultValue': '3 entries · TOTP',
    'preview.snapshot': 'Snapshot',
    'preview.snapshotValue': 'Auto · 30 days',
    'preview.bulkAction': 'Bulk action',
    'preview.bulkOpen': 'Open URL in 38',
    'preview.bulkProxy': 'Assign proxy',
    'preview.bulkSnapshot': 'Snapshot all',

    'strip.signed.label': 'Signed',
    'strip.signed.value': 'Mozilla AMO unlisted',
    'strip.updates.label': 'Updates',
    'strip.updates.value': 'GitHub Pages update channel',
    'strip.license.label': 'License',
    'strip.license.value': 'MIT · local-first',

    'features.kicker': 'What it replaces',
    'features.title': 'A container tool for people who stopped counting at five accounts.',
    'features.body':
      'Firefox gives you isolation. Contabox gives you operations: create, open, proxy, fingerprint, snapshot, and lock containers as a group.',

    'feature.bulk.title': 'Bulk container ops',
    'feature.bulk.body':
      'Generate <code class="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-sm">affiliate-{n:03}</code>, open one URL across every account, tag, hibernate, or delete selections without tab-by-tab work.',
    'feature.proxy.title': 'Proxy + fingerprint',
    'feature.proxy.body':
      'Bind containers to SOCKS/HTTP proxies, rotate pools, health-check endpoints, and apply per-container UA/canvas/WebGL/audio/timezone profiles.',
    'feature.vault.title': 'Vault + autofill',
    'feature.vault.body':
      'AES-GCM vault, TOTP generator, and a closed-shadow-DOM autofill picker scoped to origin × container. The page never sees long-term secrets.',
    'feature.snapshot.title': 'Snapshots + locks',
    'feature.snapshot.body':
      'Capture cookies, storage, and optional IndexedDB. Auto-snapshot on idle or pre-delete. Hide locked tabs until PIN or master-password unlock.',

    'surface.kicker': 'Feature surface',
    'surface.title': 'Built for workflows, not novelty demos.',
    'surface.item1': 'Command palette · fuzzy search · tags',
    'surface.item2': 'Workspaces · templates · bulk create',
    'surface.item3': 'Proxy pools · cooldown · auto-disable',
    'surface.item4': 'Fingerprint presets · header rewrite',
    'surface.item5': 'Encrypted vault · password / TOTP / note entries',
    'surface.item6': 'Cookie editor · Netscape + JSON import/export',
    'surface.item7': 'Auto-rules · substring / glob / regex routing',
    'surface.item8': 'Full encrypted backup · schema-safe updates',

    'privacy.kicker': 'Privacy posture',
    'privacy.title': 'Local by default, explicit when not.',
    'privacy.body':
      "No account, no hosted backend, no default telemetry. Your browsing state and vault live in Firefox's local IndexedDB under the permanent add-on ID.",
    'privacy.bg.title': 'Vault key stays in background',
    'privacy.bg.body': 'Content scripts receive one short-lived fill secret, never the master key.',
    'privacy.network.title': 'No silent network calls',
    'privacy.network.body': 'Only proxy checks and opt-in telemetry leave the machine.',
    'privacy.migration.title': 'Forward-only migrations',
    'privacy.migration.body':
      'Patch and minor updates preserve every stored row. Breaking changes require a major version and forced backup.',
    'privacy.mit.title': 'MIT licensed',
    'privacy.mit.body': 'Open-source code, documented threat model, reproducible release workflow.',

    'release.kicker': 'Install once',
    'release.title': 'Updates are already wired.',
    'release.step1': 'Install the signed XPI from this page.',
    'release.step2':
      'Firefox stores the add-on with update URL <code class="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">updates.json</code>.',
    'release.step3': 'Every new GitHub tag signs a fresh XPI and updates the feed automatically.',
    'release.current': 'Current build',

    'footer.copy': '© 2026 Muhammad Wahyu Pripanggalih. MIT licensed.',
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
