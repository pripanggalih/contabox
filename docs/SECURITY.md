# Security & Privacy Threat Model — Contabox

**Version:** 0.1
**Last updated:** 2026-05-25

---

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────┐
│  Untrusted: Web Pages (content script context)          │
│     ↕  (postMessage, data attrs)                        │
│  Semi-trusted: Content Scripts                          │
│     ↕  (runtime.sendMessage)                            │
│  Trusted: Extension Background                          │
│     ↕  (IndexedDB, Web Crypto)                          │
│  Trusted: Local Encrypted Storage                       │
└─────────────────────────────────────────────────────────┘
```

Rules:
- All messages crossing a boundary validated with Zod
- Content scripts never receive vault key material
- Web pages never see extension internals (use isolated `MAIN`/`ISOLATED` worlds correctly)

---

## Assets

| Asset | Sensitivity | Protection |
|---|---|---|
| Vault contents (passwords, TOTP secrets, proxy creds) | Critical | AES-GCM 256, PBKDF2 KDF, key in memory only |
| Snapshots (cookies, storage) | High | Optional encryption (vault key) |
| Templates | Medium | Plaintext local; encrypted if synced |
| Container metadata | Low | Plaintext local |
| Telemetry counters | Low | Not transmitted unless opt-in; no PII |

---

## Threats

### T1 — Malicious web page reads extension data
**Vector:** Content script leaks `chrome.storage` content to page via `postMessage`.

**Mitigation:**
- Content scripts use isolated world by default
- When MAIN world is required (fingerprint), expose ONLY override functions, no extension state
- Never include vault keys in any content script
- Zod-validate every message in content → background direction

### T2 — Extension supply chain compromise
**Vector:** Compromised dependency injects malicious code.

**Mitigation:**
- Lockfile pinned, integrity-checked
- Audit script (`pnpm audit`) in CI
- Renovate bot with required review before merge
- Sub-resource integrity not applicable in WebExtension; rely on AMO signing for distributed builds
- Minimize deps; prefer Web Crypto over external crypto libs

### T3 — User's local disk is read by attacker
**Vector:** Malware or shared computer reads IndexedDB files.

**Mitigation:**
- Vault entries encrypted at rest with key derived from master password
- PBKDF2 600k iterations to slow brute force
- User-controlled auto-lock timer
- Document: "Master password protects vault; lose it = lose vault data"

### T4 — Network attacker intercepts proxy credentials
**Vector:** MITM on proxy connection.

**Mitigation:**
- Recommend HTTPS proxies; warn user when using HTTP proxy with auth
- Auth credentials never logged

### T5 — Container isolation broken by extension bug
**Vector:** Bug causes proxy/fingerprint of container A to leak into container B.

**Mitigation:**
- `cookieStoreId` is the single source of truth for routing
- Engines key all state by `cookieStoreId`
- Unit tests assert no cross-container data leakage
- Manual QA per release verifies two containers don't share fingerprint hashes

### T6 — Malicious template/snapshot import
**Vector:** User imports JSON crafted to trigger code execution or DoS.

**Mitigation:**
- All imports schema-validated with Zod
- Size limits (template < 1MB, snapshot < 100MB)
- No `eval` anywhere in codebase
- CSP: `default-src 'self'; script-src 'self'; object-src 'none'`

### T7 — Fingerprint spoofing detected and exploited
**Vector:** Site detects mismatch and uses as anti-bot signal.

**Mitigation:**
- Document this risk to user — fingerprint spoofing is best-effort, not bulletproof
- Provide "real fingerprint" mode (no spoofing) for sites that punish anomalies
- Built-in anti-detect score test (post-MVP) to surface detection risk

### T8 — Extension store account compromise
**Vector:** Attacker pushes malicious update via AMO.

**Mitigation:**
- 2FA required on AMO account
- Hardware key recommended
- Signed git tags for releases
- Reproducible builds via GitHub Actions, published checksums

### T9 — Side-channel via webRequest
**Vector:** Race between proxy assignment and request emit leaks unproxied request.

**Mitigation:**
- Blocking webRequest used for header rewrite
- Proxy resolution synchronous lookup (no async DB on hot path)
- Test: first request after container creation must be proxied (no "warmup" leak)

### T10 — Master password keylogger / shoulder-surfing
**Vector:** Outside extension's control.

**Mitigation:**
- Out of scope; document in user threat model
- Recommend OS-level protections (FileVault, BitLocker)

---

## Cryptographic Choices

| Use | Algorithm | Parameters |
|---|---|---|
| Master key derivation | PBKDF2 | SHA-256, 600,000 iterations, 16-byte salt |
| Vault entry encryption | AES-GCM | 256-bit key, 12-byte IV (random per entry), 16-byte tag |
| Sync encryption (optional, post-MVP) | AES-GCM | Same, separate derived key |
| Random | `crypto.getRandomValues` | — |

No custom crypto. All operations via Web Crypto API.

---

## CSP

`manifest.json`:
```json
"content_security_policy": {
  "extension_pages": "default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:;"
}
```

`'unsafe-inline'` for styles is necessary for Tailwind's runtime utility classes; verify this is required after build — if Tailwind produces only static CSS, remove `'unsafe-inline'`.

---

## Permissions Justification

Document for AMO submission:

| Permission | Reason |
|---|---|
| `contextualIdentities` | Core: create/manage containers |
| `cookies` | Snapshot capture + cookie editor |
| `<all_urls>` | Proxy applies to all sites; user expects this for an isolation tool |
| `webRequest` + `webRequestBlocking` | Header rewrite for UA, Accept-Language |
| `proxy` | Per-container proxy |
| `scripting` | Inject fingerprint content script |
| `storage` | Local state (IndexedDB needs `unlimitedStorage`?) |
| `tabs` | Read tab's container, move tabs |
| `commands` | Keyboard shortcuts |

---

## Privacy Commitments (User-Facing)

In README and onboarding:

> **Contabox is local-first.**
> - We do not run any servers.
> - We do not collect cookies, passwords, browsing history, or URLs.
> - Telemetry is opt-in and limited to aggregate feature usage counters with no identifiers.
> - Your data lives in Firefox's local storage. You can export everything as JSON or delete the extension to remove it all.

---

## Vulnerability Disclosure

`SECURITY.md` (repo root) when public:

> Report security issues to security@<contabox-domain>.
> PGP key: <link>
> Response SLA: 48 hours acknowledge, 30 days fix or status update.
> Bounty: TBD post-funding; meanwhile public credits in CHANGELOG.

---

## Pre-Beta Security Checklist

Before tagging M8:

- [ ] Threat model reviewed and signed off
- [ ] Crypto choices reviewed by second engineer (or external audit)
- [ ] All `runtime.onMessage` handlers validate with Zod
- [ ] CSP tightened to minimum
- [ ] No `eval`, `new Function`, `innerHTML` with user input
- [ ] Vault export/import round-trip preserves integrity
- [ ] Vault wrong password resists 1000 attempts/sec (PBKDF2 cost)
- [ ] WebRTC leak verified with leak test sites
- [ ] DNS leak verified
- [ ] Manifest permissions trimmed to minimum
- [ ] Source map removal from production build (or kept private)
