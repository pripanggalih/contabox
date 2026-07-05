/**
 * Origin / domain matching helpers.
 *
 * `eTLD+1` is approximated with a "second-level domain" rule (last two labels)
 * PLUS a small hand-maintained list of common multi-label public suffixes
 * (`github.io`, `co.uk`, hosting providers, …). Without the list, credentials
 * saved against a shared suffix like `github.io` would broad-match every
 * `*.github.io` site — a real cross-site credential leak. A full Public Suffix
 * List (~30KB) would be exhaustive; this covers the practical hosting cases.
 *
 * All comparisons case-insensitive, IPv4/IPv6 hosts pass through unchanged.
 */

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6_RE = /^\[.*\]$/;

/**
 * Multi-label public suffixes under which each subdomain is an independent
 * site. A hostname equal to one of these must NEVER broad-match its
 * subdomains, and the "registrable domain" is one label deeper.
 */
const MULTI_LABEL_SUFFIXES = new Set([
  'github.io',
  'githubusercontent.com',
  'herokuapp.com',
  'herokudns.com',
  'web.app',
  'firebaseapp.com',
  'pages.dev',
  'workers.dev',
  'r2.dev',
  'vercel.app',
  'netlify.app',
  'netlify.com',
  'appspot.com',
  'azurewebsites.net',
  'cloudfront.net',
  'blogspot.com',
  'wordpress.com',
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'me.uk',
  'co.jp',
  'or.jp',
  'com.au',
  'net.au',
  'com.br',
  'co.in',
  'co.kr',
  'com.cn',
  'com.tr',
  'co.za',
]);

function isPublicSuffix(host: string): boolean {
  return MULTI_LABEL_SUFFIXES.has(host);
}

export interface ParsedOrigin {
  raw: string;
  protocol: string;
  hostname: string;
  port: string;
}

export function parseOrigin(input: string): ParsedOrigin | null {
  if (!input) return null;
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    return {
      raw: url.origin,
      protocol: url.protocol,
      hostname: url.hostname.toLowerCase(),
      port: url.port,
    };
  } catch {
    return null;
  }
}

/**
 * Match a stored entry's `origin` against a live page URL/origin.
 *
 * Rules (in order of strictness):
 *   - Empty stored origin → never match (forces explicit scope).
 *   - IP host → exact host+port match.
 *   - Both have a path beyond `/` → require startsWith on stored URL.
 *   - Same hostname → match.
 *   - Stored hostname is the second-level of live hostname (e.g. stored
 *     "github.com", live "gist.github.com") → match.
 */
export function originMatches(stored: string, candidate: string): boolean {
  const a = parseOrigin(stored);
  const b = parseOrigin(candidate);
  if (!a || !b) return false;

  // Different protocols (http vs https) usually shouldn't share creds.
  if (a.protocol !== b.protocol) return false;

  if (IPV4_RE.test(a.hostname) || IPV6_RE.test(a.hostname)) {
    return a.hostname === b.hostname && a.port === b.port;
  }

  if (a.hostname === b.hostname) return true;

  // Never let a bare public suffix ("github.io") broad-match its subdomains —
  // `alice.github.io` and `bob.github.io` are unrelated sites.
  if (isPublicSuffix(a.hostname)) return false;

  // Suffix match on dotted boundary so "github.com" matches "x.github.com"
  // but NOT "evilgithub.com".
  if (b.hostname.endsWith(`.${a.hostname}`)) return true;

  return false;
}

/**
 * Given an origin, return progressively-broader patterns to match stored
 * vault entries. Order matters: caller picks the first match.
 *
 *   "https://gist.github.com/x" →
 *     ["https://gist.github.com", "https://github.com"]
 */
export function originMatchKeys(input: string): string[] {
  const parsed = parseOrigin(input);
  if (!parsed) return [];
  // Origin already includes the port when non-default; preserve it for IP/host
  // matches so a user can scope creds to e.g. http://127.0.0.1:8080.
  const baseHost = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  const keys = [`${parsed.protocol}//${baseHost}`];
  if (!IPV4_RE.test(parsed.hostname) && !IPV6_RE.test(parsed.hostname)) {
    const labels = parsed.hostname.split('.');
    // Registrable domain = last two labels, unless those two form a known
    // multi-label public suffix, in which case it's the last three (and if the
    // host IS exactly the 3-label registrable domain there's no broader key).
    let sld = '';
    if (labels.length > 2) {
      const lastTwo = labels.slice(-2).join('.');
      if (!isPublicSuffix(lastTwo)) {
        sld = lastTwo;
      } else if (labels.length > 3) {
        sld = labels.slice(-3).join('.');
      }
    }
    if (sld && sld !== parsed.hostname) {
      keys.push(`${parsed.protocol}//${parsed.port ? `${sld}:${parsed.port}` : sld}`);
    }
  }
  return keys;
}
